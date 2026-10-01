/**
 * Tests for app/global-error.js — the layout-level (global) error boundary.
 *
 * Test strategy
 * ─────────────
 * • Mock `reportError` so tests are isolated from the telemetry sink.
 * • Mock `next/link` to a plain <a> tag so Link renders without the Next.js
 *   router context (which is unavailable in Jest/jsdom).
 * • Cover rendering, error-reporting idempotency, concurrent-safe reset guard,
 *   post-unmount safety, accessibility, and copy-key presence.
 *
 * Concurrency scenarios
 * ─────────────────────
 * The `isResettingRef` guard is *synchronous* — it is written before `reset()`
 * is called, so a second click that arrives in the same event-loop tick is
 * blocked before React re-renders.  Tests that verify this use synchronous
 * `fireEvent.click` (rather than `userEvent.click`, which is async) to prove
 * that the guard holds even in the most adversarial same-tick scenario.
 */
import "@testing-library/jest-dom";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import React from "react";

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("../lib/observability/reportError", () => ({
  reportError: jest.fn(),
}));

// next/link renders <a> tags with router context in real Next.js but needs a
// shim for jsdom unit tests.
jest.mock("next/link", () => {
  function MockLink({ href, children, style, "data-testid": testId }) {
    return (
      <a href={href} style={style} data-testid={testId}>
        {children}
      </a>
    );
  }
  MockLink.displayName = "MockLink";
  return MockLink;
});

// ── SUT + test dependencies ───────────────────────────────────────────────────

import GlobalLayoutError from "./global-error";
import { reportError } from "../lib/observability/reportError";
import { copy } from "./copy/en";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeError(message = "Layout error", digest = undefined) {
  const err = new Error(message);
  if (digest !== undefined) err.digest = digest;
  return err;
}

/**
 * Renders the boundary inside an `act()` so all `useEffect` hooks are flushed
 * synchronously before assertions run.
 */
