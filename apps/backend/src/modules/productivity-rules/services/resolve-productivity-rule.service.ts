import { ProductivityRule } from "../model/productivity-rule.model";
import { User } from "../../users/model/user.model";

interface ResolveInput {
  companyId: string;
  employeeId: string;
  appName: string;
  title?: string;
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
  const { companyId, employeeId, appName, title } = payload;
  const lowerTitle = title?.toLowerCase() || "";

  // 1. Get User (cached for 5 minutes)
  const userCacheKey = `user_${employeeId}`;
  let user = cache.get<any>(userCacheKey);
  if (!user) {
    user = await User.findOne({ employeeId }).lean();
    if (user) cache.set(userCacheKey, user);
  }
  const departmentId = user?.departmentId || null;

  // 2. Get Rules for AppName (cached for 5 minutes)
  const rulesCacheKey = `rules_${appName.toLowerCase()}`;
  let rules = cache.get<any[]>(rulesCacheKey);
  if (!rules) {
    rules = await ProductivityRule.find({ 
      appName: { $regex: new RegExp(`^${appName}$`, 'i') } 
    }).lean();
    if (rules) cache.set(rulesCacheKey, rules);
  }

  if (!rules || rules.length === 0) {
    return { productivityCategory: "PRODUCTIVE", productivityScore: 1.0, matchedRuleId: null };
  }

  // Helper: Evaluates a single rule based on titlePattern
  const evaluateRule = (rule: any) => {
    if (!rule.titlePattern) return true; // No pattern = match all titles for this app
    try {
      const regex = new RegExp(rule.titlePattern, 'i');
      return regex.test(lowerTitle);
    } catch (e) {
      // Invalid regex fallback to simple includes
      return lowerTitle.includes(rule.titlePattern.toLowerCase());
    }
  };

  /*
    Priority Order
    1. EMPLOYEE
    2. DEPARTMENT
    3. GLOBAL
  */

  const employeeRule = rules.find((rule) => rule.scopeType === "EMPLOYEE" && rule.scopeId === employeeId && evaluateRule(rule));
  if (employeeRule) return employeeRule;

  if (departmentId) {
    const departmentRule = rules.find((rule) => rule.scopeType === "DEPARTMENT" && rule.scopeId === departmentId && evaluateRule(rule));
    if (departmentRule) return departmentRule;
  }

  const globalRule = rules.find((rule) => rule.scopeType === "GLOBAL" && evaluateRule(rule));
  if (globalRule) return globalRule;

  // DEFAULT FALLBACK if no rules matched the title/scope criteria
  return {
    productivityCategory: "PRODUCTIVE",
    productivityScore: 1.0,
    matchedRuleId: null
  };
};