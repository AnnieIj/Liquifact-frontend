/**
 * @file InvoiceDetailItems.test.jsx
 *
 * Focused invariant, boundary, and accessibility tests for InvoiceDetailItems.
 *
 * COVERAGE TARGETS:
 *   INV-1  null/undefined/non-object invoice → renders nothing (null guard)
 *   INV-2  Unknown status value → StatusPill degrades gracefully (no throw)
 *   INV-3  isFundingDisabled=true → Fund button disabled; false → enabled
 *   INV-4  All visible strings come from copy.investDetail (no inline copy)
 *   INV-5  HTML-special chars in fields are stripped before rendering
 *   INV-6  Yield sentinel "—" is shown without "%" suffix; valid yield gets "%"
 *   INV-7  No hooks/side-effects: component is a pure function of its props
 *
 *   Boundary: empty string fields, numeric amount, extra unknown fields
 *   A11y:     axe passes, every button has an accessible aria-label
 *   Actions:  onFund / onCopyLink / onPrint callbacks are wired correctly
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import InvoiceDetailItems from "./InvoiceDetailItems";
import { copy } from "@/app/copy/en";
import { INVALID_VALUE_FALLBACK } from "@/lib/format/currency";

expect.extend(toHaveNoViolations);

// ─── mocks ───────────────────────────────────────────────────────────────────

jest.mock(
  "@/components/StatusPill",
  () =>
    function StatusPillMock({ status }) {
      return <span data-testid="status-pill">{status || "unknown"}</span>;
    }
);

// ─── fixtures ────────────────────────────────────────────────────────────────

/** Minimal valid invoice — all optional fields populated. */
const validInvoice = {
  id: "inv-001",
  issuer: "Acme Supplies Ltd",
  amount: "12,500",
  currency: "USD",
  dueDate: "2026-06-15",
  yield: "8.2",
  status: "Open",
};

const noop = () => {};

// ─── helpers ─────────────────────────────────────────────────────────────────

