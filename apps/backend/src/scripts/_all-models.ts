/**
 * Registers every Mongoose model. Import this from scripts that need the full
 * schema set (index builds, the dev seed, the seed smoke test).
 * When you add a model, add it here too.
 */
import "../modules/access/model/access-role.model";
import "../modules/analytics/model/employee-daily-analytics.model";
import "../modules/assigned-tasks/model/assigned-task.model";
import "../modules/attendance/model/attendance-change-request.model";
import "../modules/attendance/model/attendance-mark.model";
import "../modules/attendance/model/attendance-record.model";
import "../modules/attendance/model/attendance-shortfall-adjustment.model";
import "../modules/attendance/model/holiday.model";
import "../modules/attendance/model/leave-policy.model";
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
import "../modules/notifications/model/email-log.model";
import "../modules/productivity-rules/model/productivity-rule.model";
import "../modules/screenshots/screenshot.model";
import "../modules/system/model/ai-usage-log.model";
import "../modules/tracking/model/activity-event.model";
import "../modules/tracking/models/failed-event.model";
import "../modules/users/model/user.model";
import "../modules/welcome-calls/model/welcome-call-campaign.model";
import "../modules/welcome-calls/model/welcome-call-lead.model";
import "../modules/work-sessions/model/work-session.model";
import "../modules/workforce-brain/model/app-knowledge.model";
import "../modules/workforce-brain/model/workforce-brain-memory.model";
