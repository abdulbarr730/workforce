import { Response } from "express";
import fs from "fs";
import os from "os";
import mongoose from "mongoose";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { env } from "../../../config/env";
import { EmailLog } from "../../notifications/model/email-log.model";
import { isEmailConfigured } from "../../../shared/services/email.service";
import { getClaudeStatus } from "../../../shared/services/claude.service";
import { getSuperAdmins } from "../../../shared/utils/super-admin";
import { AiUsageLog } from "../model/ai-usage-log.model";
import { pricesFor } from "../services/ai-usage.service";
import { MicroCache } from "../../../shared/utils/micro-cache";

const overviewCache = new MicroCache<unknown>(20_000, 4);

const DAY = 24 * 60 * 60 * 1000;

const serverInfo = async () => {
  let disk: { total: number; free: number } | null = null;
  try {
    const statfs = (fs.promises as any).statfs;
    if (statfs) {
      const s = await statfs(process.platform === "win32" ? process.cwd().slice(0, 3) : "/");
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    }
  } catch {
    disk = null;
  }
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || null,
    loadAverage: os.loadavg(),
    memory: { total: os.totalmem(), free: os.freemem() },
    disk,
    uptimeSeconds: Math.round(os.uptime()),
    node: process.version,
    api: {
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || "development",
    },
  };
};

const databaseInfo = async () => {
  const db = mongoose.connection.db;
  if (!db) return { connected: false };
  const [stats, server] = await Promise.all([
    db.stats().catch(() => null),
    db.admin().serverStatus().catch(() => null),
  ]);
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const collections = await Promise.all(
    names.map(async (name) => {
      try {
        const [row] = await db
          .collection(name)
          .aggregate([{ $collStats: { storageStats: {} } }])
          .toArray();
        const s: any = row?.storageStats || {};
        return { name, count: s.count ?? 0, size: s.size ?? 0, storageSize: s.storageSize ?? 0, indexSize: s.totalIndexSize ?? 0 };
      } catch {
        const count = await db.collection(name).estimatedDocumentCount().catch(() => 0);
        return { name, count, size: 0, storageSize: 0, indexSize: 0 };
      }
    }),
  );
  collections.sort((a, b) => b.size - a.size || b.count - a.count);
  return {
    connected: mongoose.connection.readyState === 1,
    name: db.databaseName,
    host: mongoose.connection.host,
    version: (server as any)?.version || null,
    uptimeSeconds: (server as any)?.uptime ?? null,
    connections: (server as any)?.connections || null,
    dataSize: (stats as any)?.dataSize ?? null,
    storageSize: (stats as any)?.storageSize ?? null,
    indexSize: (stats as any)?.indexSize ?? null,
    objects: (stats as any)?.objects ?? null,
    collections,
  };
};

const emailInfo = async (hideIds: string[]) => {
  const since = new Date(Date.now() - 30 * DAY);
  const match = hideIds.length ? { employeeId: { $nin: hideIds } } : {};
  const [byStatus, byCategory, people, last30] = await Promise.all([
    EmailLog.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    EmailLog.aggregate([{ $match: { ...match, status: "SENT" } }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
    EmailLog.distinct("to", { ...match, status: "SENT" }),
    EmailLog.aggregate([
      { $match: { ...match, status: "SENT", createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, people: { $addToSet: "$to" } } },
    ]),
  ]);
  const totals = Object.fromEntries(byStatus.map((s: any) => [s._id, s.count])) as Record<string, number>;
  const costPer1000 = Number(env.EMAIL_COST_PER_1000_USD) || 0;
  const sent = totals.SENT || 0;
  const sent30 = last30[0]?.count || 0;
  return {
    configured: isEmailConfigured(),
    provider: "Zoho ZeptoMail",
    fromAddress: env.MAIL_FROM_ADDRESS || null,
    totals,
    byCategory: Object.fromEntries(byCategory.map((s: any) => [s._id, s.count])),
    peopleEmailed: people.length,
    last30Days: { sent: sent30, people: last30[0]?.people?.length || 0, costUsd: (sent30 / 1000) * costPer1000 },
    costPer1000Usd: costPer1000,
    estimatedCostUsd: (sent / 1000) * costPer1000,
  };
};

const aiInfo = async () => {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since14 = new Date(Date.now() - 14 * DAY);
  const sum = { calls: { $sum: 1 }, inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" }, costUsd: { $sum: "$costUsd" }, failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } } };
  const [all, last30, byFeature, byModel, byDay] = await Promise.all([
    AiUsageLog.aggregate([{ $group: { _id: null, ...sum } }]),
    AiUsageLog.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: null, ...sum } }]),
    AiUsageLog.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: "$feature", ...sum } }, { $sort: { costUsd: -1 } }]),
    AiUsageLog.aggregate([{ $group: { _id: "$model", ...sum } }, { $sort: { costUsd: -1 } }]),
    AiUsageLog.aggregate([
      { $match: { createdAt: { $gte: since14 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, ...sum } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const clean = (row: any) => (row ? { calls: row.calls, inputTokens: row.inputTokens, outputTokens: row.outputTokens, costUsd: row.costUsd, failed: row.failed } : { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failed: 0 });
  return {
    configured: getClaudeStatus().configured,
    model: env.CLAUDE_MODEL,
    pricesPerMTok: pricesFor(env.CLAUDE_MODEL),
    customPrices: Boolean(Number(env.AI_PRICE_INPUT_PER_MTOK) && Number(env.AI_PRICE_OUTPUT_PER_MTOK)),
    allTime: clean(all[0]),
    last30Days: clean(last30[0]),
    byFeature: byFeature.map((r: any) => ({ feature: r._id || "other", ...clean(r) })),
    byModel: byModel.map((r: any) => ({ model: r._id || "unknown", ...clean(r) })),
    byDay: byDay.map((r: any) => ({ date: r._id, ...clean(r) })),
    trackedSince: (await AiUsageLog.findOne({}).sort({ createdAt: 1 }).select("createdAt").lean())?.createdAt || null,
  };
};

const brainInfo = async () => {
  const db = mongoose.connection.db;
  if (!db) return null;
  const count = (name: string) => db.collection(name).estimatedDocumentCount().catch(() => 0);
  const latest = await db
    .collection("workforcebrainmemories")
    .find({}, { projection: { updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(1)
    .toArray()
    .catch(() => []);
  return {
    appKnowledge: await count("appknowledges"),
    memories: await count("workforcebrainmemories"),
    lastUpdatedAt: (latest[0] as any)?.updatedAt || null,
  };
};

/** GET /api/system/overview: server, database, emails, AI cost, Brain. */
export const getSystemOverviewController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const admins = await getSuperAdmins();
  const hideIds = req.user?.role === "SUPER_ADMIN" ? [] : [...admins.ids];
  const fresh = req.query.fresh === "1";
  const data = await overviewCache.getOrCompute(`overview:${hideIds.length ? "admin" : "owner"}`, async () => {
    const [server, database, email, ai, brain] = await Promise.all([
      serverInfo(),
      databaseInfo().catch((e) => ({ connected: false, error: String(e?.message || e) })),
      emailInfo(hideIds),
      aiInfo(),
      brainInfo(),
    ]);
    return { server, database, email, ai, brain, generatedAt: new Date() };
  }, { fresh });
  res.json(successResponse(data));
});
