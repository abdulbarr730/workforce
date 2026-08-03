import crypto from "crypto";
import { env } from "../../../config/env";
import { Department } from "../../departments/model/department.model";

export type CrmEventType =
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "department.created"
  | "department.updated"
  | "department.deleted";

export interface CrmWebhookPayload {
  event: CrmEventType;
  timestamp: string;
  data: any;
}

/**
 * Dispatches an asynchronous webhook notification to the configured CRM webhook endpoint.
 * Never throws or blocks main workflow execution.
 */
export async function dispatchCrmWebhook(event: CrmEventType, data: any) {
  const webhookUrl = env.CRM_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  // Format data if it's an employee to enrich with department details
  let formattedData = data;
  try {
    if (data && typeof data.toObject === "function") {
      formattedData = data.toObject();
    }
    if (formattedData && formattedData.password) {
      delete formattedData.password;
    }

    // If there is departmentId, fetch full department details
    if (formattedData?.departmentId && !formattedData.department) {
      const dept = await Department.findById(formattedData.departmentId).lean();
      if (dept) {
        formattedData.department = {
          id: dept._id,
          name: dept.name,
          code: (dept as any).code,
          description: dept.description,
          managerId: (dept as any).managerId,
          managerName: (dept as any).managerName,
        };
      }
    }
  } catch (err) {
    console.error("[CRM Webhook] Error enriching payload:", err);
  }

  const payload: CrmWebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: formattedData,
  };

  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "WorkforcePlatform-CRM-Webhook/1.0",
  };

  if (env.CRM_WEBHOOK_SECRET) {
    const signature = crypto
      .createHmac("sha256", env.CRM_WEBHOOK_SECRET)
      .update(bodyStr)
      .digest("hex");
    headers["X-CRM-Signature"] = signature;
  }

  // Async dispatch with timeout
  (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(
          `[CRM Webhook] Warning: Webhook returned status ${response.status} ${response.statusText}`,
        );
      } else {
        console.log(`[CRM Webhook] Event '${event}' delivered successfully.`);
      }
    } catch (err: any) {
      console.error(
        `[CRM Webhook] Failed to dispatch '${event}' to ${webhookUrl}:`,
        err?.message || err,
      );
    }
  })();
}
