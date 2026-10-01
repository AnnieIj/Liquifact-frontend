"use client";
"use client";

/**
 * @file app/invest/[id]/InvoiceDetailClient.jsx
 *
 * Client boundary for the density-aware invoice metadata section.
 *
 * Why a separate client component?
 * ─────────────────────────────────
 * The page shell (`page.js`) is a Server Component — it cannot use hooks.
 * Density preference is stored in `localStorage` and read via `useDensity`,
 * which requires a React hook.  Rather than converting the entire detail
 * page to a client component (losing all RCC benefits), this thin wrapper:
 *
 *   1. Accepts pre-formatted invoice values as props (all formatting stays
 *      server-side in `page.js`).
 *   2. Owns the density preference state via `useDensity` and passes it down
 *      to `DensityToggle` as controlled props so both components react to the
 *      same state without prop-drilling through multiple layers.
 *   3. Applies spacing variants to the metadata `<dl>` based on density.
 *   4. Renders the Reference row with CopyButton when `referenceId` is set.
 *   5. Supports inline editing of issuer, amount, yield, and maturity rows
 *      with save/cancel buttons, validation, keyboard shortcuts (Escape to
 *      cancel, Enter to save), and polite aria-live announcements.
 *
 * Spacing variants
 * ─────────────────
 * • compact     → `gap-2 p-4`   (tighter grid, smaller section padding)
 * • comfortable → `gap-4 p-6`   (default spacing, matches original design)
 *
 * Inline edit
 * ─────────────────────────────────
 * Each editable row has an "Edit" button (visible on hover / focus). Clicking
 * it replaces the `<dd>` with an `<input>` and Save / Cancel buttons.
 * Pressing Escape in the input cancels; pressing Enter saves (unless the field
 * is the date input, which already uses Enter for date-picker navigation).
 * Validation errors are announced via the same polite aria-live region used
 * for success / cancel confirmations.
 *
 * The `onSave` callback (optional) receives the field key and the new raw
 * value string when a save succeeds. The parent (page.js) may wire this to
 * an API call in future.
 *
 * Compatibility contract
 * ──────────────────────
 * This component is the client boundary for the invoice metadata section.
 * Its public props are a stable contract with `page.js` (a Server Component)
 * and any future callers. The following invariants are enforced:
 *
 *   1. `onSave` is optional; when absent, inline edits still update the
 *      local view and announce success. Callers that do not wire persistence
 *      must not observe a thrown error or an unhandled rejection.
 *   2. `onSave` may throw or return a rejected promise. In that case the
 *      row reverts to its previous value, an error is announced via the
 *      shared polite live region, and the component remains interactive.
 *      A failed save never leaves the row in an inconsistent "saved" state.
 *   3. `onSave` may be invoked concurrently (rapid Enter presses, multiple
 *      rows). Saves are serialized per-row via an in-flight guard so a
 *      second save cannot interleave with the first and produce a stale
 *      value. Cross-row saves are independent and may proceed in parallel.
 *   4. Raw values (`rawIssuer`, `rawAmount`, `rawYield`, `rawDueDate`) fall
 *      back to their formatted counterparts when omitted, preserving the
 *      pre-existing behavior for callers that only pass formatted values.
 *   5. `referenceId` is optional. When falsy, the Reference row is omitted
 *      entirely (no empty row, no broken CopyButton).
 *   6. `density` is owned here and mirrored to `DensityToggle` as a
 *      controlled prop. Unknown density values fall back to `comfortable`
 *      so a corrupted `localStorage` value cannot break layout.
 *
 * These invariants are covered by focused tests in
 * `app/invest/[id]/__tests__/InvoiceDetailClient.test.jsx`.
 */

import CopyButton from "@/components/CopyButton";
import DensityToggle from "@/components/DensityToggle";
import { useDensity } from "@/lib/hooks/useDensity";
import { getInvoiceFieldValidator } from "@/lib/validation/invoice";
import { copy } from "@/app/copy/en";

/**
 * Validation boundary for InvoiceDetailClient props.
 * Ensures all props are of the expected type and format before rendering.
 *
 * @param {object} props - Component props
 * @returns {object} - Validated props with fallback values for invalid inputs
 */
