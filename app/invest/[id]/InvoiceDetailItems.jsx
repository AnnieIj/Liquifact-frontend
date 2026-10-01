/**
 * @file InvoiceDetailItems.jsx
 *
 * Pure presentational component for the invoice detail section inside
 * app/invest/[id]/page.js. It owns only display logic — all loading, routing,
 * and async state live in the parent InvoiceDetail component.
 *
 * STATE INVARIANTS (must always hold):
 *   INV-1  `invoice` must be a non-null object with a string `id` before this
 *          component renders anything meaningful. All fields may be missing or
 *          malformed; the component degrades gracefully rather than throwing.
 *   INV-2  `walletState` must be a known WALLET_STATES value. Unrecognised
 *          values default to the DISCONNECTED behaviour (fund button enabled,
 *          calls onFund).
 *   INV-3  The Fund button is disabled ONLY when `isFundingDisabled` is true
 *          (CONNECTING or NO_WALLET). It is never disabled for other wallet
 *          states, including ERROR — the user can always attempt to fund.
 *   INV-4  All user-visible strings come from copy.investDetail — no inline
 *          hard-coded copy is permitted.
 *   INV-5  Numeric and string fields are sanitized through safeField() before
 *          rendering. HTML-special characters (<, >, {, }, ", ') are stripped
 *          so attacker-controlled issuer/amount values cannot inject markup.
 *   INV-6  Yield values are formatted to show a "%" suffix when numeric and
 *          valid; the INVALID_VALUE_FALLBACK sentinel ("—") is shown without a
 *          suffix so it is never "—%".
 *   INV-7  The component is a Server-component-safe pure function (no hooks,
 *          no side-effects). All callbacks are injected as props.
 */

import StatusPill from "@/components/StatusPill";
import { copy } from "@/app/copy/en";
import { INVALID_VALUE_FALLBACK, formatAmount, formatCurrency } from "@/lib/format/currency";

// ─── helpers ─────────────────────────────────────────────────────────────────

const MAX_DETAIL_ITEMS = 500;
const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 256;
const MAX_KIND_LENGTH = 64;
const MAX_ISSUER_LENGTH = 256;

/**
 * Validation invariants for invoice detail items.
 *
 * A detail item is considered valid iff:
 *   - it is a non-null object
 *   - `id` is a non-empty string of length <= MAX_ID_LENGTH
 *   - `name` is a non-empty string of length <= MAX_NAME_LENGTH
 *   - `kind`, when present, is a string of length <= MAX_KIND_LENGTH
 *   - `issuer`, when present, is a string of length <= MAX_ISSUER_LENGTH
 *
 * Duplicates are detected by `id`. The first occurrence wins; later
 * duplicates are dropped so downstream selection/delete operations cannot
 * act on ambiguous identities.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
export function isValidDetailItem(item) {
  if (!item || typeof item !== "object") return false;
  if (typeof item.id !== "string") return false;
  const id = item.id.trim();
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return false;
  if (typeof item.name !== "string") return false;
  // eslint-disable-next-line no-unused-vars
  const name = item.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  if (item.kind !== undefined && item.kind !== null) {
    if (typeof item.kind !== "string" || item.kind.length > MAX_KIND_LENGTH) return false;
  }
  if (item.issuer !== undefined && item.issuer !== null) {
    if (typeof item.issuer !== "string" || item.issuer.length > MAX_ISSUER_LENGTH) return false;
  }
  return true;
}

/**
 * Normalize and validate a list of detail items.
 * Returns `{ items, rejected }` where `rejected` is the count of dropped
 * entries (invalid shape, out-of-bound fields, or duplicate ids).
 *
 * @param {unknown} rawItems
 * @returns {{ items: Array<object>, rejected: number }}
 */
export function sanitizeDetailItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return { items: [], rejected: 0 };
  }
  const seen = new Set();
  const items = [];
  let rejected = 0;
  for (const raw of rawItems) {
    if (!isValidDetailItem(raw)) {
      rejected += 1;
      continue;
    }
    const id = raw.id.trim();
    if (seen.has(id)) {
      rejected += 1;
      continue;
    }
    if (items.length >= MAX_DETAIL_ITEMS) {
      rejected += 1;
      continue;
    }
    seen.add(id);
    items.push({
      ...raw,
      id,
      name: raw.name.trim(),
      kind: raw.kind == null ? raw.kind : raw.kind,
      issuer: raw.issuer == null ? raw.issuer : raw.issuer,
    });
  }
  return { items, rejected };
}

