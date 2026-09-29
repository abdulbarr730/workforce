import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { UserRole } from "../../../_shared/constants";
import { LeaveBlock } from "../model/leave-policy.model";
import {
  getEffectiveLimits,
  getLeaveBalance,
  getLeavePolicy,
  saveLeaveAllowance,
  saveLeavePolicy,
} from "../services/leave-policy.service";
import { toDateKey, todayKey } from "../services/request-rules.service";

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "HR"]);
const isAdmin = (req: AuthRequest) => ADMIN_ROLES.has(String(req.user?.role || ""));
const actorOf = (req: AuthRequest) => ({
  employeeId: req.user?.employeeId || undefined,
  name: req.user?.name || undefined,
});
const monthParam = (value: unknown) => {
  const month = String(value || "");
  return /^\d{4}-\d{2}$/.test(month) ? month : todayKey().slice(0, 7);
};
const publicBalance = (balance: Awaited<ReturnType<typeof getLeaveBalance>>) => {
  const { byMonth: _byMonth, ...rest } = balance;
  return rest;
};

// ── Leave types ──────────────────────────────────────────────────────────
export const getLeavePolicyController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    res.json(successResponse(await getLeavePolicy(), "Leave types"));
  },
);

export const updateLeavePolicyController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const types = await saveLeavePolicy(req.body?.types, actorOf(req));
    res.json(successResponse(types, "Leave types saved"));
  },
);

// ── Per-employee limits ──────────────────────────────────────────────────
export const getLeaveAllowanceController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.params.employeeId || "");
    res.json(successResponse(await getEffectiveLimits(employeeId), "Leave limits"));
  },
);

export const updateLeaveAllowanceController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = String(req.params.employeeId || "");
    const exists = await User.exists({ employeeId });
    if (!exists) throw new AppError("Employee not found", 404);
    const limits = await saveLeaveAllowance(employeeId, req.body?.limits, actorOf(req));
    res.json(successResponse(limits, "Leave limits saved"));
  },
);

// ── Balances ─────────────────────────────────────────────────────────────
/** Own balance (employees) or any employee's (admins): ?employeeId=&month= */
export const getLeaveBalanceController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const requested = String(req.query.employeeId || "");
    const employeeId =
      requested && isAdmin(req) ? requested : String(req.user?.employeeId || "");
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const balance = await getLeaveBalance(employeeId, monthParam(req.query.month));
    res.json(successResponse(publicBalance(balance), "Leave balance"));
  },
);

/** Admin: every active employee's balance for a month. */
export const getAllLeaveBalancesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const month = monthParam(req.query.month);
    const users = await User.find({
      isActive: true,
      role: { $ne: UserRole.SUPER_ADMIN },
    })
      .select("employeeId name role")
      .sort({ name: 1 })
      .lean();
    const balances = [];
    for (const user of users as any[]) {
      if (!user.employeeId) continue;
      const balance = await getLeaveBalance(user.employeeId, month);
      balances.push({ ...publicBalance(balance), name: user.name, role: user.role });
    }
    res.json(successResponse(balances, "Leave balances"));
  },
);

// ── Blocked days ─────────────────────────────────────────────────────────
/** Admins see every block; employees only the ones that apply to them. */
export const getLeaveBlocksController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (isAdmin(req)) {
      const blocks = await LeaveBlock.find(
        req.query.includeInactive === "true" ? {} : { isActive: true },
      )
        .sort({ startDate: -1 })
        .limit(500)
        .lean();
      res.json(successResponse(blocks, "Blocked leave days"));
      return;
    }
    const employeeId = String(req.user?.employeeId || "");
    const blocks = await LeaveBlock.find({
      isActive: true,
      endDate: { $gte: todayKey() },
      $or: [{ scope: "ALL" }, { scope: "EMPLOYEES", employeeIds: employeeId }],
    })
      .select("startDate endDate reason")
      .sort({ startDate: 1 })
      .lean();
    res.json(successResponse(blocks, "Blocked leave days"));
  },
);

const readBlockBody = (body: any) => {
  const startDate = toDateKey(body?.startDate);
  const endDate = toDateKey(body?.endDate) || startDate;
  if (!startDate) throw new AppError("Choose the day to block.", 400);
  if (endDate < startDate) throw new AppError("End date cannot be before the start date.", 400);
  const scope: "ALL" | "EMPLOYEES" =
    body?.scope === "EMPLOYEES" ? "EMPLOYEES" : "ALL";
  const employeeIds: string[] = Array.isArray(body?.employeeIds)
    ? Array.from(
        new Set<string>(
          body.employeeIds.map((id: unknown) => String(id)).filter(Boolean),
        ),
      )
    : [];
  if (scope === "EMPLOYEES" && employeeIds.length === 0) {
    throw new AppError("Choose at least one employee, or block it for everyone.", 400);
  }
  return {
    startDate,
    endDate,
    scope,
    employeeIds: scope === "EMPLOYEES" ? employeeIds : [],
    reason: String(body?.reason || "").trim(),
  };
};

export const createLeaveBlockController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const block = await LeaveBlock.create({
      ...readBlockBody(req.body),
      isActive: true,
      createdBy: req.user?.employeeId || null,
      createdByName: req.user?.name || null,
    });
    res.status(201).json(successResponse(block, "Day blocked for leave"));
  },
);

/** Edit a block, or switch it off with { isActive: false } (never deleted). */
export const updateLeaveBlockController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const block = await LeaveBlock.findById(req.params.id);
    if (!block) throw new AppError("Blocked day not found", 404);
    if (req.body?.startDate || req.body?.endDate || req.body?.scope) {
      Object.assign(
        block,
        readBlockBody({
          startDate: req.body.startDate || block.startDate,
          endDate: req.body.endDate || block.endDate,
          scope: req.body.scope || block.scope,
          employeeIds: req.body.employeeIds ?? block.employeeIds,
          reason: req.body.reason ?? block.reason,
        }),
      );
    } else if (req.body?.reason !== undefined) {
      block.reason = String(req.body.reason).trim();
    }
    if (typeof req.body?.isActive === "boolean") block.isActive = req.body.isActive;
    block.updatedBy = req.user?.employeeId || null;
    block.updatedByName = req.user?.name || null;
    await block.save();
    res.json(successResponse(block, "Blocked day updated"));
  },
);
