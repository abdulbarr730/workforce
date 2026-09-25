import type { IActivityEvent } from "../../tracking/model/activity-event.model";

type AggregateWorkHoursInput = {
  events: IActivityEvent[];
  /**
   * Start of the counted working day (the employee's login). Idle, break and
   * window time before it is not part of the day. Without this clip a Mac
   * that slept overnight reported a 12h "idle" span that became 12h of break.
   */
  windowStart?: Date | null;
};

type AggregateWorkHoursResult = {
  totalWorkedMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  awayWorkingMinutes: number;
};

export function aggregateWorkHours(
  input: AggregateWorkHoursInput,
): AggregateWorkHoursResult {
  const { events } = input;
  const windowStartMs = input.windowStart
    ? new Date(input.windowStart).getTime()
    : Number.NEGATIVE_INFINITY;

  let productiveMinutes = 0;
  let idleMinutes = 0;
  let breakMinutes = 0;
  let awayWorkingMinutes = 0;

  if (!events || events.length === 0) {
    return {
      totalWorkedMinutes: 0,
      productiveMinutes,
      idleMinutes,
      breakMinutes,
      awayWorkingMinutes,
    };
  }

  // 1. Sort events chronologically to reconstruct the timeline accurately.
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let currentStateType: "IDLE" | "BREAK" | "AWAY_WORK" | null = null;
  let stateStartTime: number | null = null;
  let lastIdleStartSecs = 0;
  let idleBeganAt: number | null = null;

  for (const event of sortedEvents) {
    const eventTime = new Date(event.timestamp).getTime();

    // 2. ACTIVE_WINDOW handling (Telemetry Pulses)
    if (event.type === "ACTIVE_WINDOW") {
      // The event is sent when the window interval ends; only the part after
      // login counts.
      const durationSeconds = Math.max(
        0,
        Math.min(
          (event.metadata as any)?.durationSeconds || 30,
          305,
          (eventTime - windowStartMs) / 1000,
        ),
      );
      productiveMinutes += durationSeconds / 60;
      continue;
    }

    // 3. Duration Block Handling (START events)
    if (event.type.endsWith("_START")) {
      stateStartTime = Math.max(eventTime, windowStartMs);

      if (event.type === "IDLE_START") {
        currentStateType = "IDLE";
        lastIdleStartSecs = (event.metadata as any)?.idleSeconds ?? 300;
        // IDLE_START is emitted after the timeout (or on wake after sleep), so
        // idle actually began idleSeconds earlier — but never before login.
        idleBeganAt = Math.max(
          eventTime - Number(lastIdleStartSecs) * 1000,
          windowStartMs,
        );
      }
      if (event.type === "BREAK_START") currentStateType = "BREAK";
      if (event.type === "AWAY_WORK_START") currentStateType = "AWAY_WORK";
      continue;
    }

    // 4. Duration Block Handling (END events)
    if (event.type.endsWith("_END") && stateStartTime !== null) {
      let durationMinutes = Math.max(0, (eventTime - stateStartTime) / (1000 * 60));

      if (event.type === "IDLE_END" && currentStateType === "IDLE") {
        // The timestamp of IDLE_START is artificially delayed by the desktop agent's threshold.
        // The true idle duration is the initial timeout (from IDLE_START) + the additional duration (from IDLE_END)
        const additionalSecs =
          (event.metadata as any)?.idleDurationSecs ??
          (event.metadata as any)?.idleSeconds ??
          0;
        durationMinutes =
          idleBeganAt !== null
            ? Math.max(0, (eventTime - idleBeganAt) / 60_000)
            : (lastIdleStartSecs + additionalSecs) / 60;
        idleMinutes += durationMinutes;
        lastIdleStartSecs = 0;
        idleBeganAt = null;
      } else if (event.type === "BREAK_END" && currentStateType === "BREAK") {
        breakMinutes += durationMinutes;
      } else if (
        event.type === "AWAY_WORK_END" &&
        currentStateType === "AWAY_WORK"
      ) {
        awayWorkingMinutes += durationMinutes;
      }

      currentStateType = null;
      stateStartTime = null;
      continue;
    }

    // 5. Handle IDLE_RESPONSE (reclassify the last idle period)
    if (event.type === "IDLE_RESPONSE") {
      const isWorking = (event.metadata as any)?.isWorking;
      const reportedMins = (event.metadata as any)?.idleMinutes || 0;

      const minsToReclassify = Math.min(idleMinutes, reportedMins);

      if (minsToReclassify > 0) {
        idleMinutes -= minsToReclassify;
        if (isWorking) {
          awayWorkingMinutes += minsToReclassify;
        } else {
          breakMinutes += minsToReclassify;
        }
      }
    }
  }

  // 6. Final Calculations
  const totalWorkedMinutes = productiveMinutes + awayWorkingMinutes;

  return {
    totalWorkedMinutes: Number(totalWorkedMinutes.toFixed(2)),
    productiveMinutes: Number(productiveMinutes.toFixed(2)),
    idleMinutes: Number(idleMinutes.toFixed(2)),
    breakMinutes: Number(breakMinutes.toFixed(2)),
    awayWorkingMinutes: Number(awayWorkingMinutes.toFixed(2)),
  };
}
