/**
 * Removes log entries made by Super Admin (developer) accounts.
 *
 *   node dist/scripts/remove-super-admin-logs.js           (dry run: only counts)
 *   node dist/scripts/remove-super-admin-logs.js --apply   (removes them)
 *
 * Removed: admin notifications, leave / correction-request history steps,
 * attendance correction history, and Super Admin names on leave settings and
 * blocked days. NOT touched: shift history (it decides which shift rules
 * applied on past days, so it stays but is already hidden from screens), and
 * the leaves, attendance and requests themselves.
 */
import mongoose from "mongoose";

import { env } from "../config/env";
import { UserRole } from "../_shared/constants";
import { User } from "../modules/users/model/user.model";
import { AdminNotification } from "../modules/notifications/model/admin-notification.model";
import { LeaveRequest } from "../modules/attendance/model/leave-request.model";
import { AttendanceChangeRequest } from "../modules/attendance/model/attendance-change-request.model";
import { AttendanceRecord } from "../modules/attendance/model/attendance-record.model";
import { LeaveBlock, LeavePolicy } from "../modules/attendance/model/leave-policy.model";

const apply = process.argv.includes("--apply");

const run = async () => {
  await mongoose.connect(env.MONGO_URI);
  const admins = await User.find({ role: UserRole.SUPER_ADMIN })
    .select("employeeId name")
    .lean();
  const ids = admins.map((a: any) => String(a.employeeId)).filter(Boolean);
  const names = admins.map((a: any) => String(a.name)).filter(Boolean);
  console.log(`Super Admin accounts: ${admins.map((a: any) => `${a.name} (${a.employeeId})`).join(", ") || "none"}`);

  const notificationFilter = {
    $or: [{ "changedBy.role": "SUPER_ADMIN" }, { "changedBy.employeeId": { $in: ids } }],
  };
  const historyStep = {
    $or: [{ byRole: "SUPER_ADMIN" }, { byEmployeeId: { $in: ids } }],
  };
  const correctionStep = { correctedBy: { $in: [...ids, "SUPER_ADMIN"] } };

  const counts = {
    notifications: await AdminNotification.countDocuments(notificationFilter),
    leavesWithSteps: await LeaveRequest.countDocuments({ history: { $elemMatch: historyStep } }),
    requestsWithSteps: await AttendanceChangeRequest.countDocuments({
      history: { $elemMatch: historyStep },
    }),
    attendanceWithCorrections: await AttendanceRecord.countDocuments({
      correctionHistory: { $elemMatch: correctionStep },
    }),
  };
  console.log(counts);

  if (!apply) {
    console.log("Dry run only. Run again with --apply to remove these.");
    await mongoose.disconnect();
    return;
  }

  await AdminNotification.deleteMany(notificationFilter);
  await LeaveRequest.updateMany({}, { $pull: { history: historyStep } } as any);
  await LeaveRequest.updateMany(
    { $or: [{ approvedBy: { $in: ids } }, { decidedByName: { $in: names } }] },
    { $set: { decidedByName: null } },
  );
  await AttendanceChangeRequest.updateMany({}, { $pull: { history: historyStep } } as any);
  await AttendanceChangeRequest.updateMany(
    { $or: [{ decidedBy: { $in: ids } }, { decidedByName: { $in: names } }] },
    { $set: { decidedByName: null } },
  );
  await AttendanceRecord.updateMany({}, { $pull: { correctionHistory: correctionStep } } as any);
  await LeaveBlock.updateMany({ createdByName: { $in: names } }, { $set: { createdByName: null } });
  await LeaveBlock.updateMany({ updatedByName: { $in: names } }, { $set: { updatedByName: null } });
  await LeavePolicy.updateMany({ updatedByName: { $in: names } }, { $set: { updatedByName: null } });
  console.log("Removed.");
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
