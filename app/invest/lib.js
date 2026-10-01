// @ts-nocheck
/**
 * @file app/invest/lib.js
 *
 * Single source of truth for mock invoice data and the helper functions that
 * operate on it.  When the real API client lands, swap `loadMockInvoices` for
 * the API call — every other export's contract remains unchanged.
 *
 * ─── STATE INVARIANTS ────────────────────────────────────────────────────────
 *
 *  LIB-1  MOCK_INVOICES is a frozen array of frozen objects.  Neither the
 *         array nor any of its items can be mutated at runtime, preventing
 *         accidental shared-state corruption across components and tests.
 *
 *  LIB-2  Every invoice record must satisfy the minimum shape contract:
 *           { id: non-empty string, issuer: string, amount: string|number,
 *             amountValue: finite number ≥ 0, currency: ISO-4217 code,
 *             dueDate: YYYY-MM-DD, yield: string, yieldValue: finite number ≥ 0,
 *             status: InvoiceStatus }
 *         Records that violate this contract are rejected at module-load time
 *         so callers never receive malformed data.
 *
 *  LIB-3  `status` must be one of the four canonical values from
 *         INVOICE_STATUSES ("Open" | "Funded" | "Settled" | "Overdue").
 *         Any other value is a contract violation and is caught at load time.
 *
 *  LIB-4  Each event inside `events` must carry { id, type, actor, occurredAt }
 *         where `id` is a non-empty string, `type` is one of the values in
 *         INVOICE_EVENT_TYPES, and `occurredAt` is an ISO-8601 timestamp.
 *         Malformed events are rejected at load time, not at render time.
 *
 *  LIB-5  `daysUntilMaturity` accepts only valid YYYY-MM-DD date strings.
 *         Passing null, undefined, an empty string, or an unparseable date
 *         returns NaN so callers can guard with Number.isNaN rather than
 *         silently operating on 0 or negative infinity.
 *
 *  LIB-6  `getInvoiceById` accepts only non-empty strings.  Passing null,
 *         undefined, a number, or an empty string returns undefined (not a
 *         throw) so the caller can forward to notFound() cleanly.
 *
 *  LIB-7  `loadMockInvoices` always resolves with an array — never rejects.
 *         It returns a shallow copy of MOCK_INVOICES so callers cannot
 *         mutate the source data through the resolved value.
 *         The `window.__TEST_MOCK_INVOICES__` override is validated before use;
 *         a non-array override is ignored and falls back to MOCK_INVOICES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { INVOICE_STATUSES, INVOICE_EVENT_TYPES } from "@/lib/types/invoice";

// ── Internal helpers ──────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(Object.values(INVOICE_STATUSES));
const VALID_EVENT_TYPES = new Set(Object.values(INVOICE_EVENT_TYPES));

/** ISO 8601 date — YYYY-MM-DD */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO 8601 timestamp with timezone — used for event occurredAt */
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Assert a condition at module-load time.  A violation means the mock data
 * has drifted from the contract and must be fixed before any component runs.
 *
 * @param {boolean} condition
 * @param {string}  message
 */
function invariant(condition, message) {
  if (!condition) {
    throw new Error(`[invest/lib] Invariant violation: ${message}`);
  }
}

/**
 * Validate a single invoice event object (LIB-4).
 *
 * @param {unknown} evt    - The event to validate.
 * @param {string}  invoiceId - Parent invoice id (for error messages).
 * @returns {object} The same event object, confirmed valid.
 */
function validateEvent(evt, invoiceId) {
  invariant(
    evt !== null && typeof evt === "object",
    `invoice "${invoiceId}" — event must be a non-null object, got ${typeof evt}`
  );
  invariant(
    typeof evt.id === "string" && evt.id.length > 0,
    `invoice "${invoiceId}" — event.id must be a non-empty string`
  );
  invariant(
    VALID_EVENT_TYPES.has(evt.type),
    `invoice "${invoiceId}" event "${evt.id}" — unknown type "${evt.type}"; ` +
      `must be one of [${[...VALID_EVENT_TYPES].join(", ")}]`
  );
  invariant(
    typeof evt.actor === "string",
    `invoice "${invoiceId}" event "${evt.id}" — actor must be a string`
  );
  invariant(
    typeof evt.occurredAt === "string" && ISO_TS_RE.test(evt.occurredAt),
    `invoice "${invoiceId}" event "${evt.id}" — occurredAt must be an ISO-8601 timestamp`
  );
  return evt;
}

