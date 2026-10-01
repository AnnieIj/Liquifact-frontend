/**
 * @jest-environment jsdom
 *
 * @file app/invest/[id]/InvoiceDetailExport.test.jsx
 *
 * Tests for concurrent execution hardening in InvoiceDetailExport.
 * Covers debouncing, loading states, error handling, and race conditions.
 */

import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InvoiceDetailExport from "./InvoiceDetailExport";

// Mock the export utilities
jest.mock("@/utils/export", () => ({
  exportAsCSV: jest.fn(),
  exportAsJSON: jest.fn(),
}));

const { exportAsCSV, exportAsJSON } = require("@/utils/export");

describe("InvoiceDetailExport - concurrent execution hardening", () => {
  const defaultInvoice = {
    id: "inv-001",
    issuer: "Acme Corp",
    amount: "12500",
    currency: "USD",
    dueDate: "2030-01-01",
    yield: "8.5",
    status: "Open",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("loading state protection", () => {
    it("disables buttons when invoice is null", () => {
      render(<InvoiceDetailExport invoice={null} />);
      const csvButton = screen.getByLabelText(/export csv/i);
      const jsonButton = screen.getByLabelText(/export json/i);

      expect(csvButton).toBeDisabled();
      expect(jsonButton).toBeDisabled();
    });

    it("disables buttons when invoice is undefined", () => {
      render(<InvoiceDetailExport invoice={undefined} />);
      const csvButton = screen.getByLabelText(/export csv/i);
      const jsonButton = screen.getByLabelText(/export json/i);

      expect(csvButton).toBeDisabled();
      expect(jsonButton).toBeDisabled();
    });

    it("enables buttons when invoice is valid", () => {
      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);
      const jsonButton = screen.getByLabelText(/export json/i);

      expect(csvButton).not.toBeDisabled();
      expect(jsonButton).not.toBeDisabled();
    });

    it("disables buttons during export", () => {
      exportAsCSV.mockImplementation(() => {
        // Simulate async operation
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Buttons should be disabled during export
      expect(csvButton).toBeDisabled();
      expect(screen.getByLabelText(/export json/i)).toBeDisabled();
    });

    it("shows loading text during export", () => {
      exportAsCSV.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(csvButton).toHaveTextContent("Exporting...");
    });

    it("sets aria-busy during export", () => {
      exportAsCSV.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(csvButton).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("debounce protection", () => {
    it("debounces rapid clicks on CSV button", () => {
      exportAsCSV.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      // Click multiple times rapidly
      fireEvent.click(csvButton);
      fireEvent.click(csvButton);
      fireEvent.click(csvButton);

      // Only one export should be called after debounce
      jest.advanceTimersByTime(300);

      expect(exportAsCSV).toHaveBeenCalledTimes(1);
    });

    it("debounces rapid clicks on JSON button", () => {
      exportAsJSON.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const jsonButton = screen.getByLabelText(/export json/i);

      // Click multiple times rapidly
      fireEvent.click(jsonButton);
      fireEvent.click(jsonButton);
      fireEvent.click(jsonButton);

      // Only one export should be called after debounce
      jest.advanceTimersByTime(300);

      expect(exportAsJSON).toHaveBeenCalledTimes(1);
    });

    it("allows separate CSV and JSON exports without conflict", () => {
      exportAsCSV.mockImplementation(() => {});
      exportAsJSON.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);
      const jsonButton = screen.getByLabelText(/export json/i);

      fireEvent.click(csvButton);
      fireEvent.click(jsonButton);

      jest.advanceTimersByTime(300);

      expect(exportAsCSV).toHaveBeenCalledTimes(1);
      expect(exportAsJSON).toHaveBeenCalledTimes(1);
    });
  });

  describe("concurrent export prevention", () => {
    it("prevents concurrent CSV exports", async () => {
      let resolveExport;
      exportAsCSV.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      // Start first export
      fireEvent.click(csvButton);

      // Try to start second export while first is in progress
      fireEvent.click(csvButton);

      // Only one export should be in progress
      expect(exportAsCSV).toHaveBeenCalledTimes(1);

      // Complete the first export
      resolveExport();
      await waitFor(() => {
        expect(csvButton).not.toBeDisabled();
      });
    });

    it("prevents concurrent JSON exports", async () => {
      let resolveExport;
      exportAsJSON.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const jsonButton = screen.getByLabelText(/export json/i);

      // Start first export
      fireEvent.click(jsonButton);

      // Try to start second export while first is in progress
      fireEvent.click(jsonButton);

      // Only one export should be in progress
      expect(exportAsJSON).toHaveBeenCalledTimes(1);

      // Complete the first export
      resolveExport();
      await waitFor(() => {
        expect(jsonButton).not.toBeDisabled();
      });
    });

    it("allows CSV export after JSON export completes", async () => {
      exportAsCSV.mockImplementation(() => {});
      exportAsJSON.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);
      const jsonButton = screen.getByLabelText(/export json/i);

      // Do JSON export
      fireEvent.click(jsonButton);
      jest.advanceTimersByTime(300);

      // Wait for completion
      await waitFor(() => {
        expect(jsonButton).not.toBeDisabled();
      });

      // Now do CSV export
      fireEvent.click(csvButton);
      jest.advanceTimersByTime(300);

      expect(exportAsCSV).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("handles export errors gracefully", async () => {
      exportAsCSV.mockImplementation(() => {
        throw new Error("Export failed");
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to export csv/i)).toBeInTheDocument();
      });

      // Button should be re-enabled after error
      expect(csvButton).not.toBeDisabled();
    });

    it("clears error message after timeout", async () => {
      exportAsCSV.mockImplementation(() => {
        throw new Error("Export failed");
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to export csv/i)).toBeInTheDocument();
      });

      // Fast-forward past the error timeout
      jest.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(screen.queryByText(/failed to export csv/i)).not.toBeInTheDocument();
      });
    });

    it("handles invalid invoice data gracefully", () => {
      const invalidInvoice = {
        id: null,
        issuer: null,
        amount: null,
        currency: null,
        dueDate: null,
        yield: null,
        status: null,
      };

      render(<InvoiceDetailExport invoice={invalidInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Should show error instead of crashing
      expect(screen.getByText(/invalid invoice data/i)).toBeInTheDocument();
    });

    it("handles malformed invoice object", () => {
      const malformedInvoice = {
        id: "inv-001",
        // Missing other required fields
      };

      render(<InvoiceDetailExport invoice={malformedInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Should handle gracefully with fallback values
      expect(exportAsCSV).toHaveBeenCalled();
    });
  });

  describe("input validation", () => {
    it("validates invoice structure before export", () => {
      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "inv-001",
            issuer: "Acme Corp",
          }),
        ]),
        "invoice-inv-001.csv"
      );
    });

    it("provides fallback for missing invoice id", () => {
      const invoiceWithoutId = {
        ...defaultInvoice,
        id: null,
      };

      render(<InvoiceDetailExport invoice={invoiceWithoutId} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "unknown",
          }),
        ]),
        "invoice-unknown.csv"
      );
    });

    it("handles non-object invoice gracefully", () => {
      render(<InvoiceDetailExport invoice="not an object" />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Should show error instead of crashing
      expect(screen.getByText(/invalid invoice data/i)).toBeInTheDocument();
    });

    it("handles array invoice gracefully", () => {
      render(<InvoiceDetailExport invoice={[defaultInvoice]} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Should show error instead of crashing
      expect(screen.getByText(/invalid invoice data/i)).toBeInTheDocument();
    });
  });

  describe("type safety in export record", () => {
    it("handles numeric amount field", () => {
      const numericInvoice = {
        ...defaultInvoice,
        amount: 12500,
        yield: 8.5,
      };

      render(<InvoiceDetailExport invoice={numericInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            amount: 12500,
            yield: 8.5,
          }),
        ]),
        expect.any(String)
      );
    });

    it("handles non-string yield field", () => {
      const numericYieldInvoice = {
        ...defaultInvoice,
        yield: 8.5,
      };

      render(<InvoiceDetailExport invoice={numericYieldInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            yield: 8.5,
          }),
        ]),
        expect.any(String)
      );
    });
  });

  describe("boundary cases", () => {
    it("handles empty invoice object", () => {
      render(<InvoiceDetailExport invoice={{}} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      // Should export with all fallback values
      expect(exportAsCSV).toHaveBeenCalled();
    });

    it("handles invoice with very long strings", () => {
      const longStringInvoice = {
        ...defaultInvoice,
        issuer: "A".repeat(10000),
        amount: "9".repeat(10000),
      };

      render(<InvoiceDetailExport invoice={longStringInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalled();
    });

    it("handles invoice with special characters", () => {
      const specialCharInvoice = {
        ...defaultInvoice,
        issuer: 'Acme <script>alert("xss")</script> Corp',
        amount: "=SUM(A1:A10)",
      };

      render(<InvoiceDetailExport invoice={specialCharInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(exportAsCSV).toHaveBeenCalled();
    });
  });

  describe("accessibility during loading", () => {
    it("maintains aria-busy state during export", () => {
      exportAsCSV.mockImplementation(() => {});

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      expect(csvButton).toHaveAttribute("aria-busy", "true");

      // After completion, aria-busy should be false
      jest.advanceTimersByTime(300);
      expect(csvButton).toHaveAttribute("aria-busy", "false");
    });

    it("announces errors via aria-live", () => {
      exportAsCSV.mockImplementation(() => {
        throw new Error("Export failed");
      });

      render(<InvoiceDetailExport invoice={defaultInvoice} />);
      const csvButton = screen.getByLabelText(/export csv/i);

      fireEvent.click(csvButton);

      const errorElement = screen.getByRole("alert");
      expect(errorElement).toHaveAttribute("aria-live", "polite");
    });
  });
});
