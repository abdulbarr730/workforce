import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { ShiftPolicy } from "../model/shift-policy.model";
import { bySuperAdmin, getSuperAdmins } from "../../../shared/utils/super-admin";

export const getShiftPolicyHistoryController = asyncHandler(
  async (req: Request, res: Response) => {
    const { policyId, q } = req.query as { policyId?: string; q?: string };
    const filter: Record<string, any> = {};
    if (policyId) filter._id = policyId;

    const policies = await ShiftPolicy.find(filter)
      .select("name policyHistory")
      .lean();

    // Changes made by a Super Admin (developer) are not shown.
    const admins = await getSuperAdmins();
    const search = String(q || "").trim().toLowerCase();
    const history = policies.flatMap((policy: any) =>
      (policy.policyHistory || []).map((entry: any) => ({
        id: `${policy._id}:${entry.changedAt}`,
        policyId: String(policy._id),
        policyName: policy.name,
        changedAt: entry.changedAt,
        effectiveFrom: entry.effectiveFrom,
        changedBy: entry.changedBy,
        changedByName: entry.changedByName,
        changes: entry.changes || [],
        before: entry.before || {},
        after: entry.after || {},
      })),
    );

    const visible = history.filter(
      (entry) => !bySuperAdmin(admins, { employeeId: entry.changedBy }),
    );
    const filtered = search
      ? visible.filter((entry) =>
          [
            entry.policyName,
            entry.changedBy,
            entry.changedByName,
            entry.effectiveFrom,
            ...(entry.changes || []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : visible;

    filtered.sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    );

    res.json(successResponse(filtered, "Shift policy history fetched"));
  },
);
