import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { getBusinessDate } from "../../daily-flow/utils/business-date";
import { User } from "../../users/model/user.model";
import { Department } from "../../departments/model/department.model";
import { UserRole } from "../../../_shared/constants";
import { WelcomeCallCampaign } from "../model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";
import {
  allocateWelcomeCallLeads,
  isCampaignEffective,
} from "../services/welcome-call-allocation.service";
import { ingestWelcomeCallRegistrations } from "../services/welcome-call-ingestion.service";
import {
  buildWelcomeCallReport,
  buildWelcomeCallWorkbook,
} from "../services/welcome-call-report.service";

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const OUTCOMES = new Set([
  "CONNECTED",
  "NOT_CONNECTED",
  "CALLBACK",
  "WRONG_NUMBER",
  "DO_NOT_CALL",
]);
const WEEKDAYS = new Set([
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
]);

const isAdmin = (req: AuthRequest) => ADMIN_ROLES.has(req.user?.role || "");

const canManageCampaign = (req: AuthRequest, campaign: any) =>
  isAdmin(req) ||
  (campaign.responsiblePeople || []).some(
    (person: any) => person.employeeId === req.user?.employeeId,
  );

const assertCampaignId = (value: unknown) => {
  const id = String(value || "");
  if (!mongoose.isValidObjectId(id))
    throw new AppError("Invalid campaign ID", 400);
  return id;
};

const readDate = (value: unknown, field: string, required = false) => {
  const date = String(value || "");
  if (!date && !required) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(`${field} must use YYYY-MM-DD`, 400);
  }
  return date;
};

const patternEndDate = (from: string, duration: string) => {
  if (duration === "UNTIL_CHANGED") return null;
  const date = new Date(`${from}T12:00:00Z`);
  if (duration === "WEEK") date.setUTCDate(date.getUTCDate() + 6);
  if (duration === "MONTH") {
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizedKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const flattenWebhookRecord = (
  input: Record<string, unknown>,
  prefix = "",
  output: Record<string, unknown> = {},
) => {
  Object.entries(input).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      flattenWebhookRecord(value as Record<string, unknown>, path, output);
      return;
    }
    output[normalizedKey(key)] ??= value;
    output[normalizedKey(path)] ??= value;
  });
  return output;
};

const normalizePabblyRegistration = (input: unknown) => {
  const original =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const values = flattenWebhookRecord(original);
  const pick = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = values[normalizedKey(alias)];
      if (value !== undefined && value !== null && String(value).trim()) {
        return value;
      }
    }
    return undefined;
  };
  const firstName = pick("firstName", "first_name");
  const lastName = pick("lastName", "last_name");
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    registrantName:
      pick(
        "registrantName",
        "fullName",
        "customerName",
        "attendeeName",
        "contactName",
        "name",
      ) || combinedName,
    phone: pick(
      "phone",
      "phoneNumber",
      "mobile",
      "mobileNumber",
      "contactNumber",
      "whatsappNumber",
    ),
    email: pick("email", "emailAddress", "customerEmail"),
    externalRegistrationId: pick(
      "externalRegistrationId",
      "registrationId",
      "orderId",
      "paymentId",
      "transactionId",
      "leadId",
      "id",
    ),
    registeredAt: pick(
      "registeredAt",
      "createdAt",
      "registrationDate",
      "paymentDate",
      "timestamp",
    ),
    amount: pick(
      "amount",
      "paymentAmount",
      "amountPaid",
      "orderAmount",
      "price",
    ),
    metadata: { pabblyPayload: original },
  };
};

const readWebhookRows = (body: any) => {
  const candidate =
    body?.registrations ||
    body?.registration ||
    body?.data?.registrations ||
    body?.data?.registration ||
    body?.data ||
    body;
  return (Array.isArray(candidate) ? candidate : [candidate]).map(
    normalizePabblyRegistration,
  );
};

