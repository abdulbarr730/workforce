import type {
  IActivityEvent
} from "../../activity/model/activity-event.model";

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

export function
aggregateWorkHours(
  input: AggregateWorkHoursInput
): AggregateWorkHoursResult {
  const { events } = input;

  let productiveMinutes = 0;

  let idleMinutes = 0;

  let breakMinutes = 0;

  let awayWorkingMinutes = 0;

  /*
    Current simplified logic.

    Later this should evolve into:
    timeline-based duration aggregation
    using paired start/end events.
  */

  for (const event of events) {
    switch (event.type) {
      case "IDLE_START":
        idleMinutes += 5;
        break;

      case "BREAK_START":
        breakMinutes += 5;
        break;

      case "AWAY_WORK_START":
        awayWorkingMinutes += 5;
        break;

      case "ACTIVE_WINDOW":
        productiveMinutes += 1;
        break;

      default:
        break;
    }
  }

  const totalWorkedMinutes =
    productiveMinutes +
    awayWorkingMinutes;

  return {
    totalWorkedMinutes,

    productiveMinutes,

    idleMinutes,

    breakMinutes,

    awayWorkingMinutes
  };
}