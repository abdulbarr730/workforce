import type { IActivityEvent } from "../../tracking/model/activity-event.model";

type AggregateWorkHoursInput = {
  events: IActivityEvent[];
};

type AggregateWorkHoursResult = {
  totalWorkedMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  awayWorkingMinutes: number;
};

export function aggregateWorkHours(
  input: AggregateWorkHoursInput
): AggregateWorkHoursResult {
  const { events } = input;

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
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let currentStateType: "IDLE" | "BREAK" | "AWAY_WORK" | null = null;
  let stateStartTime: number | null = null;

  for (const event of sortedEvents) {
    const eventTime = new Date(event.timestamp).getTime();

    // 2. ACTIVE_WINDOW handling (Telemetry Pulses)
    if (event.type === "ACTIVE_WINDOW") {
      const durationSeconds = (event.metadata as any)?.durationSeconds || 30;
      productiveMinutes += durationSeconds / 60;
      continue;
    }

    // 3. Duration Block Handling (START events)
    if (event.type.endsWith("_START")) {
      stateStartTime = eventTime;

      if (event.type === "IDLE_START") currentStateType = "IDLE";
      if (event.type === "BREAK_START") currentStateType = "BREAK";
      if (event.type === "AWAY_WORK_START") currentStateType = "AWAY_WORK";
      continue;
    } 
    
    // 4. Duration Block Handling (END events)
    if (event.type.endsWith("_END") && stateStartTime !== null) {
      const durationMinutes = (eventTime - stateStartTime) / (1000 * 60);

      if (event.type === "IDLE_END" && currentStateType === "IDLE") {
        idleMinutes += durationMinutes;
      } else if (event.type === "BREAK_END" && currentStateType === "BREAK") {
        breakMinutes += durationMinutes;
      } else if (event.type === "AWAY_WORK_END" && currentStateType === "AWAY_WORK") {
        awayWorkingMinutes += durationMinutes;
      }

      currentStateType = null;
      stateStartTime = null;
    }
  }

  // 5. Final Calculations
  const totalWorkedMinutes = productiveMinutes + awayWorkingMinutes;

  return {
    totalWorkedMinutes: Number(totalWorkedMinutes.toFixed(2)),
    productiveMinutes: Number(productiveMinutes.toFixed(2)),
    idleMinutes: Number(idleMinutes.toFixed(2)),
    breakMinutes: Number(breakMinutes.toFixed(2)),
    awayWorkingMinutes: Number(awayWorkingMinutes.toFixed(2)),
  };
}