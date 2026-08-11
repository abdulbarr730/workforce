import { logger } from "../../../shared/logger/logger";
import { WelcomeCallCampaign } from "../model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";
import {
  allocateWelcomeCallLeads,
  isCampaignEffective,
} from "./welcome-call-allocation.service";
import {
  getWelcomeCallSchedule,
  getZonedClock,
  minutesFromClockTime,
} from "./welcome-call-schedule.service";

const releaseClaim = async (campaignId: string, runKey: string) => {
  await WelcomeCallCampaign.updateOne(
    { _id: campaignId },
    { $pull: { "scheduleState.completedRunKeys": runKey } },
  );
};

const runClaimedDistribution = async (campaign: any, runKey: string) => {
  const claimed = await WelcomeCallCampaign.findOneAndUpdate(
    {
      _id: campaign._id,
      isActive: true,
      "scheduleState.completedRunKeys": { $ne: runKey },
    },
    {
      $push: {
        "scheduleState.completedRunKeys": {
          $each: [runKey],
          $slice: -60,
        },
      },
    },
    { new: true },
  );
  if (!claimed) return;

  try {
    const result = await allocateWelcomeCallLeads(claimed, {
      reason: "SCHEDULED_DAILY",
      assignedByEmployeeId: "SYSTEM_SCHEDULER",
    });
    logger.info(
      `[Welcome Calls] Scheduled run ${runKey} completed for ${claimed.key}: ${result.assigned} assigned, ${result.unassigned} accumulated`,
    );
  } catch (error) {
    await releaseClaim(String(campaign._id), runKey);
    throw error;
  }
};

let schedulerRunning = false;

const redistributeDueNotConnected = async (campaign: any, now: Date) => {
  if (!campaign.redistribution?.enabled) return;
  const dueLeads = await WelcomeCallLead.find({
    campaignId: campaign._id,
    status: "NOT_CONNECTED",
    nextCallAt: { $ne: null, $lte: now },
  }).limit(500);

  for (const lead of dueLeads) {
    const previousEmployeeId = String(lead.assignedToEmployeeId || "");
    lead.status = "UNASSIGNED";
    lead.assignedToEmployeeId = null;
    lead.assignedToEmployeeName = null;
    lead.assignedAt = null;
    lead.nextCallAt = null;
    lead.redistributionCount = Number(lead.redistributionCount || 0) + 1;
    await lead.save();

    const exclusions = new Map<string, Set<string>>();
    if (campaign.redistribution.excludePreviousAssignee && previousEmployeeId) {
      exclusions.set(String(lead._id), new Set([previousEmployeeId]));
    }
    await allocateWelcomeCallLeads(campaign, {
      leadIds: [String(lead._id)],
      reason: "REDISTRIBUTION",
      assignedByEmployeeId: "SYSTEM_SCHEDULER",
      exclusionsByLeadId: exclusions,
    });
  }
};

export async function runWelcomeCallAllocationScheduler(now = new Date()) {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const campaigns = await WelcomeCallCampaign.find({ isActive: true });
    for (const campaign of campaigns) {
      await redistributeDueNotConnected(campaign, now);
      const schedule = getWelcomeCallSchedule(campaign);
      if (schedule.mode !== "SCHEDULED") continue;

      const clock = getZonedClock(now, schedule.timezone);
      if (!isCampaignEffective(campaign, clock.date)) continue;

      const dueRuns = schedule.weeklyRunTimes
        .filter(
          (run: { weekday: string; time: string }) =>
            run.weekday === clock.weekday &&
            clock.minutes >= minutesFromClockTime(run.time),
        )
        .sort(
          (a: { time: string }, b: { time: string }) =>
            minutesFromClockTime(a.time) - minutesFromClockTime(b.time),
        );

      for (const run of dueRuns) {
        const runKey = `${clock.date}:${run.weekday}:${run.time}`;
        if (campaign.scheduleState?.completedRunKeys?.includes(runKey))
          continue;
        await runClaimedDistribution(campaign, runKey);
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

export function startWelcomeCallAllocationScheduler() {
  logger.info(
    "Welcome-call allocation scheduler started (60-second lightweight check)",
  );
  void runWelcomeCallAllocationScheduler().catch((error) =>
    logger.error(error as Error, "Welcome-call scheduler initial run failed"),
  );
  const timer = setInterval(() => {
    void runWelcomeCallAllocationScheduler().catch((error) =>
      logger.error(error as Error, "Welcome-call scheduler run failed"),
    );
  }, 60_000);
  timer.unref();
}
