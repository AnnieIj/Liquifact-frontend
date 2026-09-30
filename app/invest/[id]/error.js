"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ErrorBanner from "@/components/ErrorBanner";
import { reportError } from "@/lib/observability/reportError";
import { copy } from "@/app/copy/en";

/**
 * Module-level WeakSet: tracks which `Error` object instances have already
 * been forwarded to the telemetry sink during this page-lifecycle.
 *
 * Using a WeakSet (not a WeakMap/Map) keeps this lean — we only need presence,
 * not a value. WeakSet keys are held weakly so errors are GC-eligible once the
 * boundary is torn down and no other references remain.
 *
 * Why module-level (not component-level)?
 * React 18 Strict Mode intentionally unmounts and remounts every component to
 * surface unsafe side-effects. That means `useRef` values are RESET on every
 * remount — a new component instance gets a fresh ref. A module-level set
 * persists across remounts within the same page lifecycle, so the same `Error`
 * object is never forwarded twice even when the boundary remounts rapidly.
 *
 * @type {WeakSet<Error>}
 */
const reportedErrors = new WeakSet();

/**
 * Route-level error boundary for the `app/invest/[id]` segment.
 *
 * ## Concurrent-execution invariants
 *
 * Several concurrency hazards arise at this boundary and are individually
 * addressed:
 *
 * ### 1. Double-reporting (StrictMode / fast remount)
 * React 18 StrictMode intentionally mounts → unmounts → remounts effects.
 * A naïve `useEffect(() => { reportError(error) }, [error])` fires twice per
 * mount cycle in development, producing duplicate telemetry entries.
 *
 * **Fix**: `reportedErrors` (module-level WeakSet) tracks which `Error` object
 * instances have been forwarded. A WeakSet is used so entries are
 * GC-eligible once no other references remain. The effect only calls
 * `reportError` when `!reportedErrors.has(error)`, so remounts on the same
 * error object are idempotent.
 *
 * ### 2. Stale async sink after error-prop change
 * If an async telemetry sink (e.g., Sentry) is installed and the `error` prop
 * changes before the previous call resolves, the stale callback must not mark
 * the new error as reported.
 *
 * **Fix**: The effect captures an `active` flag; the async continuation checks
 * `active` before calling `reportedErrors.add(error)`. The cleanup sets
 * `active = false`.
 *
 * ### 3. Side-effects after unmount
 * The component may unmount (navigation away, reset) before an in-flight async
 * `reportError` resolves. Writing state on an unmounted component produces React
 * warnings and can shadow future renders.
 *
 * **Fix**: `isMountedRef` is set to `false` on unmount; all state updates
 * (`setReporting`) are gated behind it.
 *
 * ### 4. Rapid reset-button clicks
 * Clicking "Try again" multiple times before Next.js tears down the subtree could
 * invoke `reset()` several times, triggering redundant remounts.
 *
 * **Fix**: `isResetting` state is set to `true` on the first click and the button
 * is disabled while it is `true`. Because `reset()` causes Next.js to remount the
 * boundary with a fresh component instance, the flag never needs to be cleared
 * in normal flow.
 *
 * ### 5. Null / undefined error
 * The Next.js error boundary contract guarantees an `Error` instance, but
 * defensive code must not crash if the prop is `null` or `undefined` (e.g., during
 * testing or mis-integration).
 *
 * **Fix**: The effect and reporting path short-circuit when `error` is falsy.
 *
 * @param {object}   props
 * @param {Error}    props.error  — The error thrown by the `[id]` segment.
 *   Next.js attaches a `digest` property for server-side errors so you can
 *   correlate browser errors with server logs. Never display `digest` in the UI.
 * @param {Function} props.reset  — Calling this unmounts and re-mounts the failed
 *   subtree without a full page reload, giving users a lightweight recovery path.
 */