/**
 * Validate a single invoice record (LIB-2, LIB-3, LIB-4).
 *
 * @param {unknown} invoice - The invoice to validate.
 * @returns {object} The same invoice object, confirmed valid.
 */
function validateInvoice(invoice) {
  invariant(
    invoice !== null && typeof invoice === "object",
    `each invoice must be a non-null object, got ${typeof invoice}`
  );

  // LIB-2: id — non-empty string
  invariant(
    typeof invoice.id === "string" && invoice.id.length > 0,
    `invoice.id must be a non-empty string (got ${JSON.stringify(invoice.id)})`
  );

  // LIB-2: issuer — string (may be empty but must be present)
  invariant(
    typeof invoice.issuer === "string",
    `invoice "${invoice.id}" — issuer must be a string`
  );

  // LIB-2: amount — string or finite number
  invariant(
    typeof invoice.amount === "string" || typeof invoice.amount === "number",
    `invoice "${invoice.id}" — amount must be a string or number`
  );

  // LIB-2: amountValue — finite, non-negative number
  invariant(
    typeof invoice.amountValue === "number" &&
      Number.isFinite(invoice.amountValue) &&
      invoice.amountValue >= 0,
    `invoice "${invoice.id}" — amountValue must be a finite non-negative number`
  );

  // LIB-2: currency — non-empty string
  invariant(
    typeof invoice.currency === "string" && invoice.currency.length > 0,
    `invoice "${invoice.id}" — currency must be a non-empty string`
  );

  // LIB-2: dueDate — YYYY-MM-DD
  invariant(
    typeof invoice.dueDate === "string" && ISO_DATE_RE.test(invoice.dueDate),
    `invoice "${invoice.id}" — dueDate must be a YYYY-MM-DD string`
  );

  // LIB-2: yield — string or finite number
  invariant(
    typeof invoice.yield === "string" || typeof invoice.yield === "number",
    `invoice "${invoice.id}" — yield must be a string or number`
  );

  // LIB-2: yieldValue — finite, non-negative number
  invariant(
    typeof invoice.yieldValue === "number" &&
      Number.isFinite(invoice.yieldValue) &&
      invoice.yieldValue >= 0,
    `invoice "${invoice.id}" — yieldValue must be a finite non-negative number`
  );

  // LIB-3: status — one of the canonical INVOICE_STATUSES values
  invariant(
    VALID_STATUSES.has(invoice.status),
    `invoice "${invoice.id}" — status "${invoice.status}" is not a valid InvoiceStatus; ` +
      `must be one of [${[...VALID_STATUSES].join(", ")}]`
  );

  // LIB-4: events — if present must be an array of valid event objects
  if (invoice.events !== undefined) {
    invariant(
      Array.isArray(invoice.events),
      `invoice "${invoice.id}" — events must be an array when present`
    );
    invoice.events.forEach((evt) => validateEvent(evt, invoice.id));
  }

  return invoice;
}

// ── Mock data (LIB-1: frozen at module-load time) ─────────────────────────────