function validateInvoiceDetailClientProps(props) {
  const {
    labelIssuer,
    labelAmount,
    labelYield,
    labelMaturity,
    labelStatus,
    labelReference,
    issuer,
    formattedAmount,
    formattedYield,
    dueDate,
    referenceId,
    statusPill,
    summaryHeading,
    rawIssuer,
    rawAmount,
    rawYield,
    rawDueDate,
    onSave,
  } = props;

  // Validate string props with fallback
  const validateString = (value, fallback = "") => {
    if (typeof value === "string" && value.length > 0) return value;
    return fallback;
  };

  // Validate React node props (can be null, string, or React element)
  const validateNode = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string" || typeof value === "object") return value;
    return fallback;
  };

  // Validate optional raw values
  const validateOptionalString = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") return value;
    return fallback;
  };

  // Validate callback function
  const validateCallback = (callback) => {
    if (typeof callback === "function" || callback === null || callback === undefined) {
      return callback;
    }
    return null;
  };

  return {
    labelIssuer: validateString(labelIssuer, "Issuer"),
    labelAmount: validateString(labelAmount, "Amount"),
    labelYield: validateString(labelYield, "Yield"),
    labelMaturity: validateString(labelMaturity, "Maturity"),
    labelStatus: validateString(labelStatus, "Status"),
    labelReference: validateString(labelReference, "Reference"),
    issuer: validateString(issuer, ""),
    formattedAmount: validateString(formattedAmount, ""),
    formattedYield: validateString(formattedYield, ""),
    dueDate: validateString(dueDate, ""),
    referenceId: validateOptionalString(referenceId, null),
    statusPill: validateNode(statusPill, null),
    summaryHeading: validateString(summaryHeading, "Invoice Details"),
    rawIssuer: validateOptionalString(rawIssuer, validateString(issuer, "")),
    rawAmount: validateOptionalString(rawAmount, validateString(formattedAmount, "")),
    rawYield: validateOptionalString(rawYield, validateString(formattedYield, "")),
    rawDueDate: validateOptionalString(rawDueDate, validateString(dueDate, "")),
    onSave: validateCallback(onSave),
  };
}

/** @type {Record<string, {gap: string, padding: string}>} */
const SPACING = {
  compact: { gap: "gap-2", padding: "p-4" },
  comfortable: { gap: "gap-4", padding: "p-6" },
};

const ie = copy.invest.detail.inlineEdit;

// ────────────────────────────────────────────────────────────────────────────
// EditableRow
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single dt/dd pair that can switch between view and inline-edit mode.
 *
 * @param {object}   props
 * @param {string}   props.field         - Machine key (e.g. "issuer", "amount")
 * @param {string}   props.label         - Human-readable label shown in the <dt>
 * @param {string}   props.displayValue  - Pre-formatted value shown in view mode
 * @param {string}   props.rawValue      - Editable raw value (unformatted)
 * @param {'string'|number'|date'} [props.inputType='text'] - Input type
 * @param {string}   [props.inputPattern] - Optional pattern attribute
 * @param {(value:string) => string | null} [props.validator] - Live validator
 *   returning `null` when valid or an error message string. Defaults to
 *   {@link getInvoiceFieldValidator} keyed off `field`.
 * @param {(field:string, value:string) => void | Promise<void>} props.onSave
 *   Callback on success. May be synchronous or return a promise.
 * @param {(msg:string)=>void} props.onAnnounce - Shared live-region setter
 */
