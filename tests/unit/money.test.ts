import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/dates";

describe("Money Helper", () => {
  it("formats PKR currency by default with Rs prefix", () => {
    expect(formatMoney(1500)).toBe("Rs 1,500.00");
    expect(formatMoney("250.5")).toBe("Rs 250.50");
    expect(formatMoney(0)).toBe("Rs 0.00");
  });

  it("handles null or invalid amounts gracefully", () => {
    expect(formatMoney(null)).toBe("Rs 0.00");
    expect(formatMoney(undefined)).toBe("Rs 0.00");
    expect(formatMoney("invalid")).toBe("Rs 0.00");
  });
});

describe("Dates Helper", () => {
  it("formats date strings correctly", () => {
    const isoString = "2026-09-29T10:30:00Z";
    expect(formatDate(isoString)).toBe("29 Sep 2026");
  });

  it("handles null dates safely", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatTime(null)).toBe("-");
  });
});