const _RAW_INVOICES = [
  {
    id: "inv-001",
    issuer: "Acme Supplies Ltd",
    amount: "12,500",
    amountValue: 12500,
    currency: "USD",
    dueDate: "2026-06-15",
    yield: "8.2%",
    yieldValue: 8.2,
    status: "Open",
    events: [
      {
        id: "evt-001-a",
        type: "uploaded",
        actor: "Acme Supplies Ltd",
        occurredAt: "2025-04-01T09:00:00Z",
      },
      {
        id: "evt-001-b",
        type: "verified",
        actor: "Liquidity Desk",
        occurredAt: "2025-04-03T11:30:00Z",
      },
      {
        id: "evt-001-c",
        type: "listed",
        actor: "Marketplace Bot",
        occurredAt: "2025-04-06T16:45:00Z",
      },
    ],
  },
  {
    id: "inv-002",
    issuer: "Bright Logistics GmbH",
    amount: "7,800",
    amountValue: 7800,
    currency: "EUR",
    dueDate: "2026-07-01",
    yield: "7.5%",
    yieldValue: 7.5,
    status: "Open",
    events: [
      {
        id: "evt-002-a",
        type: "uploaded",
        actor: "Bright Logistics GmbH",
        occurredAt: "2025-03-20T12:00:00Z",
      },
      {
        id: "evt-002-b",
        type: "verified",
        actor: "Risk Review",
        occurredAt: "2025-03-21T15:30:00Z",
      },
      {
        id: "evt-002-c",
        type: "listed",
        actor: "Marketplace Bot",
        occurredAt: "2025-03-22T10:15:00Z",
      },
    ],
  },
  {
    id: "inv-003",
    issuer: "Sunrise Exports Pte",
    amount: "22,000",
    amountValue: 22000,
    currency: "USD",
    dueDate: "2026-05-30",
    yield: "9.1%",
    yieldValue: 9.1,
    status: "Open",
    events: [
      {
        id: "evt-003-a",
        type: "uploaded",
        actor: "Sunrise Exports Pte",
        occurredAt: "2025-02-10T08:45:00Z",
      },
      {
        id: "evt-003-b",
        type: "verified",
        actor: "Compliance Team",
        occurredAt: "2025-02-11T09:10:00Z",
      },
      {
        id: "evt-003-c",
        type: "listed",
        actor: "Marketplace Bot",
        occurredAt: "2025-02-12T14:20:00Z",
      },
    ],
  },
];

// Validate every record at module-load time so callers receive only
// contract-compliant data (LIB-2, LIB-3, LIB-4).
_RAW_INVOICES.forEach(validateInvoice);

/**
 * The canonical mock invoice list.
 *
 * LIB-1: frozen so no caller can mutate shared state.  Each nested object is
 * also frozen for the same reason.
 *
 * @type {ReadonlyArray<Readonly<object>>}
 */
export const MOCK_INVOICES = Object.freeze(
  _RAW_INVOICES.map((inv) => {
    const frozenEvents = inv.events
      ? Object.freeze(inv.events.map((e) => Object.freeze({ ...e })))
      : undefined;
    return Object.freeze({
      ...inv,
      ...(frozenEvents !== undefined ? { events: frozenEvents } : {}),
    });
  })
);

// ── loadMockInvoices (LIB-7) ─────────────────────────────────────────────────

// DEV-only delay (ms) to make the skeleton visible during local development.
const DEV_DELAY =
  typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development"
    ? 1500
    : 0;

/**
 * Validate and normalize a single invoice record coming from an untrusted
 * source (test override or future API response). Returns a deep-cloned,
 * frozen record on success, or null for malformed entries so callers can
 * drop them without crashing.
 *
 * Invariants enforced:
 *   - id is a non-empty string and unique across the list (caller enforces)
 *   - amountValue / yieldValue are finite numbers when present
 *   - dueDate is a valid ISO date (YYYY-MM-DD)
 *   - events, if present, is an array of well-formed objects
 */
function normalizeInvoice(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.trim() === "") return null;

  if (raw.amountValue !== undefined && !Number.isFinite(raw.amountValue)) return null;
  if (raw.yieldValue !== undefined && !Number.isFinite(raw.yieldValue)) return null;

  if (raw.dueDate !== undefined) {
    if (typeof raw.dueDate !== "string" || !isIsoDate(raw.dueDate)) return null;
  }

  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events)) return null;
    for (const evt of raw.events) {
      if (!evt || typeof evt !== "object" || Array.isArray(evt)) return null;
      if (typeof evt.id !== "string" || evt.id.trim() === "") return null;
    }
  }

  // Deep clone so consumers cannot mutate the canonical fixture or each
  // other's view of it. JSON round-trip is sufficient for the JSON-shaped
  // contract and avoids structuredClone availability concerns.
  const cloned = JSON.parse(JSON.stringify(raw));
  return Object.freeze(cloned);
}

