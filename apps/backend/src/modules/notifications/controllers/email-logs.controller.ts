import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { EmailLog } from "../model/email-log.model";
import { isEmailConfigured } from "../../../shared/services/email.service";

/** Admin: emails sent (latest first) with counts by status and type. */
export const getEmailLogsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    const [logs, byStatus, byCategory] = await Promise.all([
      EmailLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      EmailLog.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      EmailLog.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    ]);
    const recipients = await EmailLog.distinct("to", { status: "SENT" });
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
