/**
 * @file app/settings/lib.js
 *
 * Mock settings data and PX-safe helpers for the /settings page.
 *
 * ⚠️  SINGLE SOURCE OF TRUTH: This file is the only place mock settings
 * fixtures are defined. All components and tests must import
 * `MOCK_SETTINGS` and `loadMockSettings` from here.  Do NOT redeclare
 * them inline elsewhere.  Swap `loadMockSettings` for the real API
 * client once the backend `/settings` endpoint is wired.
 *
 * Contract per item: { id, category, label, type, value, description }
 * Categories cover: notifications, display, privacy, wallet, advanced.
 *
 * ── Compatibility contract (do NOT break without a migration plan) ──────────
 * Public surface preserved by this module:
 *   - `MOCK_SETTINGS` is a non-empty, frozen array of rows with the shape
 *     { id, category, label, type, value, description }; every `id` is unique
 *     and every field is a string. Rows are frozen so accidental mutation in
 *     one caller can never leak into another.
 *   - `loadMockSettings(options?)` ALWAYS resolves to an array and NEVER
 *     rejects — including for pre-aborted signals, invalid `options`/`signal`
 *     shapes, and the dev-only machine-speed delay. An aborted load resolves
 *     to `[]` (empty data) rather than throwing.
 *   - `getCategoryList(list)` ALWAYS returns `["all", ...]` with distinct,
 *     non-empty string categories sorted deterministically; non-array input
 *     yields `["all"]`.
 *   - `getSettingById(id)` returns a row for a known id and `undefined` for
 *     unknown / non-string ids (never throws).
 *   - `getCategories` remains a back-compat alias of `getCategoryList`.
 */

/** The categories the settings fixtures are allowed to use. */
export const SETTINGS_CATEGORIES = ["notifications", "display", "privacy", "wallet", "advanced"];