async function enrichPeople(body: any, includeResponsiblePeople: boolean) {
  const memberInputs = Array.isArray(body.memberRules) ? body.memberRules : [];
  const responsibleEmployeeIds: string[] = includeResponsiblePeople
    ? Array.from(
        new Set<string>(
          (Array.isArray(body.responsibleEmployeeIds)
            ? body.responsibleEmployeeIds
            : []
          ).map(String),
        ),
      )
    : [];
  const memberEmployeeIds: string[] = Array.from(
    new Set<string>(
      memberInputs.map((member: any) => String(member.employeeId || "")),
    ),
  ).filter(Boolean);
  const employeeIds: string[] = Array.from(
    new Set<string>([...responsibleEmployeeIds, ...memberEmployeeIds]),
  );
  const users = await User.find({
    employeeId: { $in: employeeIds },
    isActive: true,
  })
    .select("employeeId name departmentId departmentName")
    .lean();
  const usersByEmployeeId = new Map(
    users.map((user: any) => [user.employeeId, user]),
  );

  const missing = employeeIds.filter((id) => !usersByEmployeeId.has(id));
  if (missing.length) {
    throw new AppError(`Active employee not found: ${missing.join(", ")}`, 400);
  }

  return {
    responsiblePeople: responsibleEmployeeIds.map((employeeId) => {
      const user: any = usersByEmployeeId.get(employeeId);
      return { employeeId, employeeName: user.name };
    }),
    memberRules: memberInputs.map((input: any) => {
      const employeeId = String(input.employeeId);
      const user: any = usersByEmployeeId.get(employeeId);
      const eligibleWeekdays = (
        Array.isArray(input.eligibleWeekdays) ? input.eligibleWeekdays : []
      )
        .map((day: unknown) => String(day).toUpperCase())
        .filter((day: string) => WEEKDAYS.has(day));
      const dailyCap = Number(input.dailyCap || 0);
      return {
        employeeId,
        employeeName: user.name,
        departmentId: user.departmentId || null,
        departmentName: user.departmentName || null,
        enabled: input.enabled !== false,
        eligibleWeekdays,
        weight: Math.max(1, Number(input.weight || 1)),
        dailyCap: dailyCap > 0 ? dailyCap : null,
      };
    }),
  };
}

