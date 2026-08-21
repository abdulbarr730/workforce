import { notificationService } from "../../../shared/services/notification.service";
import { getBusinessDate } from "../../daily-flow/utils/business-date";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { LeaveRequest } from "../../attendance/model/leave-request.model";
import { Holiday } from "../../attendance/model/holiday.model";
import { User } from "../../users/model/user.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";
import { queueWelcomeCallSheetSync } from "./welcome-call-sheet-sync.service";
import { EventType } from "../../../_shared/types";

const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

type AllocationOptions = {
  leadIds?: string[];
  reason?:
    | "INITIAL_DISTRIBUTION"
    | "REDISTRIBUTION"
    | "MANUAL_DISTRIBUTION"
    | "SCHEDULED_DAILY"
    | "WEBINAR_CUTOFF"
    | "POST_WEBINAR_IMMEDIATE";
  assignedByEmployeeId?: string;
  exclusionsByLeadId?: Map<string, Set<string>>;
  onlyEmployeeIds?: Set<string>;
  webinarDate?: string;
  allowAbsentEmployees?: boolean;
};

const weekdayForDate = (date: string) =>
  DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];

const RECENT_PRESENCE_MINUTES = 15;
const PRESENCE_EVENT_TYPES: EventType[] = [
  EventType.USER_ACTIVITY,
  EventType.ACTIVE_WINDOW,
  EventType.IDLE_END,
  EventType.AWAY_WORK_END,
];

async function recentlyPresentEmployeeIds(employeeIds?: string[]) {
  if (employeeIds && employeeIds.length === 0) return new Set<string>();
  const since = new Date(Date.now() - RECENT_PRESENCE_MINUTES * 60_000);
  const ids = await ActivityEvent.distinct("employeeId", {
    ...(employeeIds?.length ? { employeeId: { $in: employeeIds } } : {}),
    invalidated: { $ne: true },
    type: { $in: PRESENCE_EVENT_TYPES },
    timestamp: { $gte: since, $lte: new Date() },
  });
  return new Set(ids.map(String));
}

export const isCampaignEffective = (campaign: any, date = getBusinessDate()) =>
  Boolean(
    campaign.isActive &&
    campaign.effectiveFrom <= date &&
    (!campaign.effectiveUntil || campaign.effectiveUntil >= date),
  );