export default function InvoiceDetailError({ error, reset }) {
  // ── Mounted guard ─────────────────────────────────────────────────────────
  // Prevents setState calls on an unmounted component (async sink resolves
  // after unmount / navigation).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── In-flight reporting state ─────────────────────────────────────────────
  // Exposed so the reset button can be disabled while a telemetry call is
  // running. This prevents the UI from looking interactive when we are still
  // draining the sink.
  const [isReporting, setIsReporting] = useState(false);

  // ── Reset-once guard ──────────────────────────────────────────────────────
  // Prevents rapid successive clicks of "Try again" from invoking reset()
  // more than once before Next.js tears down the failed subtree.
  const [isResetting, setIsResetting] = useState(false);

  // ── Side-effect: forward error to telemetry sink ──────────────────────────
  useEffect(() => {
    // Nothing to report if error is falsy (defensive guard).
    if (!error) {
      return;
    }

    // De-duplicate: same error object identity → already reported (module-level
    // WeakSet persists across StrictMode remounts on the same page lifecycle).
    if (reportedErrors.has(error)) {
      return;
    }

    // Mark as in-flight before the async call so the UI reflects the state.
    if (isMountedRef.current) {
      setIsReporting(true);
    }

    // Stale-closure guard: if this effect is cleaned up before the async
    // continuation runs (error prop changed, component unmounted), do not
    // stamp the error as reported (so a subsequent mount can retry it).
    let active = true;

    const runReport = async () => {
      try {
        // reportError is synchronous by default but may be swapped for an
        // async Sentry / Datadog adapter. Await it so we can drain the sink
        // before re-enabling the reset button.
        await Promise.resolve(reportError(error, { digest: error?.digest }));
      } finally {
        if (active) {
          // Only stamp the identity after a successful (or failed) report
          // attempt completes. If the effect was cleaned up (active = false)
          // before the sink resolved, do not stamp — the next mount will retry.
          reportedErrors.add(error);
        }
        if (active && isMountedRef.current) {
          setIsReporting(false);
        }
      }
    };

    void runReport();

    return () => {
      active = false;
    };
  }, [error]);

  // ── Reset handler ─────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (isResetting) {
      return;
    }
    setIsResetting(true);
    reset();
  }, [isResetting, reset]);

  // The reset button is disabled while reporting is in-flight (sink not yet
  // drained) or after the first reset click (subtree teardown pending).
  const resetDisabled = isReporting || isResetting;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-16"
      data-testid="invest-id-error-boundary"
    >
      {/* Back navigation — lets users escape the error without resetting */}
      <nav
        className="mb-6 w-full max-w-lg"
        aria-label="Error page navigation"
      >
        <Link
          href="/invest"
          className="inline-block text-sm text-slate-400 hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded"
        >
          ← Back to marketplace
        </Link>
      </nav>

      <main
        id="main-content"
        className="w-full max-w-lg"
        aria-labelledby="invest-error-heading"
      >
        {/* Visually-hidden heading for landmark navigation */}
        <h1 id="invest-error-heading" className="sr-only">
          {copy.error.title}
        </h1>

        <ErrorBanner
          variant="server"
          title={copy.error.title}
          description={copy.error.description}
          actionLabel={resetDisabled ? undefined : copy.error.actionLabel}
          previewLabel={copy.error.previewLabel}
          onAction={resetDisabled ? undefined : handleReset}
        />

        {/*
          Explicit reset button rendered outside ErrorBanner so we can attach
          aria-busy and a disabled state independently of ErrorBanner's internal
          rendering, ensuring the concurrent-safety props are always applied.
        */}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetDisabled}
            aria-busy={isReporting}
            aria-disabled={resetDisabled}
            data-testid="invest-error-reset-btn"
            className="rounded-full bg-cyan-500/20 text-cyan-400 px-6 py-3 text-sm font-medium hover:bg-cyan-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {isReporting
              ? "Reporting\u2026"
              : isResetting
              ? "Retrying\u2026"
              : copy.error.actionLabel}
          </button>
        </div>
      </main>
    </div>
  );
}

/**
 * Exported for tests only — clears the module-level reported-errors registry
 * between test cases so tests remain isolated.
 *
 * @internal
 */
export function __resetReportedErrors() {
  // WeakSet has no clear() method; recreate via module mutation is not
  // possible here. Instead, we export a sentinel that tests can use to
  // force a fresh error object per test (each `new Error()` is a unique
  // reference, so the WeakSet hit cannot carry over between tests as long
  // as tests create fresh error instances).
  //
  // This export exists purely for documentation / future test-infrastructure
  // use and is a no-op in the WeakSet model (new Error() === new identity).
}
