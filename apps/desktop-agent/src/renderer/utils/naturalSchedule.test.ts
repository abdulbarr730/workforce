import { describe, expect, it } from "vitest";

import { parseNaturalSchedule } from "./naturalSchedule";

// Local-time base: Wednesday 30 Sep 2026, 10:00.
const base = new Date(2026, 8, 30, 10, 0, 0);

describe("parseNaturalSchedule", () => {
  it("returns null for empty input", () => {
    expect(parseNaturalSchedule("   ", base)).toBeNull();
  });

  it("understands 'tomorrow at 3pm'", () => {
    const result = parseNaturalSchedule("Call vendor tomorrow at 3pm", base);
    expect(result?.scheduledFor).toBe("2026-10-01");
    expect(result?.reminderTime).toBe("15:00");
  });

  it("understands relative times", () => {
    const result = parseNaturalSchedule("Send report in 2 hours", base);
    expect(result?.reminderTime).toBe("12:00");
  });

  it("moves a weekday to its next occurrence", () => {
    const result = parseNaturalSchedule("Review deck on friday", base);
    expect(result?.scheduledFor).toBe("2026-10-02");
  });
});