export async function allocateWelcomeCallLeads(
  campaign: any,
  options: AllocationOptions = {},
) {
  const dueDate = getBusinessDate();
  if (!isCampaignEffective(campaign, dueDate)) {
    return { assigned: 0, unassigned: options.leadIds?.length || 0 };
  }

  const day = weekdayForDate(dueDate);
  const excludedDepartments = new Set<string>(
    (campaign.excludedDepartmentIds || []).map(String),
  );
  let eligibleMembers = (campaign.memberRules || []).filter((member: any) => {
    if (!member.enabled) return false;
    if (
      member.departmentId &&
      excludedDepartments.has(String(member.departmentId))
    ) {
      return false;
    }
    return (
      !member.eligibleWeekdays?.length || member.eligibleWeekdays.includes(day)
    );
  });

  // A leader may narrow the configured team for one run. A manual selection
  // can never add somebody who is not already enabled in campaign settings.
  if (options.onlyEmployeeIds?.size) {
    eligibleMembers = eligibleMembers.filter((member: any) =>
      options.onlyEmployeeIds!.has(String(member.employeeId)),
    );
  }

  // A campaign keeps former members for audit/history, but archived employees
  // must never enter a new allocation even if an old pattern still says enabled.
  if (eligibleMembers.length > 0) {
    const activeEmployeeIds = new Set(
      (
        await User.distinct("employeeId", {
          employeeId: {
            $in: eligibleMembers.map((member: any) => member.employeeId),
          },
          isActive: true,
        })
      ).map(String),
    );
    eligibleMembers = eligibleMembers.filter((member: any) =>
      activeEmployeeIds.has(String(member.employeeId)),
    );
  }

  // Presence is the final membership gate for every allocation. Campaign
  // settings choose the pool; recent employee activity proves attendance.
  const requireAgentPresence = options.allowAbsentEmployees !== true;
  const unavailableMembers: Array<{
    employeeId: string;
    employeeName: string;
    reason: "NOT_PRESENT" | "ON_LEAVE" | "HOLIDAY";
  }> = [];
  if (eligibleMembers.length > 0) {
    const holiday = await Holiday.findOne({ date: dueDate, isActive: true })
      .select("workingEmployeeIds")
      .lean();
    if (holiday) {
      const workingEmployeeIds = new Set(
        (holiday.workingEmployeeIds || []).map(String),
      );
      eligibleMembers
        .filter(
          (member: any) => !workingEmployeeIds.has(String(member.employeeId)),
        )
        .forEach((member: any) =>
          unavailableMembers.push({
            employeeId: String(member.employeeId),
            employeeName: String(member.employeeName),
            reason: "HOLIDAY",
          }),
        );
      eligibleMembers = eligibleMembers.filter((member: any) =>
        workingEmployeeIds.has(String(member.employeeId)),
      );
    }
  }
  if (eligibleMembers.length > 0) {
    const employeesOnLeave = new Set(
      (
        await LeaveRequest.distinct("employeeId", {
          employeeId: {
            $in: eligibleMembers.map((member: any) => member.employeeId),
          },
          status: "APPROVED",
          startDate: { $lte: dueDate },
          endDate: { $gte: dueDate },
        })
      ).map(String),
    );
    eligibleMembers
      .filter((member: any) => employeesOnLeave.has(String(member.employeeId)))
      .forEach((member: any) =>
        unavailableMembers.push({
          employeeId: String(member.employeeId),
          employeeName: String(member.employeeName),
          reason: "ON_LEAVE",
        }),
      );
    eligibleMembers = eligibleMembers.filter(
      (member: any) => !employeesOnLeave.has(String(member.employeeId)),
    );
  }
  if (requireAgentPresence && eligibleMembers.length > 0) {
    const presentEmployeeIds = await recentlyPresentEmployeeIds(
      eligibleMembers.map((member: any) => String(member.employeeId)),
    );
    eligibleMembers
      .filter(
        (member: any) => !presentEmployeeIds.has(String(member.employeeId)),
      )
      .forEach((member: any) =>
        unavailableMembers.push({
          employeeId: String(member.employeeId),
          employeeName: String(member.employeeName),
          reason: "NOT_PRESENT",
        }),
      );
    eligibleMembers = eligibleMembers.filter((member: any) =>
      presentEmployeeIds.has(String(member.employeeId)),
    );
  }

  const eligibleEmployeeIds = new Set(
    eligibleMembers.map((member: any) => String(member.employeeId)),
  );
  const shouldRepairAutomaticAssignments = [
    "INITIAL_DISTRIBUTION",
    "SCHEDULED_DAILY",
    "WEBINAR_CUTOFF",
  ].includes(options.reason || "");
  if (shouldRepairAutomaticAssignments) {
    const staleAssignmentFilter: Record<string, unknown> = {
      campaignId: campaign._id,
      status: "PENDING",
      attemptCount: 0,
      assignedToEmployeeId: {
        $ne: null,
        $nin: [...eligibleEmployeeIds],
      },
    };
    if (options.webinarDate) {
      staleAssignmentFilter.webinarDate = options.webinarDate;
    }
    const staleAssignments = await WelcomeCallLead.find(
      staleAssignmentFilter,
    ).select("_id assignedToEmployeeId");
    if (staleAssignments.length > 0) {
      await WelcomeCallLead.updateMany(
        { _id: { $in: staleAssignments.map((lead) => lead._id) } },
        {
          $set: {
            status: "UNASSIGNED",
            assignedToEmployeeId: null,
            assignedToEmployeeName: null,
            assignedAt: null,
            nextCallAt: null,
          },
          $inc: { redistributionCount: 1 },
        },
      );
      const refreshedLeads = await WelcomeCallLead.find({
        _id: { $in: staleAssignments.map((lead) => lead._id) },
      }).lean();
      refreshedLeads.forEach((lead) => queueWelcomeCallSheetSync(lead));
      new Set(
        staleAssignments.map((lead) => String(lead.assignedToEmployeeId)),
      ).forEach((employeeId) => {
        if (!employeeId) return;
        notificationService.broadcastToUser(
          employeeId,
          "welcome_call_queue_updated",
          {
            title: "Welcome-call queue updated",
            message:
              "Untouched calls were reassigned to employees currently present.",
          },
        );
      });
    }
  }

  const leadFilter: Record<string, unknown> = {
    campaignId: campaign._id,
    assignedToEmployeeId: null,
    status: "UNASSIGNED",
  };
  if (options.leadIds?.length) leadFilter._id = { $in: options.leadIds };
  if (options.webinarDate) leadFilter.webinarDate = options.webinarDate;

  const [leads, countRows] = await Promise.all([
    WelcomeCallLead.find(leadFilter)
      .select("_id registrantName webinarDate")
      .sort({ registeredAt: 1, _id: 1 })
      .lean(),
    WelcomeCallLead.aggregate([
      {
        $match: {
          campaignId: campaign._id,
          assignedToEmployeeId: { $ne: null },
          dueDate: { $gte: campaign.effectiveFrom },
        },
      },
      {
        $group: {
          _id: {
            employeeId: "$assignedToEmployeeId",
            webinarDate: "$webinarDate",
            dueDate: "$dueDate",
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const webinarCounts = new Map<string, number>();
  const todayCounts = new Map<string, number>();
  for (const row of countRows) {
    const employeeId = String(row._id.employeeId || "");
    const webinarKey = `${String(row._id.webinarDate || "UNGROUPED")}:${employeeId}`;
    webinarCounts.set(
      webinarKey,
      (webinarCounts.get(webinarKey) || 0) + row.count,
    );
    if (row._id.dueDate === dueDate) {
      todayCounts.set(
        employeeId,
        (todayCounts.get(employeeId) || 0) + row.count,
      );
    }
  }

  const assignments: Array<{
    leadId: string;
    employeeId: string;
    employeeName: string;
  }> = [];
  for (const lead of leads) {
    const leadId = String(lead._id);
    const webinarDate = String(lead.webinarDate || "UNGROUPED");
    const exclusions = options.exclusionsByLeadId?.get(leadId) || new Set();
    const candidates = eligibleMembers
      .filter((member: any) => !exclusions.has(member.employeeId))
      .filter((member: any) => {
        const dailyCap = Number(member.dailyCap || 0);
        return (
          !dailyCap || (todayCounts.get(member.employeeId) || 0) < dailyCap
        );
      })
      .sort((left: any, right: any) => {
        const leftKey = `${webinarDate}:${left.employeeId}`;
        const rightKey = `${webinarDate}:${right.employeeId}`;
        const leftCount = webinarCounts.get(leftKey) || 0;
        const rightCount = webinarCounts.get(rightKey) || 0;
        const leftTodayCount = todayCounts.get(left.employeeId) || 0;
        const rightTodayCount = todayCounts.get(right.employeeId) || 0;
        return (
          leftCount - rightCount ||
          leftTodayCount - rightTodayCount ||
          String(left.employeeId).localeCompare(String(right.employeeId))
        );
      });

    const selected = candidates[0];
    if (!selected) continue;

    assignments.push({
      leadId,
      employeeId: selected.employeeId,
      employeeName: selected.employeeName,
    });
    const selectedWebinarKey = `${webinarDate}:${selected.employeeId}`;
    webinarCounts.set(
      selectedWebinarKey,
      (webinarCounts.get(selectedWebinarKey) || 0) + 1,
    );
    todayCounts.set(
      selected.employeeId,
      (todayCounts.get(selected.employeeId) || 0) + 1,
    );
  }

  const now = new Date();
  if (assignments.length > 0) {
    await WelcomeCallLead.bulkWrite(
      assignments.map((assignment) => ({
        updateOne: {
          filter: {
            _id: assignment.leadId,
            assignedToEmployeeId: null,
            status: "UNASSIGNED",
          },
          update: {
            $set: {
              assignedToEmployeeId: assignment.employeeId,
              assignedToEmployeeName: assignment.employeeName,
              assignedAt: now,
              dueDate,
              status: "PENDING",
              nextCallAt: null,
            },
            $push: {
              assignmentHistory: {
                employeeId: assignment.employeeId,
                employeeName: assignment.employeeName,
                assignedAt: now,
                reason: options.reason || "INITIAL_DISTRIBUTION",
                assignedByEmployeeId: options.assignedByEmployeeId || "SYSTEM",
              },
            },
          },
        },
      })) as any,
      { ordered: false },
    );
    const updatedLeads = await WelcomeCallLead.find({
      _id: { $in: assignments.map((assignment) => assignment.leadId) },
    }).lean();
    updatedLeads.forEach((lead) => queueWelcomeCallSheetSync(lead));
  }

  const notificationCounts = new Map<string, { name: string; count: number }>();
  assignments.forEach((assignment) => {
    const current = notificationCounts.get(assignment.employeeId) || {
      name: assignment.employeeName,
      count: 0,
    };
    current.count += 1;
    notificationCounts.set(assignment.employeeId, current);
  });
  notificationCounts.forEach(({ count }, employeeId) => {
    notificationService.broadcastToUser(employeeId, "welcome_call_assigned", {
      campaignId: String(campaign._id),
      campaignName: campaign.name,
      count,
      title: "New welcome calls assigned",
      message: `${count} new ${count === 1 ? "call is" : "calls are"} ready in your queue.`,
    });
  });

  if (
    ["MANUAL_DISTRIBUTION", "SCHEDULED_DAILY", "WEBINAR_CUTOFF"].includes(
      options.reason || "",
    )
  ) {
    await campaign.updateOne({
      $set: {
        "scheduleState.lastUnavailableMembers": unavailableMembers,
        "scheduleState.lastAllocationAt": new Date(),
      },
    });
  }

  return {
    assigned: assignments.length,
    unassigned: Math.max(0, leads.length - assignments.length),
    unavailableMembers,
  };
}

export async function rebalanceUntouchedWelcomeCallLeads(
  campaign: any,
  addedEmployeeIds: string[],
  options: {
    webinarDate?: string;
    assignedByEmployeeId: string;
    assignedOnly?: boolean;
  },
) {
  const filter: Record<string, unknown> = {
    campaignId: campaign._id,
    ...(options.assignedOnly
      ? {
          status: "PENDING",
          attemptCount: 0,
          assignedToEmployeeId: { $ne: null },
        }
      : {
          $or: [
            { status: "UNASSIGNED", assignedToEmployeeId: null },
            { status: "PENDING", attemptCount: 0 },
          ],
        }),
  };
  if (options.webinarDate) filter.webinarDate = options.webinarDate;

  const untouched = await WelcomeCallLead.find(filter)
    .select("_id assignedToEmployeeId")
    .lean();
  const participantIds = new Set(
    (options.assignedOnly
      ? addedEmployeeIds
      : [
          ...untouched.map((lead) => String(lead.assignedToEmployeeId || "")),
          ...addedEmployeeIds,
        ]
    ).filter(Boolean),
  );
  const previouslyAssignedIds = untouched
    .filter((lead) => lead.assignedToEmployeeId)
    .map((lead) => lead._id);

  if (previouslyAssignedIds.length > 0) {
    await WelcomeCallLead.updateMany(
      {
        _id: { $in: previouslyAssignedIds },
        status: "PENDING",
        attemptCount: 0,
      },
      {
        $set: {
          status: "UNASSIGNED",
          assignedToEmployeeId: null,
          assignedToEmployeeName: null,
          assignedAt: null,
          nextCallAt: null,
        },
        $inc: { redistributionCount: 1 },
      },
    );
  }

  const result = await allocateWelcomeCallLeads(campaign, {
    leadIds: untouched.map((lead) => String(lead._id)),
    reason: "MANUAL_DISTRIBUTION",
    assignedByEmployeeId: options.assignedByEmployeeId,
    onlyEmployeeIds: participantIds,
    webinarDate: options.webinarDate,
    allowAbsentEmployees: options.assignedOnly === true,
  });
  // Re-sync every touched lead, including calls that could not be assigned.
  // Allocation already syncs successful assignments; this additional pass is
  // what clears a previous employee from Google Sheets when redistribution
  // leaves the call in the unassigned pool.
  const redistributedLeads = await WelcomeCallLead.find({
    _id: { $in: untouched.map((lead) => lead._id) },
  }).lean();
  redistributedLeads.forEach((lead) => queueWelcomeCallSheetSync(lead));
  return {
    ...result,
    rebalanced: previouslyAssignedIds.length,
    protectedCompleted: await WelcomeCallLead.countDocuments({
      campaignId: campaign._id,
      ...(options.webinarDate ? { webinarDate: options.webinarDate } : {}),
      $or: [
        { attemptCount: { $gt: 0 } },
        { status: { $nin: ["PENDING", "UNASSIGNED"] } },
      ],
    }),
  };
}
