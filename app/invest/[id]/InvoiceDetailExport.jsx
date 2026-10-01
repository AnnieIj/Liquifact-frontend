"use client";

/**
 * @file app/invest/[id]/InvoiceDetailExport.jsx
 *
 * Client-side CSV/JSON export for the invoice detail view.
 *
 * Renders two buttons (Export CSV, Export JSON) that trigger a browser
 * download of the current invoice's metadata. No server round-trip.
 *
 * Safe escaping is delegated to `utils/export.js` which handles commas,
 * quotes, and newlines in CSV values.
 *
 * Concurrent execution safety:
 * - Uses loading state to prevent multiple simultaneous exports
 * - Debounces rapid button clicks to avoid duplicate exports
 * - Provides user feedback during export operations
 * - Validates invoice data before export
 */

import { useCallback, useState, useRef } from "react";
import { exportAsCSV, exportAsJSON } from "@/utils/export";
import { copy } from "@/app/copy/en";
import { useToast } from "@/components/ToastProvider";

const detail = copy.invest.detail;

/**
 * Strip the invoice object down to a safe, flat export record.
 * Validates invoice structure and returns null for invalid data.
 *
 * @param {object|null|undefined} invoice
 * @returns {object|null}
 */
function toExportRecord(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  // Validate required fields with fallbacks
  const record = {
    id: typeof invoice.id === "string" ? invoice.id : "unknown",
    issuer: typeof invoice.issuer === "string" ? invoice.issuer : "",
    amount: typeof invoice.amount === "string" || typeof invoice.amount === "number" ? invoice.amount : "",
    currency: typeof invoice.currency === "string" ? invoice.currency : "",
    dueDate: typeof invoice.dueDate === "string" ? invoice.dueDate : "",
    yield: typeof invoice.yield === "string" || typeof invoice.yield === "number" ? invoice.yield : "",
    status: typeof invoice.status === "string" ? invoice.status : "",
  };

  return record;
}

/**
 * Debounce utility to prevent rapid consecutive function calls.
 * Ensures only the last call within the delay window executes.
 *
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function useDebounce(func, delay) {
  const timeoutRef = useRef(null);

  return useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        func(...args);
        timeoutRef.current = null;
      }, delay);
    },
    [func, delay]
  );
}

/**
 * InvoiceDetailExport — CSV/JSON download buttons for a single invoice.
 *
 * Features concurrent execution safety:
 * - Loading state prevents multiple simultaneous exports
 * - Debounced clicks prevent duplicate exports
 * - Error handling with user feedback
 * - Input validation before export
 *
 * @param {object} props
 * @param {object|null} props.invoice - The invoice object to export
 */
export default function InvoiceDetailExport({ invoice }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const exportInProgressRef = useRef(false);

  const disabled = !invoice || isExporting;

  /**
   * Safely execute export with concurrent execution protection.
   * Prevents multiple simultaneous exports of the same type.
   *
   * @param {Function} exportFn - The export function to execute
   * @param {string} filename - The filename for the export
   * @param {string} exportType - For error messages (CSV or JSON)
   */
  const safeExport = useCallback(
    async (exportFn, filename, exportType) => {
      // Guard against concurrent exports
      if (exportInProgressRef.current) {
        console.warn(`Export already in progress, ignoring ${exportType} request`);
        return;
      }

      // Validate invoice data
      const record = toExportRecord(invoice);
      if (!record) {
        setExportError(`Invalid invoice data for ${exportType} export`);
        setTimeout(() => setExportError(null), 3000);
        return;
      }

      try {
        exportInProgressRef.current = true;
        setIsExporting(true);
        setExportError(null);

        // Execute export
        exportFn([record], filename);

        // Clear error after successful export
        setExportError(null);
      } catch (error) {
        console.error(`Failed to export ${exportType}:`, error);
        setExportError(`Failed to export ${exportType}: ${error.message}`);
        setTimeout(() => setExportError(null), 3000);
      } finally {
        setIsExporting(false);
        exportInProgressRef.current = false;
      }
    },
    [invoice]
  );

  const handleExportCSV = useCallback(() => {
    if (!invoice) return;
    safeExport(exportAsCSV, `invoice-${invoice.id || "unknown"}.csv`, "CSV");
  }, [invoice, safeExport]);

  const handleExportJSON = useCallback(() => {
    if (!invoice) return;
    safeExport(exportAsJSON, `invoice-${invoice.id || "unknown"}.json`, "JSON");
  }, [invoice, safeExport]);

  // Debounce export handlers to prevent rapid clicks
  const debouncedExportCSV = useDebounce(handleExportCSV, 300);
  const debouncedExportJSON = useDebounce(handleExportJSON, 300);

  return (
    <div className="no-print flex flex-col gap-2" role="group" aria-label={detail.exportGroupLabel}>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={debouncedExportCSV}
          disabled={disabled}
          aria-label={detail.exportCSVLabel}
          aria-busy={isExporting}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-cyan-400 hover:bg-slate-700 focus-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? "Exporting..." : detail.exportCSVButton}
        </button>
        <button
          type="button"
          onClick={debouncedExportJSON}
          disabled={disabled}
          aria-label={detail.exportJSONLabel}
          aria-busy={isExporting}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-cyan-400 hover:bg-slate-700 focus-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? "Exporting..." : detail.exportJSONButton}
        </button>
      </div>
      {exportError && (
        <div
          role="alert"
          aria-live="polite"
          className="text-red-400 text-xs"
        >
          {exportError}
        </div>
      )}
    </div>
  );
}