/**
 * Strip HTML-special characters from any value, converting it to a safe
 * display string. Returns an empty string for null / undefined.
 *
 * @param {unknown} value
 * @returns {string}
 */
function safeField(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .replace(/[<>{}"']/g, "");
}

/**
 * Format a yield value: append "%" when the formatted amount is a valid
 * number; return the fallback sentinel as-is so it never becomes "—%".
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatYield(value) {
  const formatted = formatAmount(value);
  return formatted === INVALID_VALUE_FALLBACK ? formatted : `${formatted}%`;
}

// ─── component ───────────────────────────────────────────────────────────────

/**
 * Renders the invoice detail definition list and action buttons.
 *
 * @param {object}   props
 * @param {object}   props.invoice          - The loaded invoice object.
 * @param {string}   props.invoice.id       - Unique invoice identifier.
 * @param {string}   [props.invoice.issuer]
 * @param {string|number} [props.invoice.amount]
 * @param {string}   [props.invoice.currency]
 * @param {string}   [props.invoice.dueDate]
 * @param {string|number} [props.invoice.yield]
 * @param {string}   [props.invoice.status]
 * @param {boolean}  props.isFundingDisabled - True when wallet is CONNECTING or NO_WALLET.
 * @param {function} props.onFund           - Called when the Fund button is clicked.
 * @param {function} props.onCopyLink       - Called when Copy link is clicked.
 * @param {function} props.onPrint          - Called when Print is clicked.
 */
export default function InvoiceDetailItems({
  invoice,
  isFundingDisabled = false,
  onFund,
  onCopyLink,
  onPrint,
}) {
  // INV-1: hard guard — callers must not render this without a loaded invoice.
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  // Sanitize every displayed field (INV-5).
  const issuer = safeField(invoice.issuer);
  const currency = safeField(invoice.currency);
  const dueDate = safeField(invoice.dueDate);
  const status = safeField(invoice.status);

  // Format amount with full currency formatting helper.
  const formattedAmount = formatCurrency(invoice.amount, { currency });

  // Format yield with sentinel guard (INV-6).
  const formattedYield = formatYield(invoice.yield);

  const d = copy.investDetail;

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return (
    <>
      {/* ── Invoice fact sheet ─────────────────────────────────────────── */}
      <section
        aria-labelledby="invoice-summary-heading"
        className="print-invoice-section rounded-xl border border-slate-800 bg-slate-900/50 p-6 mb-6"
      >
        <h2 id="invoice-summary-heading" className="text-xl font-semibold mb-4">
          {issuer || d.dtIssuer}
        </h2>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">{d.dtIssuer}</dt>
            <dd className="text-slate-100">{issuer || "—"}</dd>
          </div>

          <div>
            <dt className="text-slate-500">{d.dtAmount}</dt>
            <dd className="text-slate-100">{formattedAmount}</dd>
          </div>

          <div>
            <dt className="text-slate-500">{d.dtYield}</dt>
            <dd className="text-slate-100">{formattedYield}</dd>
          </div>

          <div>
            <dt className="text-slate-500">{d.dtMaturity}</dt>
            <dd className="text-slate-100">{dueDate || "—"}</dd>
          </div>

          <div>
            <dt className="text-slate-500">{d.dtStatus}</dt>
            <dd className="text-slate-100">
              {/* StatusPill tolerates empty / unknown strings (INV-2). */}
              <StatusPill status={status} />
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div className="no-print flex flex-wrap gap-3">
        {/* Fund — disabled when wallet is CONNECTING or NO_WALLET (INV-3). */}
        <button
          type="button"
          onClick={onFund}
          disabled={isFundingDisabled}
          className="rounded-full bg-cyan-500/20 text-cyan-400 px-6 py-3 text-sm font-medium hover:bg-cyan-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={d.fundButtonAriaLabel}
        >
          {d.fundButton}
        </button>

        {/* Copy link */}
        <button
          type="button"
          onClick={onCopyLink}
          className="rounded-full border border-slate-700 text-slate-300 px-6 py-3 text-sm font-medium hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-cyan-500"
          aria-label={d.copyLinkAriaLabel}
        >
          {d.copyLinkButton}
        </button>

        {/* Print / Save PDF */}
        <button
          type="button"
          onClick={onPrint}
          className="rounded-full border border-slate-700 text-slate-300 px-6 py-3 text-sm font-medium hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-cyan-500"
          aria-label={d.printAriaLabel}
        >
          {d.printButton}
        </button>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────────────── */}
      <div className="no-print mt-6 rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-300">
        {d.disclaimer}
      </div>
    </>
  );
}