const readCampaignConfiguration = (body: any) => {
  const distributionMode: "EQUAL" | "WEIGHTED" =
    body.distributionMode === "WEIGHTED" ? "WEIGHTED" : "EQUAL";
  const patternDuration: "WEEK" | "MONTH" | "UNTIL_CHANGED" = [
    "WEEK",
    "MONTH",
    "UNTIL_CHANGED",
  ].includes(body.patternDuration)
    ? body.patternDuration
    : "UNTIL_CHANGED";
  const effectiveFrom = readDate(
    body.effectiveFrom || getBusinessDate(),
    "effectiveFrom",
    true,
  )!;
  const requestedEnd = readDate(body.effectiveUntil, "effectiveUntil");
  const computedEnd = patternEndDate(effectiveFrom, patternDuration);
  const reminderTime = String(body.reminder?.time || "16:30");
  const dailyAllocationTime = String(
    body.allocationSchedule?.dailyTime || "11:00",
  );
  const webinarCutoffTime = String(
    body.allocationSchedule?.webinarCutoff?.time || "11:00",
  );
  const postWebinarStartTime = String(
    body.allocationSchedule?.postWebinarImmediate?.startTime || "11:00",
  );
  const timezone = String(
    body.allocationSchedule?.timezone || "Asia/Kolkata",
  ).trim();
  const webinarWeekday = String(
    body.allocationSchedule?.webinarCutoff?.weekday || "SATURDAY",
  ).toUpperCase();
  const defaultWeeklyRunTimes = [
    ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "SUNDAY"].map(
      (weekday) => ({ weekday, time: "11:00" }),
    ),
    { weekday: "FRIDAY", time: "11:00" },
    { weekday: "FRIDAY", time: "17:00" },
    { weekday: "SATURDAY", time: "10:00" },
  ];
  const requestedWeeklyRunTimes = Array.isArray(
    body.allocationSchedule?.weeklyRunTimes,
  )
    ? body.allocationSchedule.weeklyRunTimes
    : defaultWeeklyRunTimes;
  const postWebinarMemberEmployeeIds = Array.from(
    new Set<string>(
      (
        body.allocationSchedule?.postWebinarImmediate?.memberEmployeeIds || []
      ).map(String),
    ),
  ).filter(Boolean);
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(reminderTime)) {
    throw new AppError("Reminder time must use HH:mm", 400);
  }
  if (!validTime(dailyAllocationTime)) {
    throw new AppError("Daily allocation time must use HH:mm", 400);
  }
  if (!validTime(webinarCutoffTime)) {
    throw new AppError("Saturday batch time must use HH:mm", 400);
  }
  if (!validTime(postWebinarStartTime)) {
    throw new AppError("Post-webinar start time must use HH:mm", 400);
  }
  if (!WEEKDAYS.has(webinarWeekday)) {
    throw new AppError("Webinar cutoff weekday is invalid", 400);
  }
  const weeklyRunTimes = requestedWeeklyRunTimes.map((run: any) => ({
    weekday: String(run?.weekday || "").toUpperCase(),
    time: String(run?.time || ""),
  }));
  if (
    weeklyRunTimes.length === 0 ||
    weeklyRunTimes.some(
      (run: { weekday: string; time: string }) =>
        !WEEKDAYS.has(run.weekday) || !validTime(run.time),
    )
  ) {
    throw new AppError(
      "Every automatic allocation run needs a valid weekday and HH:mm time",
      400,
    );
  }
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: timezone }).format();
  } catch {
    throw new AppError("Allocation timezone is invalid", 400);
  }

  return {
    distributionMode,
    patternDuration,
    effectiveFrom,
    effectiveUntil:
      patternDuration === "UNTIL_CHANGED" ? null : requestedEnd || computedEnd,
    excludedDepartmentIds: Array.from(
      new Set(
        (Array.isArray(body.excludedDepartmentIds)
          ? body.excludedDepartmentIds
          : []
        ).map(String),
      ),
    ),
    allocationSchedule: {
      mode:
        body.allocationSchedule?.mode === "IMMEDIATE"
          ? "IMMEDIATE"
          : "SCHEDULED",
      dailyTime: dailyAllocationTime,
      timezone,
      requireAgentPresence:
        body.allocationSchedule?.requireAgentPresence !== false,
      weeklyRunTimes: Array.from(
        new Map(
          weeklyRunTimes.map((run: { weekday: string; time: string }) => [
            `${run.weekday}:${run.time}`,
            run,
          ]),
        ).values(),
      ),
      webinarCutoff: {
        enabled: body.allocationSchedule?.webinarCutoff?.enabled !== false,
        weekday: webinarWeekday,
        time: webinarCutoffTime,
      },
      postWebinarImmediate: {
        enabled:
          body.allocationSchedule?.postWebinarImmediate?.enabled !== false,
        startTime: postWebinarStartTime,
        memberEmployeeIds: postWebinarMemberEmployeeIds,
      },
    },
    redistribution: {
      enabled: body.redistribution?.enabled !== false,
      afterAttempts: Math.max(
        1,
        Number(body.redistribution?.afterAttempts || 1),
      ),
      excludePreviousAssignee:
        body.redistribution?.excludePreviousAssignee !== false,
    },
    reminder: {
      enabled: body.reminder?.enabled !== false,
      time: reminderTime,
      frequency: body.reminder?.frequency === "ONCE" ? "ONCE" : "DAILY",
    },
  };
};

