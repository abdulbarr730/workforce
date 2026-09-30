import { describe, expect, it } from "vitest";

import { hasSubmittedEod } from "../../shared/daily-flow";
import {
  formatToHHMM,
  normalizeTaskKey,
  parseDurationFromTaskText,
  stripDurationFromTaskText,
} from "./eodDraft";

describe("EOD draft helpers", () => {
  it("normalises task keys for de-duplication", () => {
    expect(normalizeTaskKey("  Fix   Login Bug ")).toBe("fix login bug");
  });

  it("formats decimal hours as HH:MM and leaves other formats alone", () => {
    expect(formatToHHMM("1.5")).toBe("01:30");
    expect(formatToHHMM("02:15")).toBe("02:15");
    expect(formatToHHMM("2h")).toBe("2h");
  });

  it("reads a duration out of free text, ignoring clock times", () => {
    expect(parseDurationFromTaskText("Client call 1h 30m")).toBe("01:30");
    expect(parseDurationFromTaskText("Standup 15 mins at 10:30 am")).toBe("00:15");
    expect(parseDurationFromTaskText("No duration here")).toBe("");
  });

  it("strips the duration from the task text", () => {
    expect(stripDurationFromTaskText("Client call 1h 30m")).toBe("Client call");
  });
});

describe("hasSubmittedEod", () => {
  it("is true only for a payload with a submission timestamp", () => {
    expect(hasSubmittedEod({ eod: { submittedAt: "2026-09-30T13:00:00Z" } })).toBe(true);
    expect(hasSubmittedEod({ checkins: [], plan: [] })).toBe(false);
    expect(hasSubmittedEod(null)).toBe(false);
  });
});
