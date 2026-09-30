import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EmailLog } from "../model/email-log.model";
import { isEmailConfigured } from "../../../shared/services/email.service";
import { getSuperAdmins, hideName } from "../../../shared/utils/super-admin";

/** Admin: emails sent (latest first) with counts by status and type. */
export const getEmailLogsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const filter: Record<string, any> = {};
    // Emails to the Super Admin's own account are not shown to others.
    const admins = await getSuperAdmins();
    const ownerView = req.user?.role === "SUPER_ADMIN";
    if (!ownerView && admins.ids.size) filter.employeeId = { $nin: [...admins.ids] };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.employeeId) {
      const id = String(req.query.employeeId);
      filter.employeeId = !ownerView && admins.ids.has(id) ? "__hidden__" : id;
    }
    if (req.query.search) {
      const q = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ to: { $regex: q, $options: "i" } }, { toName: { $regex: q, $options: "i" } }, { subject: { $regex: q, $options: "i" } }];
    }
    const [logs, byStatus, byCategory] = await Promise.all([
      EmailLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      EmailLog.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      EmailLog.aggregate([{ $match: filter }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
    ]);
    const recipients = await EmailLog.distinct("to", { ...filter, status: "SENT" });
    for (const log of logs as any[]) log.sentByName = hideName(admins, log.sentByName);
    res.json(
      successResponse(
        {
          configured: isEmailConfigured(),
          totals: Object.fromEntries(byStatus.map((s: any) => [s._id, s.count])),
          byCategory: Object.fromEntries(byCategory.map((s: any) => [s._id, s.count])),
          peopleEmailed: recipients.length,
          logs,
        },
        "Email log",
      ),
    );
  },
);