const validatePostWebinarTeam = (configuration: any, people: any) => {
  const fixedTeam: string[] =
    configuration.allocationSchedule.postWebinarImmediate.memberEmployeeIds;
  if (fixedTeam.length === 0) return;
  const excludedDepartments = new Set(
    configuration.excludedDepartmentIds.map(String),
  );
  const eligibleMemberIds = new Set(
    people.memberRules
      .filter(
        (member: any) =>
          member.enabled &&
          (!member.departmentId ||
            !excludedDepartments.has(String(member.departmentId))),
      )
      .map((member: any) => member.employeeId),
  );
  const invalid = fixedTeam.filter(
    (employeeId) => !eligibleMemberIds.has(employeeId),
  );
  if (invalid.length > 0) {
    throw new AppError(
      "The post-webinar team must contain enabled, non-excluded distribution members only",
      400,
    );
  }
};

async function loadManageableCampaign(req: AuthRequest, id: string) {
  const campaign = await WelcomeCallCampaign.findById(assertCampaignId(id));
  if (!campaign) throw new AppError("Welcome-call campaign not found", 404);
  if (!canManageCampaign(req, campaign)) throw new AppError("Forbidden", 403);
  return campaign;
}

export const getWelcomeCallContextController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const campaignFilter = isAdmin(req)
      ? {}
      : {
          $or: [
            { "responsiblePeople.employeeId": employeeId },
            { "memberRules.employeeId": employeeId },
          ],
        };
    const campaigns = await WelcomeCallCampaign.find(campaignFilter)
      .sort({ isActive: -1, updatedAt: -1 })
      .lean();
    const manageableCampaignIds = campaigns
      .filter((campaign) => canManageCampaign(req, campaign))
      .map((campaign) => String(campaign._id));
    const canManageAny = isAdmin(req) || manageableCampaignIds.length > 0;
    const [roster, departments] = canManageAny
      ? await Promise.all([
          User.find({
            isActive: true,
            role: { $nin: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
          })
            .select("employeeId name role departmentId departmentName")
            .sort({ name: 1 })
            .lean(),
          Department.find({ isActive: true })
            .select("name code")
            .sort({ name: 1 })
            .lean(),
        ])
      : [[], []];
    res.json(
      successResponse(
        {
          campaigns,
          manageableCampaignIds,
          canCreateCampaign: isAdmin(req),
          canManageAny,
          roster,
          departments,
        },
        "Welcome-call context fetched",
      ),
    );
  },
);

export const createWelcomeCallCampaignController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new AppError("Campaign name is required", 400);
    const amount = Number(req.body?.registrationAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new AppError("A valid registration amount is required", 400);
    }
    const key = slugify(String(req.body?.key || name));
    if (!key) throw new AppError("A valid campaign key is required", 400);
    if (await WelcomeCallCampaign.exists({ key })) {
      throw new AppError("A campaign with this key already exists", 409);
    }

    const people = await enrichPeople(req.body, true);
    const configuration = readCampaignConfiguration(req.body);
    validatePostWebinarTeam(configuration, people);
    const campaign = await WelcomeCallCampaign.create({
      key,
      name,
      webinarTitle: String(req.body?.webinarTitle || name).trim(),
      webinarRecurrence: "WEEKLY",
      registrationAmount: amount,
      currency: String(req.body?.currency || "INR").toUpperCase(),
      isActive: req.body?.isActive !== false,
      ...configuration,
      ...people,
      createdByEmployeeId: req.user!.employeeId,
      updatedByEmployeeId: req.user!.employeeId,
      updatedByName: req.user!.name,
    } as any);
    res
      .status(201)
      .json(successResponse(campaign, "Welcome-call campaign created"));
  },
);

