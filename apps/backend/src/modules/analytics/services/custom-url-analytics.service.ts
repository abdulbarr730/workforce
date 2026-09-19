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
  durationMinutes: number;
  durationHours: number;
  durationFormatted: string;
  category: string;
}

export interface CustomUrlAnalyticsResult {
  summary: CustomUrlUsageSummary[];
  detailedLogs: GranularUrlLogItem[];
  totalTrackedSeconds: number;
  totalTrackedHours: number;
  totalLogEvents: number;
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = (seconds / 3600).toFixed(1);
  return `${hrs}h`;
};

const isGoogleAuthUrl = (urlStr: string, domainStr: string): boolean => {
  const urlLower = urlStr.toLowerCase();
  const domainLower = domainStr.toLowerCase();
  return (
    domainLower.includes("accounts.google") ||
    domainLower.includes("myaccount.google") ||
    urlLower.includes("accounts.google.com") ||
    urlLower.includes("/v3/signin") ||
    urlLower.includes("/signin/challenge") ||
    urlLower.includes("/oauth2/")
  );
};

const checkSmartKeywordMatch = (
  kw: string,
  urlStr: string,
  domainStr: string,
  titleStr: string,
  appNameStr: string
): boolean => {
  const kwLower = kw.trim().toLowerCase();
  if (!kwLower) return false;

  const urlLower = urlStr.toLowerCase();
  const domainLower = domainStr.toLowerCase();
  const titleLower = titleStr.toLowerCase();
  const appLower = appNameStr.toLowerCase();
  const isAuth = isGoogleAuthUrl(urlStr, domainStr);

  // 1. YouTube Preset
  if (kwLower === "youtube") {
    if (isAuth) return false; // Ignore Google auth / 2-step verification challenge pages
    return (
      domainLower.includes("youtube.com") ||
      domainLower.includes("youtu.be") ||
      urlLower.includes("youtube.com") ||
      urlLower.includes("youtu.be") ||
      appLower.includes("youtube") ||
      titleLower.includes(" - youtube") ||
      titleLower.includes("youtube - ") ||
      titleLower.includes("| youtube") ||
      /\byoutube\b/i.test(titleLower)
    );
  }

  // 2. Google Sheets Preset
  if (kwLower === "google sheets" || kwLower === "sheets") {
    if (isAuth) return false;
    return (
      urlLower.includes("docs.google.com/spreadsheets") ||
      domainLower.includes("sheets.google.com") ||
      titleLower.includes("google sheets") ||
      titleLower.includes(" - google sheets") ||
      titleLower.includes(" - sheets")
    );
  }

  // 3. Google Docs Preset
  if (kwLower === "google docs" || kwLower === "docs") {
    if (isAuth) return false;
    return (
      urlLower.includes("docs.google.com/document") ||
      urlLower.includes("docs.google.com/docs") ||
      (domainLower.includes("docs.google.com") &&
        !urlLower.includes("spreadsheets")) ||
      titleLower.includes("google docs") ||
      titleLower.includes(" - google docs")
    );
  }

  // 4. Figma Preset
  if (kwLower === "figma") {
    return (
      domainLower.includes("figma.com") ||
      urlLower.includes("figma.com") ||
      appLower.includes("figma") ||
      titleLower.includes("figma")
    );
  }

  // 5. GitHub Preset
  if (kwLower === "github") {
    return (
      domainLower.includes("github.com") ||
      urlLower.includes("github.com") ||
      appLower.includes("github") ||
      titleLower.includes("github")
    );
  }

  // 6. ChatGPT Preset
  if (kwLower === "chatgpt") {
    return (
      domainLower.includes("chatgpt.com") ||
      domainLower.includes("chat.openai.com") ||
      urlLower.includes("chatgpt.com") ||
      urlLower.includes("chat.openai.com") ||
      appLower.includes("chatgpt") ||
      titleLower.includes("chatgpt")
    );
  }

  // 7. WhatsApp Preset
  if (kwLower === "whatsapp") {
    return (
      domainLower.includes("whatsapp.com") ||
      urlLower.includes("whatsapp.com") ||
      appLower.includes("whatsapp") ||
      titleLower.includes("whatsapp")
    );
  }

  // 8. Canva Preset
  if (kwLower === "canva") {
    return (
      domainLower.includes("canva.com") ||
      urlLower.includes("canva.com") ||
      appLower.includes("canva") ||
      titleLower.includes("canva")
    );
  }

  // Generic keyword/domain matching
  if (
    isAuth &&
    !kwLower.includes("auth") &&
    !kwLower.includes("signin") &&
    !kwLower.includes("google")
  ) {
    return false;
  }

  const mainUrlNoQuery = urlLower.split("?")[0];
  return (
    domainLower.includes(kwLower) ||
    appLower.includes(kwLower) ||
    titleLower.includes(kwLower) ||
    mainUrlNoQuery.includes(kwLower)
  );
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
  let grandTotalSeconds = 0;

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

    if (!url && !domain && !title && !appName) continue;

    const durationMins = Number((duration / 60).toFixed(2));
    const durationHrs = Number((duration / 3600).toFixed(4));

    if (keywords.length > 0) {
      // Keyword matching mode
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        const isMatch = checkSmartKeywordMatch(kw, url, domain, title, appName);

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

          grandTotalSeconds += duration;

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
            durationMinutes: durationMins,
            durationHours: durationHrs,
            durationFormatted: formatDuration(duration),
            category,
          });
        }
      }
    } else {
      // Auto-capture mode: group by domain or appName (filtering auth URLs)
      if (isGoogleAuthUrl(url, domain)) continue;

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

        grandTotalSeconds += duration;

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
          durationMinutes: durationMins,
          durationHours: durationHrs,
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
    totalTrackedSeconds: grandTotalSeconds,
    totalTrackedHours: Number((grandTotalSeconds / 3600).toFixed(2)),
    totalLogEvents: detailedLogs.length,
  };
};
