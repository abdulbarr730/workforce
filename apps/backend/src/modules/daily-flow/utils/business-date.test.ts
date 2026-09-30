import { describe, expect, it } from "vitest";

import { getBusinessDate, readRequestedDate } from "./business-date";

describe("daily-flow business date", () => {
  it("uses the IST calendar day", () => {
    expect(getBusinessDate(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  });

  it("accepts only YYYY-MM-DD query dates", () => {
    expect(readRequestedDate("2026-09-30")).toBe("2026-09-30");
    expect(() => readRequestedDate("30-09-2026")).toThrow(/Invalid date/);
    expect(() => readRequestedDate(42)).toThrow(/Invalid date/);
  });
});