export const updateWelcomeCallCampaignController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaign = await loadManageableCampaign(req, String(req.params.id));
    const people = await enrichPeople(req.body, isAdmin(req));
    const configuration = readCampaignConfiguration(req.body);
    validatePostWebinarTeam(configuration, people);
    campaign.set({
      ...configuration,
      memberRules: people.memberRules,
      ...(isAdmin(req)
        ? {
            responsiblePeople: people.responsiblePeople,
            name: String(req.body?.name || campaign.name).trim(),
            webinarTitle: String(
              req.body?.webinarTitle || campaign.webinarTitle || campaign.name,
            ).trim(),
            webinarRecurrence: "WEEKLY",
            registrationAmount: Number(
              req.body?.registrationAmount ?? campaign.registrationAmount,
            ),
            currency: String(
              req.body?.currency || campaign.currency,
            ).toUpperCase(),
            isActive: req.body?.isActive !== false,
          }
        : {}),
      revision: Number(campaign.revision || 1) + 1,
      updatedByEmployeeId: req.user!.employeeId,
      updatedByName: req.user!.name,
    });
    await campaign.save();
    res.json(successResponse(campaign, "Welcome-call configuration updated"));
  },
);

export const ingestWelcomeCallRegistrationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaign = await loadManageableCampaign(req, String(req.params.id));
    const registrations = Array.isArray(req.body?.registrations)
      ? req.body.registrations
      : req.body?.registration
        ? [req.body.registration]
        : [];
    const result = await ingestWelcomeCallRegistrations({
      campaignId: String(campaign._id),
      source: String(req.body?.source || "manual"),
      registrations,
      actorEmployeeId: req.user!.employeeId,
    });
    res.status(201).json(successResponse(result, "Registrations imported"));
  },
);

export const ingestWelcomeCallRegistrationsFromCrmController = asyncHandler(
  async (req: Request, res: Response) => {
    const registrations = readWebhookRows(req.body);
    const result = await ingestWelcomeCallRegistrations({
      campaignId: req.body?.campaignId || req.query.campaignId,
      campaignKey:
        req.params.campaignKey ||
        req.body?.campaignKey ||
        req.query.campaignKey,
      amount: req.body?.amount || req.query.amount,
      source: String(req.body?.source || req.query.source || "pabbly"),
      registrations,
      actorEmployeeId: "CRM",
    });
    res.status(201).json(successResponse(result, "CRM registrations accepted"));
  },
);

export const distributeWelcomeCallsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaign = await loadManageableCampaign(req, String(req.params.id));
    const result = await allocateWelcomeCallLeads(campaign, {
      reason: "MANUAL_DISTRIBUTION",
      assignedByEmployeeId: req.user!.employeeId,
      onlyEmployeeIds: Array.isArray(req.body?.employeeIds)
        ? new Set(req.body.employeeIds.map(String).filter(Boolean))
        : undefined,
      webinarDate: readDate(req.body?.webinarDate, "webinarDate") || undefined,
    });
    res.json(successResponse(result, "Pending registrations distributed"));
  },
);

