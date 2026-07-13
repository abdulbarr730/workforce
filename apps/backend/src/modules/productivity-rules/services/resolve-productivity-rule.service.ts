import { ProductivityRule } from "../model/productivity-rule.model";
import { User } from "../../users/model/user.model";

interface ResolveInput {
  companyId: string;
  employeeId: string;
  appName: string;
  title?: string;
  url?: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any, ttlMs: number = 300000) {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}

const cache = new MemoryCache();

export const resolveProductivityRule = async (payload: ResolveInput) => {
  const { companyId, employeeId, appName, title, url } = payload;
  const lowerTitle = title?.toLowerCase() || "";
  const lowerUrl = url?.toLowerCase() || "";

  // 1. Get User (cached for 5 minutes)
  const userCacheKey = `user_${employeeId}`;
  let user = cache.get<any>(userCacheKey);
  if (!user) {
    user = await User.findOne({ employeeId }).lean();
    if (user) cache.set(userCacheKey, user);
  }
  const departmentId = user?.departmentId || null;

  // 2. Get All Rules (cached for 5 minutes)
  const rulesCacheKey = `all_rules`;
  let rules = cache.get<any[]>(rulesCacheKey);
  if (!rules) {
    rules = await ProductivityRule.find({}).lean();
    if (rules) cache.set(rulesCacheKey, rules);
  }

  if (!rules || rules.length === 0) {
    return {
      productivityCategory: "PRODUCTIVE",
      productivityScore: 1.0,
      matchedRuleId: null,
      allowanceMinutes: 30,
    };
  }

  // Helper: Evaluates a single rule based on appName and titlePattern
  const evaluateRule = (rule: any) => {
    const lowerAppName = (appName || "").toLowerCase();
    const ruleAppNameLower = (rule.appName || "").toLowerCase();

    // Does the event match the rule's App Name criteria?
    // If the rule has no appName defined, assume it applies to all apps.
    const isAppMatch =
      !rule.appName ||
      lowerAppName.includes(ruleAppNameLower) ||
      ruleAppNameLower.includes(lowerAppName) ||
      lowerTitle.includes(ruleAppNameLower) ||
      lowerUrl.includes(ruleAppNameLower);

    if (!isAppMatch) return false;

    // If the rule explicitly defines a title pattern, the event's title or URL MUST match it.
    if (rule.titlePattern && rule.titlePattern.trim() !== "") {
      const searchSpace = `${lowerTitle} ${lowerUrl}`;
      if (!searchSpace.trim()) return false;

      try {
        const regex = new RegExp(rule.titlePattern, "i");
        return regex.test(searchSpace);
      } catch (e) {
        return searchSpace.includes(rule.titlePattern.toLowerCase());
      }
    }

    // If no title pattern is specified, just matching the app name is enough
    return true;
  };

  /*
    Priority Order
    1. EMPLOYEE (Specific > Generic)
    2. DEPARTMENT (Specific > Generic)
    3. GLOBAL (Specific > Generic)
  */

  // Sort rules by specificity: Rules with a titlePattern are evaluated before rules without one
  const sortedRules = [...rules].sort((a, b) => {
    const aHasTitle = a.titlePattern && a.titlePattern.trim() !== "" ? 1 : 0;
    const bHasTitle = b.titlePattern && b.titlePattern.trim() !== "" ? 1 : 0;
    return bHasTitle - aHasTitle; // Descending order (1 comes before 0)
  });

  const employeeRule = sortedRules.find(
    (rule) =>
      rule.scopeType === "EMPLOYEE" &&
      rule.scopeId === employeeId &&
      evaluateRule(rule),
  );
  if (employeeRule) return employeeRule;

  if (departmentId) {
    const departmentRule = sortedRules.find(
      (rule) =>
        rule.scopeType === "DEPARTMENT" &&
        rule.scopeId === departmentId &&
        evaluateRule(rule),
    );
    if (departmentRule) return departmentRule;
  }

  const globalRule = sortedRules.find(
    (rule) => rule.scopeType === "GLOBAL" && evaluateRule(rule),
  );
  if (globalRule) return globalRule;

  // DEFAULT FALLBACK if no rules matched the title/scope criteria
  return {
    productivityCategory: "UNPRODUCTIVE",
    productivityScore: 0.0,
    matchedRuleId: null,
  };
};