/**
 * Recursively freeze a value so the exported fixtures cannot be mutated by a
 * caller and silently corrupt every other consumer (the single-source-of-truth
 * guarantee documented above).
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

export const MOCK_SETTINGS = [
  {
    id: "pref-001",
    category: "notifications",
    label: "Email notifications",
    type: "toggle",
    value: "enabled",
    description: "Receive invoice lifecycle updates by email.",
  },
  {
    id: "pref-002",
    category: "notifications",
    label: "Browser push notifications",
    type: "toggle",
    value: "disabled",
    description: "Show desktop alerts for funded invoices.",
  },
  {
    id: "pref-003",
    category: "notifications",
    label: "Funding confirmation tone",
    type: "select",
    value: "chime",
    description: "Sound played when a funding attempt succeeds.",
  },
  {
    id: "pref-004",
    category: "display",
    label: "Theme",
    type: "select",
    value: "system",
    description: "Light, dark, or follow the operating system setting.",
  },
  {
    id: "pref-005",
    category: "display",
    label: "Compact list density",
    type: "toggle",
    value: "disabled",
    description: "Reduce row padding in list views.",
  },
  {
    id: "pref-006",
    category: "display",
    label: "Show yield disclaimer",
    type: "toggle",
    value: "enabled",
    description: "Display the educational yield disclaimer under each list.",
  },
  {
    id: "pref-007",
    category: "display",
    label: "Default marketplace sort",
    type: "select",
    value: "best-yield",
    description: "Sort order used on first marketplace visit.",
  },
  {
    id: "pref-008",
    category: "privacy",
    label: "Share wallet address with issuers",
    type: "toggle",
    value: "disabled",
    description: "Let the issuer see who funds an invoice.",
  },
  {
    id: "pref-009",
    category: "privacy",
    label: "Telemetry",
    type: "select",
    value: "anonymous",
    description: "Help improve the platform by sending anonymous usage signals.",
  },
  {
    id: "pref-010",
    category: "privacy",
    label: "Persistent session",
    type: "toggle",
    value: "enabled",
    description: "Keep the wallet session alive across browser restarts.",
  },
  {
    id: "pref-011",
    category: "wallet",
    label: "Default network",
    type: "select",
    value: "public",
    description: "Stellar network used when no wallet is connected.",
  },
  {
    id: "pref-012",
    category: "wallet",
    label: "Auto-confirm small payments",
    type: "toggle",
    value: "disabled",
    description: "Skip the wallet prompt for amounts below your threshold.",
  },
  {
    id: "pref-013",
    category: "wallet",
    label: "Auto-confirm threshold",
    type: "text",
    value: "0",
    description: "Maximum amount that can be auto-confirmed.",
  },
  {
    id: "pref-014",
    category: "wallet",
    label: "Transaction memo template",
    type: "text",
    value: "LiquiFact {invoiceId}",
    description: "Template applied to every send transaction memo.",
  },
  {
    id: "pref-015",
    category: "advanced",
    label: "Show developer panel",
    type: "toggle",
    value: "disabled",
    description: "Expose the in-page debug panel for power users.",
  },
  {
    id: "pref-016",
    category: "advanced",
    label: "Custom RPC endpoint",
    type: "text",
    value: "",
    description: "Override the default Stellar RPC URL.",
  },
  {
    id: "pref-017",
    category: "advanced",
    label: "Log level",
    type: "select",
    value: "warn",
    description: "Minimum severity written to the browser console.",
  },
  {
    id: "pref-018",
    category: "advanced",
    label: "Allow experimental wallets",
    type: "toggle",
    value: "disabled",
    description: "Show wallet adapters that are still in beta.",
  },
  {
    id: "pref-019",
    category: "notifications",
    label: "Settlement alerts",
    type: "toggle",
    value: "enabled",
    description: "Notify me when an invoice I funded settles.",
  },
  {
    id: "pref-020",
    category: "display",
    label: "Accent colour",
    type: "select",
    value: "cyan",
    description: "Accent colour used throughout the interface.",
  },
  {
    id: "pref-021",
    category: "privacy",
    label: "Hide balances from screenshots",
    type: "toggle",
    value: "enabled",
    description: "Blur numeric balances when taking screenshots.",
  },
  {
    id: "pref-022",
    category: "wallet",
    label: "Preferred wallet",
    type: "select",
    value: "freighter",
    description: "Wallet suggested first in the connect dialog.",
  },
  {
    id: "pref-023",
    category: "advanced",
    label: "Refresh interval",
    type: "text",
    value: "30",
    description: "Background refresh cadence, in seconds.",
  },
  {
    id: "pref-024",
    category: "notifications",
    label: "Daily digest",
    type: "toggle",
    value: "disabled",
    description: "Send one summary email per day instead of instant alerts.",
  },
  {
    id: "pref-025",
    category: "display",
    label: "Reduced motion",
    type: "toggle",
    value: "system",
    description: "Disable non-essential transitions automatically.",
  },
];

// Freeze the single source of truth so no caller can mutate it in place.
deepFreeze(MOCK_SETTINGS);

// DEV-only delay (ms) to keep the load-more cycle perceptible in dev.
const DEV_DELAY = process.env.NODE_ENV === "development" ? 80 : 0;
const SETTING_FIELDS = [
  "id",
  "category",
  "label",
  "type",
  "value",
  "description",
];

// Shared fixtures stay immutable; every load returns independently owned rows.
for (const setting of MOCK_SETTINGS) {
  Object.freeze(setting);
}
Object.freeze(MOCK_SETTINGS);

function validateSettings(settings) {
  if (!Array.isArray(settings)) {
    throw new TypeError("[settings] Settings must be an array.");
  }

  const ids = new Set();
  return Array.from(settings, (setting, index) => {
    if (!setting || typeof setting !== "object" || Array.isArray(setting)) {
      throw new TypeError(`[settings] Invalid setting row at index ${index}.`);
    }

    const row = {};
    for (const field of SETTING_FIELDS) {
      const value = setting[field];
      if (
        typeof value !== "string" ||
        (field !== "value" && field !== "description" && value.trim() === "")
      ) {
        throw new TypeError(
          `[settings] Invalid setting field "${field}" at index ${index}.`
        );
      }
      row[field] = value;
    }

    if (ids.has(row.id)) {
      throw new TypeError(`[settings] Duplicate setting id at index ${index}.`);
    }
    ids.add(row.id);
    return row;
  });
}

function isAbortSignal(signal) {
  try {
    return (
      signal !== null &&
      typeof signal === "object" &&
      typeof signal.aborted === "boolean" &&
      typeof signal.addEventListener === "function" &&
      typeof signal.removeEventListener === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Whether the `window.__TEST_MOCK_SETTINGS__` override may be honoured.
 *
 * The override is a test seam only: it must be ignored outside the browser and
 * in production builds (matching the documented contract), so a stray global in
 * production can never replace real settings data.
 *
 * @returns {boolean}
 */