export const getMyWelcomeCallQueueController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const includeClosed = req.query.includeClosed === "true";
    const campaignId = req.query.campaignId
      ? assertCampaignId(req.query.campaignId)
      : undefined;
    const filter: Record<string, unknown> = {
      assignedToEmployeeId: employeeId,
      ...(campaignId ? { campaignId } : {}),
      ...(!includeClosed
        ? { status: { $in: ["PENDING", "NOT_CONNECTED", "CALLBACK"] } }
        : {}),
    };
    const [leads, statusRows, campaigns] = await Promise.all([
      WelcomeCallLead.find(filter)
        .sort({ nextCallAt: 1, dueDate: 1, registeredAt: 1 })
        .limit(500)
        .lean(),
      WelcomeCallLead.aggregate([
        {
          $match: {
            assignedToEmployeeId: employeeId,
            ...(campaignId
              ? { campaignId: new mongoose.Types.ObjectId(campaignId) }
              : {}),
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      WelcomeCallCampaign.find(
        campaignId
          ? { _id: campaignId }
          : { "memberRules.employeeId": employeeId },
      ).lean(),
    ]);
    const campaignMap = new Map(
      campaigns.map((campaign: any) => [String(campaign._id), campaign]),
    );
    const counts = Object.fromEntries(
      statusRows.map((row) => [String(row._id), Number(row.count)]),
    );
    res.json(
      successResponse(
        {
          leads: leads.map((lead: any) => ({
            ...lead,
            campaignName:
              campaignMap.get(String(lead.campaignId))?.name || "Welcome calls",
          })),
          counts,
          campaigns: campaigns.map((campaign: any) => ({
            _id: campaign._id,
            name: campaign.name,
            reminder: campaign.reminder,
            revision: campaign.revision,
            isEffective: isCampaignEffective(campaign),
          })),
        },
        "Welcome-call queue fetched",
      ),
    );
  },
);

export const updateWelcomeCallOutcomeController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lead = await WelcomeCallLead.findById(String(req.params.id));
    if (!lead) throw new AppError("Welcome-call registration not found", 404);
    const campaign = await WelcomeCallCampaign.findById(lead.campaignId);
    if (!campaign) throw new AppError("Welcome-call campaign not found", 404);
    const assignedToUser = lead.assignedToEmployeeId === req.user?.employeeId;
    if (!assignedToUser && !canManageCampaign(req, campaign)) {
      throw new AppError("Forbidden", 403);
    }

    const outcome = String(req.body?.outcome || "").toUpperCase();
    if (!OUTCOMES.has(outcome)) throw new AppError("Invalid call outcome", 400);
    const nextCallAt = req.body?.nextCallAt
      ? new Date(String(req.body.nextCallAt))
      : null;
    if (
      outcome === "CALLBACK" &&
      (!nextCallAt || Number.isNaN(nextCallAt.getTime()))
    ) {
      throw new AppError("A valid next-call time is required", 400);
    }

    const previousAssignee = String(lead.assignedToEmployeeId || "");
    const previousAssigneeName = String(
      lead.assignedToEmployeeName || req.user!.name,
    );
    (lead.callAttempts as any).push({
      employeeId: req.user!.employeeId,
      employeeName: req.user!.name,
      outcome,
      notes: String(req.body?.notes || "").trim(),
      calledAt: new Date(),
      nextCallAt,
    });
    lead.attemptCount = Number(lead.attemptCount || 0) + 1;
    lead.lastOutcome = outcome;
    lead.nextCallAt = nextCallAt;

    if (outcome === "CALLBACK") {
      lead.status = "CALLBACK";
      lead.dueDate = getBusinessDate(nextCallAt!);
    } else if (outcome === "NOT_CONNECTED") {
      const failedAttempts = (lead.callAttempts as any[]).filter(
        (attempt) => attempt.outcome === "NOT_CONNECTED",
      ).length;
      if (
        campaign.redistribution?.enabled &&
        failedAttempts >= Number(campaign.redistribution.afterAttempts || 1)
      ) {
        lead.status = "UNASSIGNED";
        lead.assignedToEmployeeId = null;
        lead.assignedToEmployeeName = null;
        lead.assignedAt = null;
        lead.nextCallAt = null;
        lead.redistributionCount = Number(lead.redistributionCount || 0) + 1;
      } else {
        lead.status = "NOT_CONNECTED";
      }
    } else {
      lead.status = outcome as any;
      lead.nextCallAt = null;
    }
    await lead.save();

    if (outcome === "NOT_CONNECTED" && lead.status === "UNASSIGNED") {
      const leadId = String(lead._id);
      const exclusions = new Map<string, Set<string>>();
      if (
        campaign.redistribution?.excludePreviousAssignee &&
        previousAssignee
      ) {
        exclusions.set(leadId, new Set([previousAssignee]));
      }
      let allocation = await allocateWelcomeCallLeads(campaign, {
        leadIds: [leadId],
        reason: "REDISTRIBUTION",
        assignedByEmployeeId: req.user!.employeeId,
        exclusionsByLeadId: exclusions,
      });
      if (allocation.assigned === 0 && previousAssignee) {
        allocation = await allocateWelcomeCallLeads(campaign, {
          leadIds: [leadId],
          reason: "REDISTRIBUTION",
          assignedByEmployeeId: req.user!.employeeId,
        });
      }
      void allocation;
    }

    const updated = await WelcomeCallLead.findById(lead._id).lean();
    res.json(
      successResponse(
        { ...updated, previousAssigneeName },
        "Call outcome saved",
      ),
    );
  },
);

