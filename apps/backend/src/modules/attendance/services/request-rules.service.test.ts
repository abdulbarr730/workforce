import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../shared/utils/app-error";
import { assertRequestEditable, datesBetween, toDateKey } from "./request-rules.service";

describe("toDateKey", () => {
  it("normalises plain dates and legacy ISO timestamps", () => {
    expect(toDateKey("2026-09-04")).toBe("2026-09-04");
    expect(toDateKey("2026-09-04T00:00:00.000Z")).toBe("2026-09-04");
    expect(toDateKey(null)).toBe("");
    expect(toDateKey("04/09/2026")).toBe("");
  });
});

describe("datesBetween", () => {
  it("includes both ends", () => {
    expect(datesBetween("2026-09-29", "2026-10-01")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("returns nothing for a reversed range", () => {
    expect(datesBetween("2026-10-01", "2026-09-29")).toEqual([]);
  });
});

describe("assertRequestEditable", () => {
  afterEach(() => vi.useRealTimers());

  const atIst = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("lets anyone change a request for today or later", () => {
    atIst("2026-09-30T12:00:00+05:30");
    expect(() => assertRequestEditable("2026-09-30", "ADMIN")).not.toThrow();
    expect(() => assertRequestEditable("2026-10-02", "EMPLOYEE")).not.toThrow();
  });

  it("locks past requests to Super Admins", () => {
    atIst("2026-09-30T12:00:00+05:30");
    expect(() => assertRequestEditable("2026-09-29", "ADMIN")).toThrow(AppError);
    expect(() => assertRequestEditable("2026-09-29", "SUPER_ADMIN")).not.toThrow();
  });
});