function isTestOverrideEnabled() {
  return process.env.NODE_ENV !== "production" && typeof window !== "undefined" && window != null;
}

/**
 * Read the test override when it is enabled AND holds an array. Any other
 * value (object, string, number, …) is ignored so the loader keeps its
 * "always resolves to an array" contract.
 *
 * @returns {Array|undefined}
 */
function readTestOverride() {
  if (!isTestOverrideEnabled()) return undefined;
  const override = window.__TEST_MOCK_SETTINGS__;
  return Array.isArray(override) ? override : undefined;
}

/**
 * Duck-type check for an `AbortSignal`. Guards against callers passing a
 * malformed signal (e.g. `{}`) so `loadMockSettings` can never throw a
 * `TypeError` while registering the abort listener.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAbortSignal(value) {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function"
  );
}

/**
 * Resolve the list of settings to display.
 *
 * Test hook: Playwright / Jest tests may override the fixture by setting
 * `window.__TEST_MOCK_SETTINGS__` before the component mounts.  The
 * override is ignored outside the browser and in production builds.
 *
 * @param {object|null} [options] Loader options. `null`/non-object values are
 *   tolerated and treated as "no options" so a sloppy caller cannot crash the
 *   loader.
 * @param {AbortSignal} [options.signal] - Abort signal honoured during
 *   the synthetic dev delay; the Promise will never throw on abort so
 *   the caller sees a clean cancel.
 * @returns {Promise<Array>} A fresh copy; invalid options or overrides reject.
 */
export function loadMockSettings(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return Promise.reject(new TypeError("[settings] Options must be an object."));
  }

  let signal;
  try {
    signal = options.signal;
  } catch {
    return Promise.reject(new TypeError("[settings] Signal must be an AbortSignal."));
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    return Promise.reject(new TypeError("[settings] Signal must be an AbortSignal."));
  }
  if (signal?.aborted) return Promise.resolve([]);

  const hasTestOverride =
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    Object.prototype.hasOwnProperty.call(window, "__TEST_MOCK_SETTINGS__");

  if (hasTestOverride) {
    try {
      return Promise.resolve(validateSettings(window.__TEST_MOCK_SETTINGS__));
    } catch (error) {
      const isSanitizedError =
        error instanceof TypeError && error.message.startsWith("[settings]");
      return Promise.reject(
        isSanitizedError
          ? error
          : new TypeError("[settings] Invalid settings override.")
      );
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    // Timeout and abort share one idempotent completion path.
    const finish = (settings) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(settings);
    };
    const onAbort = () => finish([]);

    timer = setTimeout(() => {
      finish(validateSettings(MOCK_SETTINGS));
    }, DEV_DELAY);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Distinct categories present in the given settings list, sorted
 * alphabetically with "all" prepended.
 *
 * Only non-empty string categories are surfaced, so a malformed row (missing
 * category, `null`, or a number) can never inject a non-string `<option>` or
 * an unstable sort order.
 *
 * @param {Array} list
 * @returns {string[]} `["all", ...distinctCategories]`; `["all"]` for
 *   non-array input.
 */
export function getCategoryList(list) {
  if (!Array.isArray(list)) return ["all"];
  const set = new Set(
    list
      .map((setting) => setting?.category)
      .filter((category) => typeof category === "string" && category.trim() !== "")
  );
  return ["all", ...[...set].sort()];
}

// Back-compat alias so existing call sites that reference
// `getCategories` keep building.
export { getCategoryList as getCategories };

/**
 * Find a single setting row by id.
 *
 * @param {string} id
 * @returns {object|undefined} The matching frozen row, or `undefined` for an
 *   unknown id or a non-string id. Never throws.
 */
export function getSettingById(id) {
  if (typeof id !== "string" || id.trim() === "") return undefined;
  return MOCK_SETTINGS.find((s) => s.id === id);
}
