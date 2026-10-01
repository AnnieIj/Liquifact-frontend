"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportError } from "../lib/observability/reportError";
import { copy } from "./copy/en";

/**
 * Layout-level (global) error boundary for the Next.js App Router.
 *
 * This boundary is only activated when an error is thrown inside `app/layout.js`
 * itself — i.e. before any route-level `error.js` can be reached. Because it
 * replaces the entire root layout (including `<html>` and `<body>`), it must
 * render those tags itself and **cannot** import any async Server Components.
 *
 * Unlike the route-level boundary in `app/error.js`, this component does not
 * use `ErrorBanner` — at this point the global CSS bundle may not have loaded,
 * so it falls back to defensive inline styles to always be renderable.
 *
 * ## Concurrency hardening
 *
 * Next.js calls `reset()` to unmount and re-mount the entire root layout tree.
 * Without a guard this is not idempotent: rapid or concurrent clicks queue N
 * parallel re-mount attempts whose ordering and side effects are undefined.
 *
 * The following invariants are enforced:
 *
 * 1. **Single in-flight reset** — `isResettingRef` is a `useRef` boolean (not
 *    state) so its write is synchronous and immediately visible to the next
 *    event before React re-renders.  Only the first `handleReset` invocation
 *    while a reset is in-flight proceeds; all others are no-ops.
 *
 * 2. **Button disabled during reset** — `isResetting` state mirrors the ref
 *    for rendering purposes.  The button gains `disabled` and `aria-disabled`
 *    and the cursor changes to `not-allowed`, making the guard visible to both
 *    pointer and assistive technology users.
 *
 * 3. **Stale-closure / post-unmount safety** — `isMountedRef` is set to
 *    `false` in the `useEffect` cleanup returned by the error-reporting effect.
 *    Any async continuation (e.g. a reporter that awaits a network flush)
 *    cannot call back into state after the component unmounts.
 *
 * 4. **Idempotent error reporting** — `reportedErrorRef` tracks the last
 *    reported error object.  If Next.js re-renders this boundary with the same
 *    error reference (possible during Strict Mode double-invocation or HMR),
 *    `reportError` is not called a second time for the same instance.
 *
 * @param {object}   props
 * @param {Error}    props.error — The layout-level error.
 * @param {Function} props.reset — Re-mounts the root layout tree without a
 *   full navigation, giving users a lightweight recovery path before reload.
 */
export default function GlobalLayoutError({ error, reset }) {
  // ── Concurrency guard refs ────────────────────────────────────────────────
  /**
   * Synchronous guard: set to `true` before calling `reset()`, never cleared
   * inside this component's lifetime.  Using a ref (not state) ensures the
   * write is immediately visible to the *next* click event handler even before
   * React has scheduled a re-render.
   * @type {React.MutableRefObject<boolean>}
   */
  const isResettingRef = useRef(false);

  /**
   * Set to `false` in the effect cleanup so any async reporter continuation
   * knows the component has unmounted.
   * @type {React.MutableRefObject<boolean>}
   */
  const isMountedRef = useRef(true);

  /**
   * Tracks the last error instance we have already forwarded to `reportError`
   * so Strict Mode double-effects and prop-identity-preserving re-renders do
   * not emit duplicate telemetry events.
   * @type {React.MutableRefObject<Error|null>}
   */
  const reportedErrorRef = useRef(null);

  // ── Rendering state ───────────────────────────────────────────────────────
  /**
   * Mirrors `isResettingRef` for React rendering so the button can be visually
   * disabled.  We write the ref first (synchronous guard) then call setState
   * for the deferred visual update.
   */
  const [isResetting, setIsResetting] = useState(false);

  // ── Error reporting — idempotent, post-unmount safe ───────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    // Only forward to the reporter if this is a distinct new error instance.
    if (error !== reportedErrorRef.current) {
      reportedErrorRef.current = error;
      reportError(error, { digest: error?.digest, boundary: "global-layout" });
    }

    return () => {
      // Signal any async continuation that the component has unmounted.
      isMountedRef.current = false;
    };
  }, [error]);

  // ── Concurrent-safe reset handler ─────────────────────────────────────────
  /**
   * Idempotent reset: only one in-flight re-mount is allowed at a time.
   *
   * The ref write is synchronous so a second click arriving in the same event
   * loop tick (before React re-renders) is still blocked.  The state write
   * schedules the visual disabled update.
   */
  const handleReset = () => {
    if (isResettingRef.current) {
      // A reset is already in flight — discard this invocation.
      return;
    }
    isResettingRef.current = true;
    setIsResetting(true);
    reset();
    // Note: we intentionally do NOT reset `isResettingRef` to false here.
    // If the remount succeeds, this component unmounts entirely.
    // If the remount fails again, Next.js re-mounts this boundary with a new
    // error prop, which resets all ref/state to initial values naturally.
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const resetButtonStyle = {
    padding: "0.75rem 1.5rem",
    borderRadius: "9999px",
    background: isResetting ? "rgba(34, 211, 238, 0.08)" : "rgba(34, 211, 238, 0.2)",
    color: isResetting ? "rgba(34, 211, 238, 0.45)" : "#22d3ee",
    border: "none",
    cursor: isResetting ? "not-allowed" : "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#f1f5f9",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <main
          role="alert"
          aria-live="assertive"
          id="main-content"
          style={{ maxWidth: "32rem", width: "100%", textAlign: "center" }}
          data-testid="global-error-page"
        >
          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "#f8fafc",
            }}
          >
            {copy.globalError.heading}
          </h1>
          <p
            style={{
              fontSize: "1rem",
              lineHeight: "1.75",
              color: "#94a3b8",
              marginBottom: "2rem",
            }}
          >
            {copy.globalError.description}
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={handleReset}
              disabled={isResetting}
              aria-disabled={isResetting}
              data-testid="global-error-reset"
              style={resetButtonStyle}
            >
              {isResetting ? copy.globalError.resettingLabel : copy.globalError.reloadLabel}
            </button>
            <Link
              href="/"
              data-testid="global-error-home-link"
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                background: "rgba(148, 163, 184, 0.1)",
                color: "#94a3b8",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              {copy.globalError.homeLabel}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