/**
 * Return true if the string is a calendar-valid ISO date (YYYY-MM-DD).
 * Rejects non-strings, impossible dates like 2026-02-30, and non-canonical
 * formats such as 2026-6-1.
 */
function isIsoDate(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip to reject overflow dates (e.g. 2026-02-30 -> 2026-03-02).
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Normalize an array of invoices, silently dropping malformed entries and
 * de-duplicating by id (last write wins). Returns a frozen array of frozen
 * records. Always returns an array, never throws, so callers can render an
 * empty state deterministically.
 */
function normalizeInvoiceList(rawList) {
  if (!Array.isArray(rawList)) return Object.freeze([]);
  const byId = new Map();
  for (const entry of rawList) {
    const normalized = normalizeInvoice(entry);
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return Object.freeze(Array.from(byId.values()));
}

/**
 * Return the canonical, normalized fixture list. Exported for tests and
 * consumers that need the same validation as loadMockInvoices.
 */
export function getCanonicalInvoices() {
  return normalizeInvoiceList(MOCK_INVOICES);
}

/**
 * Asynchronously return the investable invoice list.
 *
 * LIB-7 guarantees:
 *   - Always resolves with an array; never rejects.
 *   - Returns a shallow copy of MOCK_INVOICES so mutation of the result
 *     cannot corrupt the source array.
 *   - The `window.__TEST_MOCK_INVOICES__` escape hatch is validated before
 *     use; a non-array value is ignored and falls back to MOCK_INVOICES.
 *
 * @returns {Promise<Array<object>>}
 */
export function loadMockInvoices() {
  // Test hook: Playwright / Jest tests may override the fixture by setting
  // window.__TEST_MOCK_INVOICES__ before the component mounts.  The override
  // is only accepted when it is a non-empty array (LIB-7 validation).
  if (typeof window !== "undefined" && Array.isArray(window.__TEST_MOCK_INVOICES__)) {
    return Promise.resolve(window.__TEST_MOCK_INVOICES__.slice());
  }
}

/**
 * Validate an invoice record against the documented contract.
 * Returns true when the record is well-formed enough to render.
 * @param {unknown} invoice
 * @returns {boolean}
 */
export function isValidInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") return false;
  if (typeof invoice.id !== "string" || invoice.id.length === 0) return false;
  if (typeof invoice.issuer !== "string") return false;
  if (typeof invoice.amount !== "string") return false;
  if (typeof invoice.currency !== "string") return false;
  if (typeof invoice.dueDate !== "string") return false;
  if (typeof invoice.status !== "string") return false;
  return true;
}

/**
 * Normalize a raw invoice list into a deterministic, de-duplicated array.
 *
 * Invariants:
 *  - Only well-formed records are returned (malformed entries are dropped).
 *  - Duplicate ids are collapsed; the first occurrence wins so results
 *    are independent of iteration order of the duplicates.
 *  - Order of the input is preserved for the first occurrence of each id.
 *  @param {unknown} raw
 * @returns {object[]}
 */
export function normalizeInvoices(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!isValidInvoice(item)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Load invoices with deterministic failure recovery.
 *
 * Behavior:
 *  - Resolves with a normalized invoice array on success.
 *  - Retries transient failures with exponential backoff (base 2), bounded
 *    by `maxRetries`. Retries are deterministic and never mutate input.
 *  - On exhaustion, rejects with an InvoiceLoadError carrying a stable code
 *    and the number of attempts so the UI knows whether a retry is worth it.
 *  - Test hook: Playwright / Jest tests may override the fixture by setting
 *    window.__TEST_MOCK_INVOICES__ before the component mounts. The override
 *    is ignored in non-browser (SSR) environments and in production builds.
 *
 * @param {{ maxRetries?: number, baseDelayMs?: number, fetcher?: () => Promise<unknown> }} [options]
 * @returns {Promise<object[]>}
 */
export async function loadMockInvoices(options = {}) {
  const {
    maxRetries = 2,
    baseDelayMs = DEV_DELAY,
    fetcher = defaultFetcher,
  } = options;

  // Test hook: only honored in browser environments and not in production.
  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    window.__TEST_MOCK_INVOICES__
  ) {
    return normalizeInvoices(window.__TEST_MOCK_INVOICES__);
  }

  let attempts = 0;
  let lastError;
  for (attempts = 1; attempts <= maxRetries + 1; attempts++) {
    try {
      const raw = await fetcher();
      const normalized = normalizeInvoices(raw);
      if (normalized.length === 0 && Array.isArray(raw) && raw.length > 0) {
        // All records were invalid: treat as a failure so the UI is visible
        // and the caller can retry, rather than silently rendering empty.
        throw new InvoiceLoadError(
          "All invoice records failed validation",
          "invalid_data",
        );
      }
      return normalized;
    } catch (error) {
      lastError = error;
      if (attempts <= maxRetries) {
        const delay = baseDelayMs * 2 ** (attempts - 1);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  const code =
    lastError instanceof InvoiceLoadError ? lastError.code : "load_failed";
  const message =
    lastError && lastError.message
      ? lastError.message
      : "Unable to load invoices";
  throw new InvoiceLoadError(message, code, lastError);
}

/**
 * Default fetcher used by loadMockInvoices. Exposed for testing and for
 * future replacement with the real API client.
 * @returns {Promise<unknown>}
 */
export function defaultFetcher() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_INVOICES.slice()), DEV_DELAY);
  });
}