function renderItems(invoice, overrides = {}) {
  return render(
    <InvoiceDetailItems
      invoice={invoice}
      isFundingDisabled={overrides.isFundingDisabled ?? false}
      onFund={overrides.onFund ?? noop}
      onCopyLink={overrides.onCopyLink ?? noop}
      onPrint={overrides.onPrint ?? noop}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INV-1: null / invalid invoice guard
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-1: null / invalid invoice guard", () => {
  it("renders nothing when invoice is null", () => {
    const { container } = renderItems(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when invoice is undefined", () => {
    const { container } = renderItems(undefined);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when invoice is a string", () => {
    const { container } = renderItems("not-an-object");
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when invoice is a number", () => {
    const { container } = renderItems(42);
    expect(container.firstChild).toBeNull();
  });

  it("renders without throwing when invoice has no optional fields", () => {
    expect(() => renderItems({ id: "x" })).not.toThrow();
  });

  it("renders one selectable checkbox per detail item", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    expect(getCheckbox("inv-001-doc-invoice")).toBeInTheDocument();
    expect(getCheckbox("inv-001-doc-pod")).toBeInTheDocument();
    expect(getCheckbox("inv-001-doc-terms")).toBeInTheDocument();
  });

  it("row checkboxes have a descriptive aria-label", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    expect(getCheckbox("inv-001-doc-pod")).toHaveAttribute(
      "aria-label",
      "Select document Proof of delivery (inv-001-doc-pod)"
    );
  });

  it("toggling a row checkbox reveals the bulk-action toolbar", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-selection-count")).toHaveTextContent(
      "1 of 3 documents selected."
    );
  });

  it("the bulk-selection-count region announces count updates politely", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    const region = screen.getByTestId("bulk-selection-count");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("clearing the selection via the Clear button hides the toolbar again", async () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-clear"));
    await waitFor(() =>
      expect(screen.queryByTestId("bulk-actions-toolbar")).not.toBeInTheDocument()
    );
    expect(getCheckbox("inv-001-doc-invoice")).not.toBeChecked();
  });

  it("select-all selects every visible row when in 'partial' state", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-select-all"));
    expect(getCheckbox("inv-001-doc-invoice")).toBeChecked();
    expect(getCheckbox("inv-001-doc-pod")).toBeChecked();
    expect(getCheckbox("inv-001-doc-terms")).toBeChecked();
    expect(screen.getByTestId("bulk-selection-count")).toHaveTextContent(
      "3 of 3 documents selected."
    );
    expect(screen.getByTestId("bulk-select-all").indeterminate).toBe(false);
  });

  it("select-all in 'all' state deselects every visible row", async () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-select-all"));
    fireEvent.click(screen.getByTestId("bulk-select-all"));
    await waitFor(() =>
      expect(screen.queryByTestId("bulk-actions-toolbar")).not.toBeInTheDocument()
    );
    expect(getCheckbox("inv-001-doc-invoice")).not.toBeChecked();
  });

  it("selected rows carry a data-selected='true' attribute", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-pod"));
    expect(getRow("inv-001-doc-pod")).toHaveAttribute("data-selected", "true");
    expect(getRow("inv-001-doc-invoice")).toHaveAttribute("data-selected", "false");
  });

  it("shows indeterminate state on select-all when partially selected", () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(getCheckbox("inv-001-doc-pod"));
    expect(screen.getByTestId("bulk-select-all")).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByTestId("bulk-select-all").indeterminate).toBe(true);
  });

  it("Export invokes the onBulkExport handler with the selected items", async () => {
    const onBulkExport = jest.fn(() => ({ count: 2 }));
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} onBulkExport={onBulkExport} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(getCheckbox("inv-001-doc-pod"));
    fireEvent.click(screen.getByTestId("bulk-export"));
    await flushPromises();

    expect(onBulkExport).toHaveBeenCalledTimes(1);
    const [calledWith] = onBulkExport.mock.calls[0];
    expect(calledWith.map((i) => i.id)).toEqual(["inv-001-doc-invoice", "inv-001-doc-pod"]);
  });

  it("Export calls toast.success on success when supplied", async () => {
    const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    render(
      <InvoiceDetailItems
        initialItems={SAMPLE_ITEMS}
        toast={toast}
        onBulkExport={() => ({ count: 1 })}
      />
    );
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-export"));
    await flushPromises();
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Exported 1 document"),
      expect.any(String)
    );
  });

  it("keeps the selection and reports export failures for retry", async () => {
    const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    render(
      <InvoiceDetailItems
        initialItems={SAMPLE_ITEMS}
        toast={toast}
        onBulkExport={() => {
          throw new Error("download failed");
        }}
      />
    );
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-export"));
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith("Could not export the selected documents. Please try again.", "Export failed");
    expect(getCheckbox("inv-001-doc-invoice")).toBeChecked();
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
  });

  it("Delete opens a confirm dialog", async () => {
    render(<InvoiceDetailItems initialItems={SAMPLE_ITEMS} />);
    fireEvent.click(getCheckbox("inv-001-doc-invoice"));
    fireEvent.click(screen.getByTestId("bulk-delete"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.investDetail.fundButtonAriaLabel })
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV-2: unknown / empty status value
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-2: unknown status degrades gracefully", () => {
  it("does not throw for an unknown status value", () => {
    expect(() => renderItems({ ...validInvoice, status: "MYSTERY_STATUS_VALUE" })).not.toThrow();
  });

  it("passes the status string through to StatusPill", () => {
    renderItems({ ...validInvoice, status: "MYSTERY_STATUS_VALUE" });
    expect(screen.getByTestId("status-pill")).toHaveTextContent("MYSTERY_STATUS_VALUE");
  });

  it("does not throw for empty string status", () => {
    expect(() => renderItems({ ...validInvoice, status: "" })).not.toThrow();
  });

  it("does not throw for null status", () => {
    expect(() => renderItems({ ...validInvoice, status: null })).not.toThrow();
  });

  it("does not throw for undefined status", () => {
    expect(() => renderItems({ ...validInvoice, status: undefined })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV-3: Fund button disabled state
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-3: Fund button disabled state", () => {
  it("Fund button is enabled when isFundingDisabled is false", () => {
    renderItems(validInvoice, { isFundingDisabled: false });
    const btn = screen.getByRole("button", {
      name: copy.investDetail.fundButtonAriaLabel,
    });
    expect(btn).not.toBeDisabled();
  });

  it("Fund button is disabled when isFundingDisabled is true", () => {
    renderItems(validInvoice, { isFundingDisabled: true });
    const btn = screen.getByRole("button", {
      name: copy.investDetail.fundButtonAriaLabel,
    });
    expect(btn).toBeDisabled();
  });

  it("Copy link button is never disabled regardless of isFundingDisabled", () => {
    renderItems(validInvoice, { isFundingDisabled: true });
    expect(
      screen.getByRole("button", { name: copy.investDetail.copyLinkAriaLabel })
    ).not.toBeDisabled();
  });

  it("Print button is never disabled regardless of isFundingDisabled", () => {
    renderItems(validInvoice, { isFundingDisabled: true });
    expect(
      screen.getByRole("button", { name: copy.investDetail.printAriaLabel })
    ).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV-4: Copy from investDetail namespace
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-4: copy from investDetail namespace", () => {
  beforeEach(() => renderItems(validInvoice));

  it("renders heading from copy.investDetail.dtIssuer", () => {
    expect(screen.getByText(copy.investDetail.dtIssuer)).toBeInTheDocument();
  });

  it("renders amount dt from copy.investDetail.dtAmount", () => {
    expect(screen.getByText(copy.investDetail.dtAmount)).toBeInTheDocument();
  });

  it("renders yield dt from copy.investDetail.dtYield", () => {
    expect(screen.getByText(copy.investDetail.dtYield)).toBeInTheDocument();
  });

  it("renders maturity dt from copy.investDetail.dtMaturity", () => {
    expect(screen.getByText(copy.investDetail.dtMaturity)).toBeInTheDocument();
  });

  it("renders status dt from copy.investDetail.dtStatus", () => {
    expect(screen.getByText(copy.investDetail.dtStatus)).toBeInTheDocument();
  });

  it("renders Fund button label from copy.investDetail.fundButton", () => {
    expect(
      screen.getByRole("button", { name: copy.investDetail.fundButtonAriaLabel })
    ).toHaveTextContent(copy.investDetail.fundButton);
  });

  it("renders Copy link button label from copy.investDetail.copyLinkButton", () => {
    expect(
      screen.getByRole("button", { name: copy.investDetail.copyLinkAriaLabel })
    ).toHaveTextContent(copy.investDetail.copyLinkButton);
  });

  it("renders Print button label from copy.investDetail.printButton", () => {
    expect(
      screen.getByRole("button", { name: copy.investDetail.printAriaLabel })
    ).toHaveTextContent(copy.investDetail.printButton);
  });

  it("renders disclaimer text from copy.investDetail.disclaimer", () => {
    // Match the exact disclaimer string rendered as a leaf text node.
    expect(screen.getByText(copy.investDetail.disclaimer)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV-5: HTML-special character sanitization
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-5: HTML-special char sanitization", () => {
  it("strips < and > from issuer name", () => {
    renderItems({ ...validInvoice, issuer: "<script>Evil</script>" });
    // The heading should not contain the angle-bracket tags
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).not.toContain("<");
    expect(heading.textContent).not.toContain(">");
    expect(heading.textContent).toContain("scriptEvil/script");
  });

  it("strips double-quote from currency field (XSS probe)", () => {
    renderItems({ ...validInvoice, currency: 'US"D' });
    // Should not throw and rendered text must not include the quote
    const amountDd = screen.getAllByRole("term")[0].nextElementSibling;
    expect(amountDd).not.toBeNull();
    expect(amountDd?.textContent).not.toContain('"');
  });

  it("strips { and } from issuer name", () => {
    renderItems({ ...validInvoice, issuer: "{injected}" });
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).not.toContain("{");
    expect(heading.textContent).not.toContain("}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INV-6: Yield formatting sentinel guard
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — INV-6: yield formatting", () => {
  it("appends % to a valid numeric yield", () => {
    renderItems({ ...validInvoice, yield: "8.2" });
    expect(screen.getByText("8.2%")).toBeInTheDocument();
  });

  it("appends % to an integer yield", () => {
    renderItems({ ...validInvoice, yield: 5 });
    expect(screen.getByText("5%")).toBeInTheDocument();
  });

  it("shows the fallback sentinel without % when yield is null", () => {
    renderItems({ ...validInvoice, yield: null });
    const sentinel = INVALID_VALUE_FALLBACK;
    // Rendered text must contain the sentinel but NOT "sentinel%"
    expect(screen.getByText(sentinel)).toBeInTheDocument();
    expect(screen.queryByText(`${sentinel}%`)).not.toBeInTheDocument();
  });

  it("shows the fallback sentinel without % when yield is undefined", () => {
    renderItems({ ...validInvoice, yield: undefined });
    const sentinel = INVALID_VALUE_FALLBACK;
    expect(screen.getByText(sentinel)).toBeInTheDocument();
    expect(screen.queryByText(`${sentinel}%`)).not.toBeInTheDocument();
  });

  it("shows the fallback sentinel without % for non-numeric yield string", () => {
    renderItems({ ...validInvoice, yield: "not-a-number" });
    const sentinel = INVALID_VALUE_FALLBACK;
    expect(screen.getByText(sentinel)).toBeInTheDocument();
    expect(screen.queryByText(`${sentinel}%`)).not.toBeInTheDocument();
  });

  it("shows zero percent for yield value of 0", () => {
    renderItems({ ...validInvoice, yield: 0 });
    // 0 is a valid number — should format as "0%" not the sentinel
    expect(screen.queryByText(INVALID_VALUE_FALLBACK)).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — boundary cases", () => {
  it("renders '—' fallback for missing issuer", () => {
    renderItems({ id: "x" });
    // Both the heading and the dd for issuer should show the em-dash or "Issuer" label
    const issuerDd = screen.getAllByRole("definition").find((el) => el.textContent === "—");
    expect(issuerDd).toBeDefined();
  });

  it("renders '—' fallback for missing dueDate", () => {
    renderItems({ id: "x", issuer: "Test" });
    const dds = screen.getAllByRole("definition");
    const emDash = dds.find((el) => el.textContent === "—");
    expect(emDash).toBeDefined();
  });

  it("does not crash when invoice has extra unexpected fields", () => {
    expect(() =>
      renderItems({ ...validInvoice, unknownProp: { nested: true }, extra: 999 })
    ).not.toThrow();
  });

  it("renders a numeric amount correctly", () => {
    renderItems({ ...validInvoice, amount: 12500 });
    // Should not throw and some amount text must appear
    const dds = screen.getAllByRole("definition");
    expect(dds.length).toBeGreaterThan(0);
  });

  it("renders the definition list structure (dt/dd pairs)", () => {
    renderItems(validInvoice);
    expect(screen.getByText(copy.investDetail.dtIssuer).tagName).toBe("DT");
    expect(screen.getByText(copy.investDetail.dtAmount).tagName).toBe("DT");
    expect(screen.getByText(copy.investDetail.dtYield).tagName).toBe("DT");
    expect(screen.getByText(copy.investDetail.dtMaturity).tagName).toBe("DT");
    expect(screen.getByText(copy.investDetail.dtStatus).tagName).toBe("DT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Callback wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — callback wiring", () => {
  it("calls onFund when Fund button is clicked", () => {
    const onFund = jest.fn();
    renderItems(validInvoice, { onFund });

    fireEvent.click(screen.getByRole("button", { name: copy.investDetail.fundButtonAriaLabel }));

    expect(onFund).toHaveBeenCalledTimes(1);
  });

  it("calls onCopyLink when Copy link button is clicked", () => {
    const onCopyLink = jest.fn();
    renderItems(validInvoice, { onCopyLink });

    fireEvent.click(screen.getByRole("button", { name: copy.investDetail.copyLinkAriaLabel }));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it("calls onPrint when Print button is clicked", () => {
    const onPrint = jest.fn();
    renderItems(validInvoice, { onPrint });

    fireEvent.click(screen.getByRole("button", { name: copy.investDetail.printAriaLabel }));

    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it("does not call onFund when Fund button is disabled", () => {
    const onFund = jest.fn();
    renderItems(validInvoice, { isFundingDisabled: true, onFund });

    fireEvent.click(screen.getByRole("button", { name: copy.investDetail.fundButtonAriaLabel }));

    expect(onFund).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceDetailItems — accessibility", () => {
  it("all three action buttons have aria-label attributes", () => {
    renderItems(validInvoice);

    expect(
      screen.getByRole("button", { name: copy.investDetail.fundButtonAriaLabel })
    ).toHaveAttribute("aria-label");

    expect(
      screen.getByRole("button", { name: copy.investDetail.copyLinkAriaLabel })
    ).toHaveAttribute("aria-label");

    expect(screen.getByRole("button", { name: copy.investDetail.printAriaLabel })).toHaveAttribute(
      "aria-label"
    );
  });

  it("all buttons are keyboard-focusable (tabIndex is not -1)", () => {
    renderItems(validInvoice);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).not.toHaveAttribute("tabindex", "-1");
    });
  });

  it("section has an aria-labelledby pointing to the invoice heading", () => {
    renderItems(validInvoice);
    const section = document.querySelector("section");
    expect(section).toHaveAttribute("aria-labelledby", "invoice-summary-heading");
    expect(document.getElementById("invoice-summary-heading")).toBeInTheDocument();
  });

  it("passes axe accessibility checks for a fully-loaded invoice", async () => {
    const { container } = renderItems(validInvoice);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks when Fund button is disabled", async () => {
    const { container } = renderItems(validInvoice, { isFundingDisabled: true });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks for a minimal invoice (id only)", async () => {
    const { container } = renderItems({ id: "x" });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
