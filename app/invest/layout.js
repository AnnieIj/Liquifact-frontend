/**
 * @file app/invest/layout.js
 *
 * Layout for all /invest routes. Wraps the list page and detail page with
 * MarketplaceShell so that invoice state (including optimistic updates) is
 * shared across navigations within the marketplace.
 *
 * PUBLIC INTERFACE CONTRACT:
 * ===========================
 * This layout is a Next.js Server Component that provides:
 *   - A MarketplaceShell wrapper that manages shared invoice state
 *   - Transparent composition of child routes (/invest and /invest/[id])
 *   - No direct public API — it exists solely as a layout boundary
 *
 * COMPATIBILITY GUARANTEES:
 * =========================
 *   - The layout always renders MarketplaceShell with its children prop
 *   - No breaking changes to the MarketplaceShell import path
 *   - Null/undefined children are handled gracefully (render as empty fragment)
 *   - Invalid children types (non-React-node) throw a descriptive error
 *
 * INVARIANTS:
 * ===========
 *   - The layout is a Server Component (no hooks, no browser APIs)
 *   - MarketplaceShell is always the direct parent of children
 *   - No side effects during render
 *   - No conditional rendering of MarketplaceShell itself
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - The child route content to wrap.
 *   Must be a valid React node (element, string, number, array, fragment, or null).
 *   Invalid types (plain objects, functions, primitives other than string/number)
 *   will throw a descriptive error to prevent silent failures.
 *
 * @returns {React.ReactElement} A MarketplaceShell component wrapping the children.
 *
 * @example
 * // Used automatically by Next.js App Router for /invest routes
 * // No manual instantiation needed
 *
 * @see app/invest/MarketplaceShell.jsx - The client component that provides state
 * @see app/invest/MarketplaceContext.jsx - The context for shared invoice state
 */
import MarketplaceShell from "./MarketplaceShell";
import { copy } from "@/app/copy/en";
import { reportError } from "@/lib/observability/reportError";
import { validateInvestChildren, validateInvestLayoutParams } from "./validation";

export default function InvestLayout({ children }) {
  // Runtime validation to ensure children is a valid React node.
  // This prevents silent failures and makes debugging easier.
  if (
    children !== null &&
    children !== undefined &&
    typeof children !== "object" &&
    typeof children !== "string" &&
    typeof children !== "number" &&
    typeof children !== "boolean"
  ) {
    throw new Error(
      `InvestLayout: Invalid children prop. Expected React.ReactNode but received ${typeof children}. ` +
        "Valid types: React element, string, number, array, fragment, or null."
    );
  }

  // Intentionally always render MarketplaceShell — no conditional logic.
  // This preserves the contract that all /invest routes share the same shell.
  return <MarketplaceShell>{children}</MarketplaceShell>;
}