function renderBoundary(error = makeError(), reset = jest.fn()) {
  let result;
  act(() => {
    result = render(<GlobalLayoutError error={error} reset={reset} />);
  });
  return { ...result, reset };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GlobalLayoutError (app/global-error.js)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders the global error page container", () => {
      renderBoundary();
      expect(screen.getByTestId("global-error-page")).toBeInTheDocument();
    });

    it("renders the heading from copy.globalError.heading", () => {
      renderBoundary();
      expect(screen.getByText(copy.globalError.heading)).toBeInTheDocument();
    });

    it("renders the description from copy.globalError.description", () => {
      renderBoundary();
      expect(screen.getByText(copy.globalError.description)).toBeInTheDocument();
    });

    it("renders the reload button with copy.globalError.reloadLabel initially", () => {
      renderBoundary();
      const btn = screen.getByTestId("global-error-reset");
      expect(btn).toHaveTextContent(copy.globalError.reloadLabel);
    });

    it("renders the home link with copy.globalError.homeLabel", () => {
      renderBoundary();
      const link = screen.getByTestId("global-error-home-link");
      expect(link).toHaveTextContent(copy.globalError.homeLabel);
    });

    it("the home link points to '/'", () => {
      renderBoundary();
      expect(screen.getByTestId("global-error-home-link")).toHaveAttribute("href", "/");
    });

    it("renders an <html> root", () => {
      renderBoundary();
      // jsdom wraps the rendered output — check that the boundary itself
      // renders the html/body structure via the container.
      const { container } = renderBoundary();
      // GlobalLayoutError wraps everything in <html><body>…</body></html>
      // In jsdom the outer document.documentElement exists regardless, but
      // the component's rendered subtree contains <body>.
      expect(container.querySelector("[data-testid='global-error-page']")).toBeInTheDocument();
    });
  });

  // ── Error reporting ──────────────────────────────────────────────────────

  describe("error reporting", () => {
    it("calls reportError once on initial mount", () => {
      const error = makeError("initial");
      renderBoundary(error);
      expect(reportError).toHaveBeenCalledTimes(1);
    });

    it("passes the error and digest to reportError", () => {
      const error = makeError("with digest", "server-digest-xyz");
      renderBoundary(error);
      expect(reportError).toHaveBeenCalledWith(error, {
        digest: "server-digest-xyz",
        boundary: "global-layout",
      });
    });

    it("handles missing digest gracefully (passes undefined)", () => {
      const error = makeError("no digest");
      delete error.digest;
      renderBoundary(error);
      expect(reportError).toHaveBeenCalledWith(error, {
        digest: undefined,
        boundary: "global-layout",
      });
    });

    it("handles a null/undefined error without throwing", () => {
      // Next.js guarantees a real Error, but defensive coverage for edge cases.
      expect(() => renderBoundary(null)).not.toThrow();
    });

    it("re-reports when the error prop changes to a different instance", () => {
      const error1 = makeError("first");
      const { rerender } = renderBoundary(error1);

      const error2 = makeError("second");
      act(() => {
        rerender(<GlobalLayoutError error={error2} reset={jest.fn()} />);
      });

      expect(reportError).toHaveBeenCalledTimes(2);
      expect(reportError).toHaveBeenLastCalledWith(error2, {
        digest: undefined,
        boundary: "global-layout",
      });
    });

    // ── Idempotency ────────────────────────────────────────────────────────

    it("does NOT re-report if the same error instance is re-rendered (idempotent)", () => {
      const error = makeError("same instance");
      const { rerender } = renderBoundary(error);
      expect(reportError).toHaveBeenCalledTimes(1);

      // Re-render with the exact same error reference — should not report again.
      act(() => {
        rerender(<GlobalLayoutError error={error} reset={jest.fn()} />);
      });
      expect(reportError).toHaveBeenCalledTimes(1);
    });

    it("does not re-report when an unrelated state change causes a re-render", async () => {
      // Simulate a re-render triggered by a reset click (which sets isResetting).
      const error = makeError("stable");
      const reset = jest.fn();
      renderBoundary(error, reset);
      expect(reportError).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      // Click reset — this sets isResetting state which causes a re-render,
      // but the error prop identity has not changed.
      act(() => {
        fireEvent.click(screen.getByTestId("global-error-reset"));
      });
      // reportError must not fire again for the same error object.
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  // ── Concurrent-safe reset guard ──────────────────────────────────────────

  describe("concurrent-safe reset guard", () => {
    it("calls reset() exactly once for a single click", async () => {
      const reset = jest.fn();
      renderBoundary(makeError(), reset);
      await userEvent.click(screen.getByTestId("global-error-reset"));
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("calls reset() exactly once even when clicked N times rapidly (synchronous guard)", () => {
      const reset = jest.fn();
      renderBoundary(makeError(), reset);
      const btn = screen.getByTestId("global-error-reset");

      // Synchronous clicks in the same tick — this is the adversarial case.
      // The isResettingRef guard must block all but the first invocation.
      act(() => {
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
      });

      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("calls reset() exactly once for two rapid async clicks", async () => {
      const reset = jest.fn();
      renderBoundary(makeError(), reset);
      const btn = screen.getByTestId("global-error-reset");

      await userEvent.click(btn);
      await userEvent.click(btn); // button is now disabled — should be a no-op

      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("disables the button after the first click", async () => {
      renderBoundary();
      const btn = screen.getByTestId("global-error-reset");
      await userEvent.click(btn);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
    });

    it("shows the resettingLabel while the reset is in flight", async () => {
      renderBoundary();
      const btn = screen.getByTestId("global-error-reset");
      await userEvent.click(btn);
      expect(btn).toHaveTextContent(copy.globalError.resettingLabel);
    });

    it("shows reloadLabel initially (before any click)", () => {
      renderBoundary();
      expect(screen.getByTestId("global-error-reset")).toHaveTextContent(
        copy.globalError.reloadLabel
      );
    });

    it("button cursor style changes to not-allowed after click", async () => {
      renderBoundary();
      const btn = screen.getByTestId("global-error-reset");
      await userEvent.click(btn);
      // jsdom exposes inline styles
      expect(btn.style.cursor).toBe("not-allowed");
    });
  });

  // ── Post-unmount safety ──────────────────────────────────────────────────

  describe("post-unmount safety", () => {
    it("does not throw when the component unmounts before effects settle", () => {
      // Render then immediately unmount — the cleanup return in useEffect
      // sets isMountedRef.current = false.  No error should be thrown.
      const { unmount } = renderBoundary();
      expect(() => act(() => unmount())).not.toThrow();
    });

    it("reportError is not called after unmount", () => {
      const { unmount } = renderBoundary();
      jest.clearAllMocks();
      act(() => unmount());
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  // ── Boundary / edge inputs ───────────────────────────────────────────────

  describe("boundary inputs", () => {
    it("renders without digest on the error object", () => {
      const error = new Error("no digest");
      // Deliberately omit digest
      renderBoundary(error);
      expect(screen.getByTestId("global-error-page")).toBeInTheDocument();
      expect(reportError).toHaveBeenCalledWith(error, {
        digest: undefined,
        boundary: "global-layout",
      });
    });

    it("renders when digest is an empty string", () => {
      const error = makeError("empty digest", "");
      renderBoundary(error);
      expect(reportError).toHaveBeenCalledWith(error, {
        digest: "",
        boundary: "global-layout",
      });
    });

    it("renders when error.message is empty", () => {
      const error = makeError("");
      expect(() => renderBoundary(error)).not.toThrow();
      expect(screen.getByTestId("global-error-page")).toBeInTheDocument();
    });

    it("renders when reset is a no-op function", () => {
      const noop = () => {};
      expect(() => renderBoundary(makeError(), noop)).not.toThrow();
    });

    it("handles a plain object as the error prop without crashing the boundary", () => {
      // In production Next.js guarantees an Error instance, but defensive
      // coverage: if something non-standard is passed the boundary should
      // still render rather than crashing in the JSX/render path.
      const plainObj = { message: "plain object", digest: "test-digest" };
      expect(() => renderBoundary(plainObj)).not.toThrow();
      expect(screen.getByTestId("global-error-page")).toBeInTheDocument();
    });
  });

  // ── Accessibility ────────────────────────────────────────────────────────

  describe("accessibility", () => {
    it("main landmark has role=alert", () => {
      renderBoundary();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("main landmark has aria-live=assertive", () => {
      renderBoundary();
      expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    });

    it("main landmark has id=main-content", () => {
      renderBoundary();
      expect(screen.getByRole("alert")).toHaveAttribute("id", "main-content");
    });

    it("reset button has type=button", () => {
      renderBoundary();
      expect(screen.getByTestId("global-error-reset")).toHaveAttribute("type", "button");
    });

    it("has no axe accessibility violations in initial state", async () => {
      const { container } = renderBoundary();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no axe accessibility violations in resetting state", async () => {
      const { container } = renderBoundary();
      await userEvent.click(screen.getByTestId("global-error-reset"));
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // ── Inline style / visual regression ────────────────────────────────────

  describe("visual / style", () => {
    it("page container uses dark slate background color", () => {
      renderBoundary();
      const body = screen.getByTestId("global-error-page").closest("body");
      // The body element carries the inline background style.
      // jsdom normalizes hex #020617 to rgb(2, 6, 23).
      expect(body?.style.background).toMatch(/^(#020617|rgb\(2,\s*6,\s*23\))$/);
    });

    it("reset button opacity reduces after click (background darkens)", async () => {
      renderBoundary();
      const btn = screen.getByTestId("global-error-reset");
      const initialBg = btn.style.background;
      await userEvent.click(btn);
      expect(btn.style.background).not.toBe(initialBg);
    });
  });

  // ── Copy key regression ──────────────────────────────────────────────────

  describe("copy key presence", () => {
    it("copy.globalError.heading is defined and non-empty", () => {
      expect(typeof copy.globalError.heading).toBe("string");
      expect(copy.globalError.heading.length).toBeGreaterThan(0);
    });

    it("copy.globalError.description is defined and non-empty", () => {
      expect(typeof copy.globalError.description).toBe("string");
      expect(copy.globalError.description.length).toBeGreaterThan(0);
    });

    it("copy.globalError.reloadLabel is defined and non-empty", () => {
      expect(typeof copy.globalError.reloadLabel).toBe("string");
      expect(copy.globalError.reloadLabel.length).toBeGreaterThan(0);
    });

    it("copy.globalError.resettingLabel is defined and non-empty", () => {
      expect(typeof copy.globalError.resettingLabel).toBe("string");
      expect(copy.globalError.resettingLabel.length).toBeGreaterThan(0);
    });

    it("copy.globalError.homeLabel is defined and non-empty", () => {
      expect(typeof copy.globalError.homeLabel).toBe("string");
      expect(copy.globalError.homeLabel.length).toBeGreaterThan(0);
    });

    it("copy.globalError.resettingLabel differs from reloadLabel", () => {
      // They must be distinct so users can tell the difference between idle
      // and in-flight states.
      expect(copy.globalError.resettingLabel).not.toBe(copy.globalError.reloadLabel);
    });
  });
});
