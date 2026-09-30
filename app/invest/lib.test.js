/**
 * @file app/invest/lib.test.js
 *
 * Focused invariant, boundary, and regression tests for app/invest/lib.js.
 *
 * COVERAGE MAP
 * ─────────────────────────────────────────────────────────────────────────────
 *  LIB-1  MOCK_INVOICES is a frozen array of frozen objects (immutability)
 *  LIB-2  Invoice field contract — id, issuer, amount/amountValue, currency,
 *           dueDate, yield/yieldValue shapes are enforced at load time
 *  LIB-3  status is one of the four canonical INVOICE_STATUSES values
 *  LIB-4  events shape — id, type, actor, occurredAt validated at load time
 *  LIB-5  daysUntilMaturity — valid input, NaN for invalid, boundary cases,
 *           time-of-day independence, concurrent call safety
 *  LIB-6  getInvoiceById — happy path, non-string inputs, empty string, unknown id
 *  LIB-7  loadMockInvoices — always resolves, returns copy, test-hook validation,
 *           repeated concurrent calls produce independent arrays
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MOCK_INVOICES, loadMockInvoices, daysUntilMaturity, getInvoiceById } from "./lib";

// ─── LIB-1: MOCK_INVOICES immutability ───────────────────────────────────────

describe("LIB-1: MOCK_INVOICES is a frozen array of frozen objects", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(MOCK_INVOICES)).toBe(true);
    expect(MOCK_INVOICES.length).toBeGreaterThan(0);
  });

  it("the array itself is frozen", () => {
    expect(Object.isFrozen(MOCK_INVOICES)).toBe(true);
  });

  it("pushing to the array throws in strict mode and is silently rejected otherwise", () => {
    expect(() => {
      "use strict";
      MOCK_INVOICES.push({ id: "hacked" });
    }).toThrow();
  });

  it("every invoice object is frozen", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(Object.isFrozen(inv)).toBe(true);
    });
  });

  it("mutating a top-level field on a frozen invoice throws in strict mode", () => {
    expect(() => {
      "use strict";
      MOCK_INVOICES[0].id = "mutated";
    }).toThrow();
  });

  it("every events array inside each invoice is frozen", () => {
    MOCK_INVOICES.forEach((inv) => {
      if (inv.events) {
        expect(Object.isFrozen(inv.events)).toBe(true);
        inv.events.forEach((evt) => expect(Object.isFrozen(evt)).toBe(true));
      }
    });
  });
});

// ─── LIB-2 / LIB-3: invoice field contract ───────────────────────────────────

describe("LIB-2 / LIB-3: every MOCK_INVOICE satisfies the field contract", () => {
  it("every invoice has a non-empty string id", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(typeof inv.id).toBe("string");
      expect(inv.id.length).toBeGreaterThan(0);
    });
  });

  it("every invoice has a string issuer", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(typeof inv.issuer).toBe("string");
    });
  });

  it("every invoice has a string or number amount", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(["string", "number"]).toContain(typeof inv.amount);
    });
  });

  it("every invoice has a finite non-negative amountValue", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(typeof inv.amountValue).toBe("number");
      expect(Number.isFinite(inv.amountValue)).toBe(true);
      expect(inv.amountValue).toBeGreaterThanOrEqual(0);
    });
  });

  it("every invoice has a non-empty string currency", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(typeof inv.currency).toBe("string");
      expect(inv.currency.length).toBeGreaterThan(0);
    });
  });

  it("every invoice dueDate is a YYYY-MM-DD string", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(inv.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("every invoice has a string or number yield", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(["string", "number"]).toContain(typeof inv.yield);
    });
  });

  it("every invoice has a finite non-negative yieldValue", () => {
    MOCK_INVOICES.forEach((inv) => {
      expect(typeof inv.yieldValue).toBe("number");
      expect(Number.isFinite(inv.yieldValue)).toBe(true);
      expect(inv.yieldValue).toBeGreaterThanOrEqual(0);
    });
  });

  // LIB-3
  it("every invoice status is a canonical INVOICE_STATUSES value", () => {
    const VALID = new Set(["Open", "Funded", "Settled", "Overdue"]);
    MOCK_INVOICES.forEach((inv) => {
      expect(VALID.has(inv.status)).toBe(true);
    });
  });

  it("all invoice ids are unique", () => {
    const ids = MOCK_INVOICES.map((inv) => inv.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── LIB-4: event shape ──────────────────────────────────────────────────────

describe("LIB-4: event objects inside each invoice satisfy the shape contract", () => {
  const VALID_TYPES = new Set(["uploaded", "verified", "listed", "funded", "settled", "unknown"]);

  it("every event has a non-empty string id", () => {
    MOCK_INVOICES.forEach((inv) => {
      (inv.events || []).forEach((evt) => {
        expect(typeof evt.id).toBe("string");
        expect(evt.id.length).toBeGreaterThan(0);
      });
    });
  });

  it("every event type is one of the canonical INVOICE_EVENT_TYPES values", () => {
    MOCK_INVOICES.forEach((inv) => {
      (inv.events || []).forEach((evt) => {
        expect(VALID_TYPES.has(evt.type)).toBe(true);
      });
    });
  });

  it("every event actor is a string", () => {
    MOCK_INVOICES.forEach((inv) => {
      (inv.events || []).forEach((evt) => {
        expect(typeof evt.actor).toBe("string");
      });
    });
  });

  it("every event occurredAt is an ISO-8601 timestamp string", () => {
    MOCK_INVOICES.forEach((inv) => {
      (inv.events || []).forEach((evt) => {
        expect(typeof evt.occurredAt).toBe("string");
        expect(evt.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });
  });

  it("all event ids within an invoice are unique", () => {
    MOCK_INVOICES.forEach((inv) => {
      if (!inv.events) return;
      const evtIds = inv.events.map((e) => e.id);
      expect(new Set(evtIds).size).toBe(evtIds.length);
    });
  });
});

// ─── LIB-5: daysUntilMaturity ────────────────────────────────────────────────

describe("LIB-5: daysUntilMaturity — valid inputs", () => {
  const REF = new Date("2026-06-26T12:00:00Z");

  it("returns 0 when maturity is today", () => {
    expect(daysUntilMaturity("2026-06-26", REF)).toBe(0);
  });

  it("returns positive days for a future date", () => {
    expect(daysUntilMaturity("2026-07-06", REF)).toBe(10);
  });

  it("returns negative days for a past date", () => {
    expect(daysUntilMaturity("2026-06-16", REF)).toBe(-10);
  });

  it("returns 1 for tomorrow", () => {
    expect(daysUntilMaturity("2026-06-27", REF)).toBe(1);
  });

  it("returns -1 for yesterday", () => {
    expect(daysUntilMaturity("2026-06-25", REF)).toBe(-1);
  });

  it("is time-of-day independent — morning and evening give the same result", () => {
    const morning = new Date("2026-06-26T00:01:00Z");
    const evening = new Date("2026-06-26T23:59:00Z");
    expect(daysUntilMaturity("2026-07-01", morning)).toBe(daysUntilMaturity("2026-07-01", evening));
  });

  it("defaults now to today and returns a number (smoke test)", () => {
    expect(typeof daysUntilMaturity("2026-12-31")).toBe("number");
  });

  it("returns an integer (no fractional days)", () => {
    const result = daysUntilMaturity("2026-07-10", REF);
    expect(result).toBe(Math.round(result));
  });
});

describe("LIB-5: daysUntilMaturity — NaN for invalid input", () => {
  it("returns NaN for null", () => {
    expect(Number.isNaN(daysUntilMaturity(null))).toBe(true);
  });

  it("returns NaN for undefined", () => {
    expect(Number.isNaN(daysUntilMaturity(undefined))).toBe(true);
  });

  it("returns NaN for an empty string", () => {
    expect(Number.isNaN(daysUntilMaturity(""))).toBe(true);
  });

  it("returns NaN for a number", () => {
    expect(Number.isNaN(daysUntilMaturity(20260626))).toBe(true);
  });

  it("returns NaN for a date-time string (not YYYY-MM-DD)", () => {
    expect(Number.isNaN(daysUntilMaturity("2026-06-26T00:00:00Z"))).toBe(true);
  });

  it("returns NaN for a random non-date string", () => {
    expect(Number.isNaN(daysUntilMaturity("not-a-date"))).toBe(true);
  });

  it("returns NaN for an out-of-range date string (month 13)", () => {
    expect(Number.isNaN(daysUntilMaturity("2026-13-01"))).toBe(true);
  });

  it("returns NaN for an out-of-range date string (day 99)", () => {
    expect(Number.isNaN(daysUntilMaturity("2026-06-99"))).toBe(true);
  });

  it("returns NaN for an object input", () => {
    expect(Number.isNaN(daysUntilMaturity({ date: "2026-06-26" }))).toBe(true);
  });
});

describe("LIB-5: daysUntilMaturity — concurrent call safety", () => {
  it("produces independent results when called concurrently with different dates", () => {
    const REF = new Date("2026-06-26T00:00:00Z");
    const results = [
      daysUntilMaturity("2026-06-27", REF),
      daysUntilMaturity("2026-06-28", REF),
      daysUntilMaturity("2026-06-29", REF),
    ];
    expect(results).toEqual([1, 2, 3]);
  });

  it("repeated calls with the same input return the same result (deterministic)", () => {
    const REF = new Date("2026-06-26T00:00:00Z");
    const first = daysUntilMaturity("2026-07-10", REF);
    const second = daysUntilMaturity("2026-07-10", REF);
    expect(first).toBe(second);
  });
});

// ─── LIB-6: getInvoiceById ───────────────────────────────────────────────────

describe("LIB-6: getInvoiceById — valid lookups", () => {
  it("returns the correct invoice for a known id", () => {
    const inv = getInvoiceById("inv-001");
    expect(inv).toBeDefined();
    expect(inv.id).toBe("inv-001");
    expect(inv.issuer).toBe("Acme Supplies Ltd");
  });

  it("returns a different invoice for each distinct id", () => {
    const a = getInvoiceById("inv-001");
    const b = getInvoiceById("inv-002");
    expect(a.id).not.toBe(b.id);
  });

  it("returns the same object reference on repeated calls (stable)", () => {
    expect(getInvoiceById("inv-001")).toBe(getInvoiceById("inv-001"));
  });

  it("returns undefined for an id that does not exist", () => {
    expect(getInvoiceById("inv-9999")).toBeUndefined();
  });
});

describe("LIB-6: getInvoiceById — invalid / boundary inputs", () => {
  it("returns undefined for null", () => {
    expect(getInvoiceById(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(getInvoiceById(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getInvoiceById("")).toBeUndefined();
  });

  it("returns undefined for a numeric id", () => {
    expect(getInvoiceById(1)).toBeUndefined();
  });

  it("returns undefined for an array input", () => {
    expect(getInvoiceById(["inv-001"])).toBeUndefined();
  });

  it("returns undefined for an object input", () => {
    expect(getInvoiceById({ id: "inv-001" })).toBeUndefined();
  });

  it("does not throw for any of the invalid input types", () => {
    [null, undefined, "", 0, [], {}, true, NaN].forEach((bad) => {
      expect(() => getInvoiceById(bad)).not.toThrow();
    });
  });
});

// ─── LIB-7: loadMockInvoices ─────────────────────────────────────────────────

describe("LIB-7: loadMockInvoices — always resolves with an array", () => {
  it("resolves with a non-empty array", async () => {
    const result = await loadMockInvoices();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("resolves with the same data as MOCK_INVOICES", async () => {
    const result = await loadMockInvoices();
    expect(result).toEqual(MOCK_INVOICES);
  });

  it("returns a copy — mutating the resolved array does not affect MOCK_INVOICES", async () => {
    const result = await loadMockInvoices();
    const originalLength = MOCK_INVOICES.length;
    result.push({ id: "injected" });
    expect(MOCK_INVOICES.length).toBe(originalLength);
  });

  it("returns a new array reference on each call (independent copies)", async () => {
    const a = await loadMockInvoices();
    const b = await loadMockInvoices();
    expect(a).not.toBe(b);
  });

  it("never rejects — resolves even if called many times concurrently", async () => {
    const calls = Array.from({ length: 10 }, () => loadMockInvoices());
    const results = await Promise.all(calls);
    results.forEach((r) => {
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBe(MOCK_INVOICES.length);
    });
  });
});

describe("LIB-7: loadMockInvoices — test hook validation", () => {
  afterEach(() => {
    // Clean up window override after each test.
    if (typeof window !== "undefined") {
      delete window.__TEST_MOCK_INVOICES__;
    }
  });

  it("accepts a valid array override from window.__TEST_MOCK_INVOICES__", async () => {
    const override = [{ id: "test-inv", issuer: "Test Co" }];
    window.__TEST_MOCK_INVOICES__ = override;
    const result = await loadMockInvoices();
    expect(result).toEqual(override);
  });

  it("returns a copy of the override (not the same reference)", async () => {
    const override = [{ id: "test-inv" }];
    window.__TEST_MOCK_INVOICES__ = override;
    const result = await loadMockInvoices();
    expect(result).not.toBe(override);
  });

  it("ignores a non-array override and falls back to MOCK_INVOICES", async () => {
    window.__TEST_MOCK_INVOICES__ = "not-an-array";
    const result = await loadMockInvoices();
    expect(result).toEqual(MOCK_INVOICES);
  });

  it("ignores a null override and falls back to MOCK_INVOICES", async () => {
    window.__TEST_MOCK_INVOICES__ = null;
    const result = await loadMockInvoices();
    expect(result).toEqual(MOCK_INVOICES);
  });

  it("ignores an object override and falls back to MOCK_INVOICES", async () => {
    window.__TEST_MOCK_INVOICES__ = { 0: { id: "obj-inv" } };
    const result = await loadMockInvoices();
    expect(result).toEqual(MOCK_INVOICES);
  });
});