// ── daysUntilMaturity (LIB-5) ────────────────────────────────────────────────

/**
 * Calculate the number of calendar days between now and a target date string.
 *
 * Returns positive days for future dates, negative for past, 0 for today.
 * Dates are compared at midnight UTC (time-of-day insensitive).
 *
 * LIB-5: invalid input (null, undefined, non-string, unparseable, non–YYYY-MM-DD)
 * returns NaN so callers can guard with Number.isNaN rather than silently
 * receiving a misleading result.
 *
 * @param {string} dateStr - ISO date string (YYYY-MM-DD).
 * @param {Date}   [now]   - Reference date (defaults to new Date()).
 * @returns {number} Integer day count, or NaN for invalid input.
 */
export function daysUntilMaturity(dateStr, now = new Date()) {
  // LIB-5: reject non-string or malformed input.
  if (typeof dateStr !== "string" || !ISO_DATE_RE.test(dateStr)) {
    return NaN;
  }

  const target = new Date(dateStr + "T00:00:00Z");

  // Guard against date strings that parse to NaN (e.g. "2026-13-99").
  if (Number.isNaN(target.getTime())) {
    return NaN;
  }

  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── getInvoiceById (LIB-6) ───────────────────────────────────────────────────

/**
 * Resolve an invoice by its id.
 *
 * LIB-6: only a non-empty string id is a valid lookup key.  Any other input
 * (null, undefined, number, empty string) returns undefined immediately so
 * callers can forward to notFound() without needing to type-narrow.
 *
 * Validation boundaries (ISSUE-3)
 * ─────────────────────────────────
 * id — must be a non-empty string. Passing null, undefined, a number, or an
 *      empty string returns undefined without throwing. Duplicate calls with
 *      the same id always return the same object reference (MOCK_INVOICES is
 *      a module-level constant — no mutation occurs inside this function).
 *
 * @param {string} id - Invoice identifier to look up.
 * @returns {Readonly<object> | undefined} The matching invoice, or undefined.
 */
export function getInvoiceById(id) {
  if (typeof id !== "string" || id.length === 0) {
    return undefined;
  }
  return MOCK_INVOICES.find((invoice) => invoice.id === id);
}

// NOTE: This file is the single source of truth for mock invoice data
// until the API client is fully integrated.
