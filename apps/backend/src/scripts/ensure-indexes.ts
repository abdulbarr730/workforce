/**
 * Builds every index declared on the Mongoose schemas.
 *
 * Only creates missing indexes (Model.createIndexes). It never drops indexes
 * and never touches documents, so it is safe to run on production data.
 * Run once at a quiet time after deploying new schema indexes:
 *   pnpm --filter @workforce/backend ensure-indexes
 */
import mongoose from "mongoose";

import { env } from "../config/env";

import "../modules/analytics/model/employee-daily-analytics.model";
import "../modules/assigned-tasks/model/assigned-task.model";
import "../modules/attendance/model/attendance-record.model";
import "../modules/attendance/model/attendance-shortfall-adjustment.model";
import "../modules/attendance/model/holiday.model";
import "../modules/attendance/model/leave-request.model";
import "../modules/attendance/model/shift-policy.model";
import "../modules/daily-flow/model/break-schedule.model";
import "../modules/daily-flow/model/daily-todo.model";
import "../modules/daily-flow/model/eod-report.model";
import "../modules/departments/model/department.model";
import "../modules/devices/model/device-error.model";
import "../modules/devices/model/device.model";
import "../modules/grievances/model/grievance.model";
import "../modules/notifications/model/admin-notification.model";
import "../modules/productivity-rules/model/productivity-rule.model";
import "../modules/screenshots/screenshot.model";
import "../modules/tracking/model/activity-event.model";
import "../modules/tracking/models/failed-event.model";
import "../modules/users/model/user.model";
import "../modules/welcome-calls/model/welcome-call-campaign.model";
import "../modules/welcome-calls/model/welcome-call-lead.model";
import "../modules/work-sessions/model/work-session.model";
import "../modules/workforce-brain/model/app-knowledge.model";
import "../modules/workforce-brain/model/workforce-brain-memory.model";

const ensureIndexes = async () => {
  await mongoose.connect(env.MONGO_URI);

  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const startedAt = Date.now();
    await model.createIndexes();
    console.log(`[ensure-indexes] ${name}: ok (${Date.now() - startedAt} ms)`);
  }

  await mongoose.disconnect();
};

ensureIndexes().catch(async (error) => {
  console.error("[ensure-indexes] failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
