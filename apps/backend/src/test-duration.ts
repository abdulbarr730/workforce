import { aggregateWorkHours } from "./modules/attendance/services/aggregate-work-hours.service";
import { EventType, EventSource } from "./_shared/types";
import type { IActivityEvent } from "./modules/tracking/model/activity-event.model";
import mongoose from "mongoose";

// Helper to generate fake timestamps easily
const minutesFromStart = (mins: number) => {
  const date = new Date("2026-05-23T10:00:00.000Z"); // Start at 10:00 AM
  date.setMinutes(date.getMinutes() + mins);
  return date;
};

// Helper to build a base event
const buildEvent = (type: string, timeMins: number, metadata = {}): IActivityEvent => ({
  eventId: new mongoose.Types.ObjectId().toString(),
  employeeId: "EMP_001",
  companyId: "COMP_001",
  deviceId: "MAC_001",
  sessionId: "SESSION_001",
  type: type as any,
  source: "DESKTOP_AGENT" as any,
  timestamp: minutesFromStart(timeMins),
  metadata,
  invalidated: false,
  productivityCategory: "NEUTRAL",
  productivityScore: 0.5,
  matchedRuleId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockEvents: IActivityEvent[] = [
  // 1. Three Active Window Pulses (1.5 minutes of productive time total)
  buildEvent("ACTIVE_WINDOW", 1, { durationSeconds: 30 }),
  buildEvent("ACTIVE_WINDOW", 2, { durationSeconds: 30 }),
  buildEvent("ACTIVE_WINDOW", 3, { durationSeconds: 30 }),

  // 2. A perfectly closed break: 15 minutes
  buildEvent("BREAK_START", 10),
  buildEvent("BREAK_END", 25), // 25 - 10 = 15 mins

  // 3. A perfectly closed idle period: 5 minutes
  buildEvent("IDLE_START", 30),
  buildEvent("IDLE_END", 35), // 35 - 30 = 5 mins

  // 4. Away working: 10 minutes
  buildEvent("AWAY_WORK_START", 40),
  buildEvent("AWAY_WORK_END", 50), // 50 - 40 = 10 mins
];

console.log("Running Scenario: Standard Day");
const result = aggregateWorkHours({ events: mockEvents });

console.log("--- RESULTS ---");
console.log(`Productive Minutes:  ${result.productiveMinutes} (Expected: 1.5)`);
console.log(`Break Minutes:       ${result.breakMinutes} (Expected: 15)`);
console.log(`Idle Minutes:        ${result.idleMinutes} (Expected: 5)`);
console.log(`Away Working:        ${result.awayWorkingMinutes} (Expected: 10)`);
console.log(`Total Worked Time:   ${result.totalWorkedMinutes} (Expected: 11.5)`);

// Simple validation
if (
  result.productiveMinutes === 1.5 &&
  result.breakMinutes === 15 &&
  result.idleMinutes === 5 &&
  result.awayWorkingMinutes === 10 &&
  result.totalWorkedMinutes === 11.5
) {
  console.log("\n✅ SUCCESS: Math is flawless.");
} else {
  console.error("\n❌ FAILED: Math is broken.");
}