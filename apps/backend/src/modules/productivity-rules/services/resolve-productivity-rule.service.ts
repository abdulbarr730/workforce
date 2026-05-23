import { ProductivityRule } from "../model/productivity-rule.model";

interface ResolveInput {
  companyId: string;

  employeeId: string;

  appName: string;

  title?: string;
}

export const resolveProductivityRule =
  async (
    payload: ResolveInput
  ) => {
    const {
      companyId,

      employeeId,

      appName,

      title
    } = payload;

    /*
      Priority Order

      EMPLOYEE
      ROLE
      DEPARTMENT
      GLOBAL
    */

    const rules =
      await ProductivityRule.find({
        companyId,

        appName
      }).lean();

    /*
      EMPLOYEE RULE
    */

    const employeeRule =
      rules.find(
        (rule) =>
          rule.scopeType ===
            "EMPLOYEE" &&

          rule.scopeId ===
            employeeId
      );

    if (employeeRule) {
      return employeeRule;
    }

    /*
      GLOBAL RULE
    */

    const globalRule =
      rules.find(
        (rule) =>
          rule.scopeType ===
          "GLOBAL"
      );

    if (globalRule) {
      return globalRule;
    }

    /*
      DEFAULT FALLBACK
    */

    return {
      productivityCategory:
        "NEUTRAL",

      productivityScore: 0.5,

      matchedRuleId: null
    };
  };