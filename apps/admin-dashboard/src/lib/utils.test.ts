import { describe, expect, it } from "vitest";

import { cn, formatMinutes, getStatusColor } from "./utils";

describe("dashboard utils", () => {
  it("formats minutes as hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(467.8)).toBe("7h 48m");
  });

  it("maps attendance statuses to colours with a neutral fallback", () => {
    expect(getStatusColor("PRESENT")).toContain("green");
    expect(getStatusColor("ABSENT")).toContain("red");
    expect(getStatusColor("SOMETHING_NEW")).toBe("text-gray-600 bg-gray-50");
  });

  it("merges conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
