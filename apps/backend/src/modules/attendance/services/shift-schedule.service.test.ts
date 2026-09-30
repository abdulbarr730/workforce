import { describe, expect, it } from "vitest";

import {
  addMinutesToClock,
  getBusinessDate,
  getBusinessDayBounds,
  resolveEffectiveShiftSchedule,
  timeStringToMinutes,
} from "./shift-schedule.service";

const WEEKDAY = {
  shiftType: "REGULAR",
  shiftStartTime: "10:00",
  shiftEndTime: "18:30",
  loginCutoffTime: "09:55",
};

describe("business dates are IST (Asia/Kolkata)", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 18:29 UTC = 23:59 IST, 18:31 UTC = 00:01 IST next day
    expect(getBusinessDate(new Date("2026-09-30T18:29:00Z"))).toBe("2026-09-30");
    expect(getBusinessDate(new Date("2026-09-30T18:31:00Z"))).toBe("2026-10-01");
  });

  it("bounds a business day from IST midnight to IST midnight", () => {
    const { start, end } = getBusinessDayBounds("2026-09-30");
    expect(start.toISOString()).toBe("2026-09-29T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T18:29:59.999Z");
  });
});

describe("clock helpers", () => {
  it("converts and adds clock times", () => {
    expect(timeStringToMinutes("09:55")).toBe(595);
    expect(timeStringToMinutes("bad")).toBe(0);
    expect(addMinutesToClock("18:30", 30)).toBe("19:00");
    expect(addMinutesToClock("23:50", 20)).toBe("00:10");
  });
});

describe("resolveEffectiveShiftSchedule", () => {
  it("keeps regular timings for a login before the cutoff", () => {
    const result = resolveEffectiveShiftSchedule(WEEKDAY, new Date("2026-09-30T09:50:00+05:30"));
    expect(result).toMatchObject({ isLateEntry: false, shiftStartTime: "10:00", shiftEndTime: "18:30" });
  });

  it("shifts the day by 30 minutes for a login after the cutoff", () => {
    const result = resolveEffectiveShiftSchedule(WEEKDAY, new Date("2026-09-30T09:56:00+05:30"));
    expect(result).toMatchObject({ isLateEntry: true, shiftStartTime: "10:30", shiftEndTime: "19:00" });
  });

  it("never advances a LATE policy again", () => {
    const late = { ...WEEKDAY, shiftType: "LATE" };
    const result = resolveEffectiveShiftSchedule(late, new Date("2026-09-30T11:00:00+05:30"));
    expect(result.isLateEntry).toBe(false);
    expect(result.shiftStartTime).toBe("10:00");
  });
});