export const assignWelcomeCallLeadController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lead = await WelcomeCallLead.findById(String(req.params.id));
    if (!lead) throw new AppError("Welcome-call registration not found", 404);
    const campaign = await loadManageableCampaign(req, String(lead.campaignId));
    const employeeId = String(req.body?.employeeId || "").trim();
    if (!employeeId) {
      lead.assignedToEmployeeId = null;
      lead.assignedToEmployeeName = null;
      lead.assignedAt = null;
      lead.status = "UNASSIGNED";
    } else {
      const user = await User.findOne({ employeeId, isActive: true })
        .select("employeeId name")
        .lean();
      if (!user) throw new AppError("Active employee not found", 404);
      lead.assignedToEmployeeId = user.employeeId;
      lead.assignedToEmployeeName = user.name;
      lead.assignedAt = new Date();
      lead.dueDate = getBusinessDate();
      lead.status = "PENDING";
      (lead.assignmentHistory as any).push({
        employeeId: user.employeeId,
        employeeName: user.name,
        assignedAt: new Date(),
        reason: "MANUAL_ASSIGNMENT",
        assignedByEmployeeId: req.user!.employeeId,
      });
    }
    void campaign;
    await lead.save();
    res.json(successResponse(lead, "Call assignment updated"));
  },
);

export const getWelcomeCallLeadsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaign = await loadManageableCampaign(req, String(req.params.id));
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
    const filter: Record<string, unknown> = { campaignId: campaign._id };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.employeeId) {
      filter.assignedToEmployeeId = String(req.query.employeeId);
    }
    if (req.query.webinarDate) {
      filter.webinarDate = readDate(req.query.webinarDate, "webinarDate", true);
    }
    if (req.query.search) {
      const search = String(req.query.search).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      filter.$or = [
        { registrantName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    const [leads, total] = await Promise.all([
      WelcomeCallLead.find(filter)
        .sort({ registeredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WelcomeCallLead.countDocuments(filter),
    ]);
    res.json(
      successResponse(
        { leads, total, page, limit, pages: Math.ceil(total / limit) },
        "Welcome calls fetched",
      ),
    );
  },
);

export const getWelcomeCallReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaignId = String(req.params.id);
    await loadManageableCampaign(req, campaignId);
    const dateFrom = readDate(req.query.dateFrom, "dateFrom");
    const dateTo = readDate(req.query.dateTo, "dateTo");
    const report = await buildWelcomeCallReport(campaignId, {
      dateFrom,
      dateTo,
    });
    res.json(successResponse(report, "Welcome-call report fetched"));
  },
);

export const exportWelcomeCallReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const campaignId = String(req.params.id);
    await loadManageableCampaign(req, campaignId);
    const dateFrom = readDate(req.query.dateFrom, "dateFrom");
    const dateTo = readDate(req.query.dateTo, "dateTo");
    const result = await buildWelcomeCallWorkbook(campaignId, {
      dateFrom,
      dateTo,
    });
    if (!result) throw new AppError("Welcome-call campaign not found", 404);
    const safeName = slugify(String((result.report.campaign as any).name));
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName || "welcome-calls"}-report.xlsx"`,
    );
    const buffer = await result.workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  },
);
