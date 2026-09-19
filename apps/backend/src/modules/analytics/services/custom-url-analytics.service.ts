import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { User } from "../../users/model/user.model";

export interface CustomUrlUsageSummary {
  keyword: string;
  totalSeconds: number;
  totalHours: number;
  totalEvents: number;
  category: string;
  matchedTitles: string[];
  topUsers: string[];
}

export interface GranularUrlLogItem {
  date: string;
  timestamp: string;
  employeeId: string;
  employeeName: string;
  matchedKeyword: string;
  appName: string;
  title: string;
  url: string;
  domain: string;
  durationSeconds: number;
  durationFormatted: string;
  category: string;
}

export interface CustomUrlAnalyticsResult {
  summary: CustomUrlUsageSummary[];
  detailedLogs: GranularUrlLogItem[];
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = (seconds / 3600).toFixed(1);
  return `${hrs}h`;
};

export const getCustomUrlAnalytics = async (
  startDate: string,
  endDate: string,
  employeeId?: string,
  customUrlKeywords?: string
): Promise<CustomUrlAnalyticsResult> => {
  const startTimestamp = new Date(`${startDate}T00:00:00.000Z`);
  const endTimestamp = new Date(`${endDate}T23:59:59.999Z`);

  const query: any = {
    timestamp: { $gte: startTimestamp, $lte: endTimestamp },
    invalidated: { $ne: true },
  };

  if (employeeId && employeeId !== "ALL") {
    query.employeeId = employeeId;
  }

  const [events, users] = await Promise.all([
    ActivityEvent.find(query).sort({ timestamp: -1 }).lean(),
    User.find({}, "employeeId name").lean(),
  ]);

  const userMap = new Map(users.map((u: any) => [u.employeeId, u.name]));

  // Parse keywords or presets
  const rawKeywords = (customUrlKeywords || "")
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

  const keywords = rawKeywords.length > 0 ? rawKeywords : [];

  const getEventDuration = (meta: any): number => {
    if (!meta) return 15;
    const secs = Number(meta.durationSeconds || meta.duration);
    if (!isNaN(secs) && secs > 0) return Math.min(secs, 300);
    const mins = Number(meta.durationMinutes);
    if (!isNaN(mins) && mins > 0) return Math.min(mins * 60, 300);
    return 15;
  };

  const resultMap = new Map<
    string,
    {
      keyword: string;
      totalSeconds: number;
      totalEvents: number;
      categoryCount: Record<string, number>;
      titles: Set<string>;
      userSeconds: Map<string, number>;
    }
  >();

  const getOrCreateResult = (key: string, label: string) => {
    if (!resultMap.has(key)) {
      resultMap.set(key, {
        keyword: label,
        totalSeconds: 0,
        totalEvents: 0,
        categoryCount: { PRODUCTIVE: 0, UNPRODUCTIVE: 0, NEUTRAL: 0 },
        titles: new Set<string>(),
        userSeconds: new Map<string, number>(),
      });
    }
    return resultMap.get(key)!;
  };

  const detailedLogs: GranularUrlLogItem[] = [];

  for (const ev of events) {
    const meta: any = ev.metadata || {};
    const url = (meta.url || "").trim();
    const domain = (meta.domain || "").trim();
    const title = (meta.windowTitle || meta.title || "").trim();
    const appName = (meta.appName || meta.processName || "").trim();
    const duration = getEventDuration(meta);
    const category = ev.productivityCategory || "NEUTRAL";
    const empId = ev.employeeId;
    const empName = userMap.get(empId) || empId;

    const d = ev.timestamp ? new Date(ev.timestamp) : null;
    let evTimestamp = "";
    let evDate = "";

    if (d && !isNaN(d.getTime())) {
      // Format timestamp specifically in Indian Standard Time (IST - Asia/Kolkata, UTC+5:30)
      evTimestamp =
        d.toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "medium",
        }) + " IST";

      evDate = d.toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
    }

    const fullText = `${url} ${domain} ${title} ${appName}`.toLowerCase();
    if (!fullText.trim()) continue;

    if (keywords.length > 0) {
      // Keyword matching mode
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        let isMatch = false;

        // Smart preset alias matching
        if (kwLower === "google sheets" || kwLower === "sheets") {
          isMatch =
            fullText.includes("sheet") ||
            fullText.includes("docs.google.com/spreadsheets");
        } else if (kwLower === "google docs" || kwLower === "docs") {
          isMatch =
            (fullText.includes("doc") && fullText.includes("google")) ||
            fullText.includes("docs.google.com/document");
        } else if (kwLower === "youtube") {
          isMatch = fullText.includes("youtube") || fullText.includes("youtu.be");
        } else if (kwLower === "figma") {
          isMatch = fullText.includes("figma");
        } else if (kwLower === "github") {
          isMatch = fullText.includes("github");
        } else if (kwLower === "chatgpt") {
          isMatch =
            fullText.includes("chatgpt") || fullText.includes("chat.openai");
        } else if (kwLower === "whatsapp") {
          isMatch = fullText.includes("whatsapp");
        } else if (kwLower === "canva") {
          isMatch = fullText.includes("canva");
        } else {
          isMatch = fullText.includes(kwLower);
        }

        if (isMatch) {
          const res = getOrCreateResult(kwLower, kw);
          res.totalSeconds += duration;
          res.totalEvents += 1;
          res.categoryCount[category] = (res.categoryCount[category] || 0) + 1;
          if (title || url) res.titles.add(title || url);
          res.userSeconds.set(
            empId,
            (res.userSeconds.get(empId) || 0) + duration
          );

          detailedLogs.push({
            date: evDate,
            timestamp: evTimestamp,
            employeeId: empId,
            employeeName: empName,
            matchedKeyword: kw,
            appName: appName || domain || "Browser",
            title: title || domain || url || "Active Window",
            url: url || (domain ? `https://${domain}` : ""),
            domain: domain || "",
            durationSeconds: duration,
            durationFormatted: formatDuration(duration),
            category,
          });
        }
      }
    } else {
      // Auto-capture mode: group by domain or appName
      const autoGroupKey = domain || appName || "Other Apps/Websites";
      if (autoGroupKey && autoGroupKey !== "Other Apps/Websites") {
        const res = getOrCreateResult(
          autoGroupKey.toLowerCase(),
          autoGroupKey
        );
        res.totalSeconds += duration;
        res.totalEvents += 1;
        res.categoryCount[category] = (res.categoryCount[category] || 0) + 1;
        if (title || url) res.titles.add(title || url);
        res.userSeconds.set(
          empId,
          (res.userSeconds.get(empId) || 0) + duration
        );

        detailedLogs.push({
          date: evDate,
          timestamp: evTimestamp,
          employeeId: empId,
          employeeName: empName,
          matchedKeyword: autoGroupKey,
          appName: appName || domain || "Browser",
          title: title || domain || url || "Active Window",
          url: url || (domain ? `https://${domain}` : ""),
          domain: domain || "",
          durationSeconds: duration,
          durationFormatted: formatDuration(duration),
          category,
        });
      }
    }
  }

  const summary: CustomUrlUsageSummary[] = [];

  for (const entry of Array.from(resultMap.values())) {
    let dominantCat = "NEUTRAL";
    let maxCatCount = 0;
    for (const [cat, count] of Object.entries(entry.categoryCount)) {
      if (count > maxCatCount) {
        maxCatCount = count;
        dominantCat = cat;
      }
    }

    const topUsers = Array.from(entry.userSeconds.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([empId, secs]) => {
        const name = userMap.get(empId) || empId;
        const hrs = (secs / 3600).toFixed(2);
        return `${name} (${hrs}h)`;
      });

    summary.push({
      keyword: entry.keyword,
      totalSeconds: entry.totalSeconds,
      totalHours: Number((entry.totalSeconds / 3600).toFixed(2)),
      totalEvents: entry.totalEvents,
      category: dominantCat,
      matchedTitles: Array.from(entry.titles).slice(0, 5),
      topUsers,
    });
  }

  summary.sort((a, b) => b.totalHours - a.totalHours);

  return {
    summary,
    detailedLogs,
  };
};