function EditableRow({
  field,
  label,
  displayValue,
  rawValue,
  inputType = "text",
  inputPattern,
  validator,
  onSave,
  onAnnounce,
}) {
  // Validate props at component entry
  const validatedField = useMemo(() => {
    if (typeof field !== "string" || field.length === 0) {
      return "unknown";
    }
    return field;
  }, [field]);

  const validatedLabel = useMemo(() => {
    if (typeof label !== "string" || label.length === 0) {
      return "Field";
    }
    return label;
  }, [label]);

  const validatedDisplayValue = useMemo(() => {
    if (typeof displayValue !== "string") return "";
    return displayValue;
  }, [displayValue]);

  const validatedRawValue = useMemo(() => {
    if (typeof rawValue !== "string") return "";
    return rawValue;
  }, [rawValue]);

  const validatedInputType = useMemo(() => {
    const validTypes = ["text", "number", "date"];
    if (validTypes.includes(inputType)) return inputType;
    return "text";
  }, [inputType]);

  const validatedOnSave = useMemo(() => {
    if (typeof onSave === "function") return onSave;
    return () => {};
  }, [onSave]);

  const validatedOnAnnounce = useMemo(() => {
    if (typeof onAnnounce === "function") return onAnnounce;
    return () => {};
  }, [onAnnounce]);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(validatedRawValue);
  const inputRef = useRef(null);
  const reactId = useId();
  const inputElId = `inline-edit-${validatedField}-${reactId}`;
  const errorElId = `inline-edit-error-${validatedField}-${reactId}`;

  // Resolve the live validator: caller-supplied wins, otherwise fall back to
  const inputRef = useRef(null);
  // the field-keyed validator from `lib/validation/invoice`. We freeze the
  // function reference in a useMemo so the useMemo below is a pure
  // function of (draft, isEditing) and won't churn on every render.
  const effectiveValidator = useMemo(
    () => (typeof validator === "function" ? validator : getInvoiceFieldValidator(validatedField)),
    [validator, validatedField]
  );

  // Live validation: derived on every keystroke. We deliberately stop
  // validating as soon as we leave edit mode so error copy from a previous
  // keystroke does not flash against the read-only view.
  const error = useMemo(() => {
    if (!isEditing) return null;
    if (typeof effectiveValidator !== "function") return null;
    const result = effectiveValidator(draft);
    // Coerce non-string / empty-string returns to null per the
    // InvoiceFieldValidator contract ("a non-empty error message").
    return typeof result === "string" && result.length > 0 ? result : null;
  }, [isEditing, effectiveValidator, draft]);

  const isInvalid = error !== null;
  const trimmedDraft = draft.trim();

  // Keep the draft in sync when the parent supplies a new rawValue while the
  // row is not being edited. This preserves the contract that the displayed
  // value always reflects the latest props after a successful save.
  useEffect(() => {
    if (!isEditing && !saveInFlightRef.current) {
      setDraft(rawValue);
    }
  }, [rawValue, isEditing]);

  // Focus the input whenever we enter edit mode (independent of validity;
  // an invalid pre-existing value is rare but possible and we still want
  // the user to start typing).
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setDraft(validatedRawValue);
    setIsEditing(true);
  };

  const handleCancel = useCallback(() => {
    if (saveInFlightRef.current) return;
    setIsEditing(false);
    setDraft(validatedRawValue);
    validatedOnAnnounce(ie.announceCancelled);
  }, [validatedRawValue, validatedOnAnnounce]);

  const handleSave = useCallback(async () => {
    if (isInvalid) {
      // Defensive guard: Save button is `disabled` while invalid, but an
      // Enter keypress on a non-disabled text input could still reach here
      // if the browser fires a synthetic click. Announce without saving so
      // the user understands why nothing happened.
      validatedOnAnnounce(`Save failed: ${error ?? ie.errorRequired.replace("{field}", validatedLabel)}`);
      return;
    }
    setIsEditing(false);
    validatedOnAnnounce(ie.announceSaved.replace("{field}", validatedLabel));
    validatedOnSave(validatedField, trimmedDraft);
  }, [isInvalid, error, validatedLabel, validatedField, validatedOnSave, validatedOnAnnounce, trimmedDraft]);

  const handleKeyDown = useCallback(
    (e) => {
      // Ignore key events that arrive after the row has left edit mode
      // (e.g. a queued Enter dispatched during a concurrent save).
      if (!isEditing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter" && validatedInputType !== "date") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave, validatedInputType]
  );

  const handleChange = (e) => {
    setDraft(e.target.value);
  };

  const editBtnLabel = ie.editButton.replace("{field}", validatedLabel);

  return (
    <div>
      <dt className="invoice-detail-dt text-slate-500">{validatedLabel}</dt>
      <dd className="invoice-detail-dd text-slate-100">
        {isEditing ? (
          <div className="flex flex-col gap-2 mt-1">
            <input
              ref={inputRef}
              id={inputElId}
              type={validatedInputType}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label={validatedLabel}
              aria-describedby={isInvalid ? errorElId : undefined}
              aria-invalid={isInvalid}
              pattern={inputPattern}
              data-testid={`inline-edit-input-${validatedField}`}
              className={[
                "wfull bg-slate-950 border rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus-ring",
                isInvalid
                  ? "border-red-500 focus:border-red-500"
                  : "border-slate-700 focus:border-cyan-500",
              ].join(" ")}
            />
            {isInvalid && (
              <p
                id={errorElId}
                role="alert"
                aria-live="polite"
                data-testid={`inline-edit-error-${validatedField}`}
                className="text-red-400 text-xs"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={isInvalid}
                aria-disabled={isInvalid}
                data-testid={`inline-edit-save-${validatedField}`}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 text-white text-xs font-medium rounded transition-colors focus-ring"
              >
                {ie.saveButton}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                data-testid={`inline-edit-cancel-${validatedField}`}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors focus-ring"
              >
                {ie.cancelButton}
              </button>
            </div>
          </div>
        ) : (
          <span className="group/row flex items-center gap-2">
            <span data-testid={`detail-value-${validatedField}`}>{validatedDisplayValue}</span>
            <button
              type="button"
              onClick={handleEdit}
              aria-label={editBtnLabel}
              data-testid={`inline-edit-btn-${validatedField}`}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-xs text-slate-400 hover:text-cyan-400 border border-slate-700 rounded px-2 py-0.5 transition-all focus-ring"
            >
              {ie.editButtonShort ?? "Edit"}
            </button>
          </div>
        )}
      </dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// InvoiceDetailClient
// ────────────────────────────────────────────────────────────────────────────

export default function InvoiceDetailClient(props) {
  // Validate all props at component entry to ensure type safety and provide fallbacks
  const validatedProps = useMemo(() => validateInvoiceDetailClientProps(props), [props]);

  const {
    labelIssuer,
    labelAmount,
    labelYield,
    labelMaturity,
    labelStatus,
    labelReference,
    issuer,
    formattedAmount,
    formattedYield,
    dueDate,
    referenceId,
    statusPill,
    summaryHeading,
    rawIssuer,
    rawAmount,
    rawYield,
    rawDueDate,
    onSave,
  } = validatedProps;
  // Density state is owned here and passed to DensityToggle as controlled props
  // so that both this component and the toggle always reflect the same value.
  const [density, setDensity] = useDensity();
  const spacing = SPACING[density] ?? SPACING.comfortable;

  // Single polite aria-live region shared by all editable rows so announcements
  // do not stack up in the DOM (one region, one message at a time).
  const [announcement, setAnnouncement] = useState("");

  // Invariant 6: unknown density values fall back to "comfortable" so a
  // corrupted localStorage value cannot break layout.
  const spacing = SPACING[density] ?? SPACING.comfortable;

  // Invariant 4: raw values fall back to their formatted counterparts.
  const raw = useMemo(
    () => ({
      issuer: rawIssuer ?? issuer,
      amount: rawAmount ?? amount,
      yield: rawYield ?? yield,
      dueDate: rawDueDate ?? dueDate,
    }),
    [rawIssuer, issuer, rawAmount, amount, rawYield, yield, rawDueDate, dueDate]
  );

  // I6: announcements are serialized through a single shared live region.
  // A later announcement supersedes an earlier one and is auto-cleared.
  const announce = useCallback((msg) => {
    if (typeof msg !== "string" || msg.length === 0) return;
    setAnnouncement(msg);
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => {
      setAnnouncement("");
      announceTimer.current = null;
    }, 5000);
  }, []);

  return (
    <section
      className={[`grid grid-cols-1 sm:grid-cols-2 ${spacing.gap} ${spacing.padding} bg-slate-900/50 border border-slate-800 rounded-lg`]}
      data-testid="invoice-detail-client"
      data-density={density}
    >
      <div className="col-span-full flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-400">{copy.invest.detail.metadataTitle ?? "Invoice metadata"}</h2>
        <DensityToggle density={density} onDensityChange={setDensity} />
      </div>

      <dl className="col-span-full grid subtitle-grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <EditableRow
          field="issuer"
          label={copy.invest.detail.issuerLabel ?? "Issuer"}
          displayValue={issuer}
          rawValue={rawIssuer}
          onSave={handleSave}
          onAnnounce={handleAnnounce}
        />
        <EditableRow
          field="amount"
          label={labelAmount}
          displayValue={formattedAmount}
          rawValue={rawAmount}
          inputType="text"
          onSave={handleSave}
          onAnnounce={handleAnnounce}
          onSave={onSave}
        />
        <EditableRow
          field="yield"
          label={labelYield}
          displayValue={formattedYield}
          rawValue={rawYield}
          onSave={handleSave}
          onAnnounce={handleAnnounce}
          onSave={onSave}
        />
        <EditableRow
          field="dueDate"
          label={copy.invest.detail.dueDateLabel ?? "Due date"}
          displayValue={dueDate}
          rawValue={rawDueDate}
          inputType="date"
          onAnnounce={handleAnnounce}
          onSave={onSave}
        />
        {currency && (
          <div>
            <dt className="invoice-detail-dt text-slate-500">{copy.invest.detail.currencyLabel ?? "Currency"}</dt>
            <dd className="invoice-detail-dd text-slate-100">{currency}</dd>
          </div>
        )}
        {/* Invariant 5: referenceId is optional; omit the row entirely when falsy. */}
        {referenceId && (
          <div>
            <dt className="invoice-detail-dt text-slate-500">{copy.invest.detail.referenceLabel ?? "Reference"}</dt>
            <dd className="invoice-detail-dd text-slate-100 flex items-center gap-2">
              <span className="font-mono text-xs">{referenceId}</span>
              <CopyButton value={referenceId} />
            </dd>
          </div>
        )}
      </dl>

      {/* Polite live region for inline-edit announcements. */}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="invoice-detail-announcement"
      >
        {announcement}
      </p>
    </section>
  );
}
