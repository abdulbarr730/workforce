import { Department } from "../../departments/model/department.model";
import { User } from "../../users/model/user.model";
import {
  extractClaudeJsonObject,
  getClaudeStatus,
  requestClaudeJson,
} from "../../../shared/services/claude.service";
import { AppKnowledge } from "../model/app-knowledge.model";

export type ActivityInferenceInput = {
  employeeId?: string;
  app?: string;
  domain?: string;
  title?: string;
  url?: string;
};

export type InferredActivityResult = {
  app: string;
  domain: string;
  title: string;
  url: string;
  departmentName: string;
  departmentResponsibilities: string[];
  appPurpose: string;
  appCategory: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  inferredActivity: string;
  suggestedTaskCategory: string;
  confidence: number;
};

// Seed baseline dictionary of common apps & operational purposes
const SEED_APP_KNOWLEDGE = [
  {
    appName: "Google Sheets",
    domain: "sheets.google.com",
    category: "PRODUCTIVE",
    purpose:
      "Spreadsheet data tracking, call logs, daily reports, financial calculations, and inventory management.",
    targetDepartments: ["Comms", "Sales", "Finance", "Operations", "HR"],
    activityTemplates: [
      "Managing call logs and client details in Google Sheets",
      "Updating operational spreadsheet data",
      "Analyzing performance metrics and report data",
    ],
  },
  {
    appName: "Canva",
    domain: "canva.com",
    category: "PRODUCTIVE",
    purpose:
      "Graphic design, social media collateral, pitch decks, banners, and visual asset creation.",
    targetDepartments: ["Marketing", "Design", "Comms", "Sales"],
    activityTemplates: [
      "Designing marketing graphics & social media banners on Canva",
      "Editing presentation decks & visual collaterals",
    ],
  },
  {
    appName: "ChatGPT",
    domain: "chatgpt.com",
    category: "PRODUCTIVE",
    purpose:
      "AI research, copy drafting, code troubleshooting, email composition, and content generation.",
    targetDepartments: ["Development", "Marketing", "Comms", "HR", "QA"],
    activityTemplates: [
      "AI-assisted content research and communication drafting on ChatGPT",
      "Debugging code and technical prompt engineering",
    ],
  },
  {
    appName: "YouTube",
    domain: "youtube.com",
    category: "NEUTRAL",
    purpose:
      "Video streaming, technical tutorial watching, market research, or background media.",
    targetDepartments: ["Marketing", "Development", "Design"],
    activityTemplates: [
      "Watching technical tutorials and research videos on YouTube",
      "Reviewing competitor video content",
    ],
  },
  {
    appName: "GitHub",
    domain: "github.com",
    category: "PRODUCTIVE",
    purpose:
      "Source code version control, pull request review, repository management, and issue tracking.",
    targetDepartments: ["Development", "QA", "Tech"],
    activityTemplates: [
      "Reviewing pull requests and code commits on GitHub",
      "Managing repository issues and branch merges",
    ],
  },
  {
    appName: "Figma",
    domain: "figma.com",
    category: "PRODUCTIVE",
    purpose:
      "UI/UX interface design, wireframing, prototyping, and design system creation.",
    targetDepartments: ["Design", "Product", "Development"],
    activityTemplates: [
      "Designing UI/UX wireframes & component prototypes on Figma",
    ],
  },
  {
    appName: "Microsoft Teams",
    domain: "teams.microsoft.com",
    category: "PRODUCTIVE",
    purpose:
      "Internal team messaging, video conferencing, audio calls, and file sharing.",
    targetDepartments: ["All"],
    activityTemplates: [
      "Attending team sync / client call on Microsoft Teams",
      "Internal departmental messaging and file sharing",
    ],
  },
  {
    appName: "WhatsApp Web",
    domain: "web.whatsapp.com",
    category: "PRODUCTIVE",
    purpose:
      "Direct client communications, instant messaging, customer support, and quick vendor co-ordination.",
    targetDepartments: ["Comms", "Sales", "Support", "Operations"],
    activityTemplates: [
      "Co-ordinating client communications & follow-ups on WhatsApp",
    ],
  },
];

export const seedBaselineAppKnowledge = async () => {
  for (const seed of SEED_APP_KNOWLEDGE) {
    await AppKnowledge.updateOne(
      { appName: seed.appName },
      { $setOnInsert: { ...seed, classifiedBy: "SYSTEM" } },
      { upsert: true },
    );
  }
};

export const classifyOrGetAppKnowledge = async (input: {
  app?: string;
  domain?: string;
  title?: string;
  url?: string;
}) => {
  const appName = String(input.app || "").trim();
  const domain = String(input.domain || "").trim();
  const title = String(input.title || "").trim();
  const url = String(input.url || "").trim();

  // Try exact lookup by appName or domain
  let existing = null;
  if (appName) {
    existing = await AppKnowledge.findOne({
      appName: { $regex: new RegExp(`^${appName}$`, "i") },
    });
  }
  if (!existing && domain) {
    existing = await AppKnowledge.findOne({
      domain: { $regex: new RegExp(domain.replace(".", "\\."), "i") },
    });
  }

  if (existing) return existing;

  // Use AI classification for unrecognized app/domain
  const status = getClaudeStatus();
  let purpose = "Web browsing and operational activity";
  let category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL" = "PRODUCTIVE";
  let targetDepartments: string[] = [];

  if (status.configured && (appName || domain || title)) {
    try {
      const response = await requestClaudeJson({
        system:
          "You are an application purpose classifier for an enterprise workforce management system. Given an app name, domain, Chrome page title, or URL, determine its operational purpose, productivity classification, and target business departments. Return JSON only.",
        messages: [
          {
            role: "user",
            content: `Classify this app/domain/web page:
App Name: "${appName}"
Domain: "${domain}"
Page Title: "${title}"
URL: "${url}"

Return JSON format:
{
  "appName": "Canonical Name",
  "category": "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL",
  "purpose": "1-2 sentence description of what this app is used for",
  "targetDepartments": ["Comms", "Development", "Sales", "QA", "HR", "Marketing", "Finance"],
  "activityTemplates": ["sample activity 1", "sample activity 2"]
}`,
          },
        ],
        maxTokens: 500,
        temperature: 0.1,
      });

      const parsed = extractClaudeJsonObject(response.content) as any;
      if (parsed?.purpose) {
        purpose = String(parsed.purpose).trim();
      }
      if (
        ["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"].includes(parsed?.category)
      ) {
        category = parsed.category;
      }
      if (Array.isArray(parsed?.targetDepartments)) {
        targetDepartments = parsed.targetDepartments.map((d: any) =>
          String(d).trim(),
        );
      }

      const created = await AppKnowledge.create({
        appName: appName || domain || title || "Unknown App",
        domain,
        category,
        purpose,
        targetDepartments,
        activityTemplates: Array.isArray(parsed?.activityTemplates)
          ? parsed.activityTemplates.map((a: any) => String(a).trim())
          : [],
        commonUrls: url ? [url] : [],
        classifiedBy: "AI",
        lastClassifiedAt: new Date(),
      });

      return created;
    } catch (err) {
      console.error("Failed AI app classification:", err);
    }
  }

  // Fallback creation
  return await AppKnowledge.create({
    appName: appName || domain || title || "Unclassified App",
    domain,
    category,
    purpose,
    targetDepartments: [],
    classifiedBy: "SYSTEM",
  });
};

export const inferEmployeeActivityContext = async (
  input: ActivityInferenceInput,
): Promise<InferredActivityResult> => {
  await seedBaselineAppKnowledge();

  let employeeId = String(input.employeeId || "").trim();
  let user = null;
  let department = null;

  if (employeeId) {
    user = await User.findOne({ employeeId });
  }

  if (user?.departmentId) {
    department = await Department.findById(user.departmentId);
  }

  const appName = String(input.app || "").trim();
  const domain = String(input.domain || "").trim();
  const title = String(input.title || "").trim();
  const url = String(input.url || "").trim();

  const appInfo = await classifyOrGetAppKnowledge({
    app: appName,
    domain,
    title,
    url,
  });

  const deptName = department?.name || "General Workforce";
  const deptResponsibilities = department?.responsibilities || [];
  const deptTools = department?.primaryTools || [];
  const deptWorkflows = (department as any)?.appWorkflows || [];

  // Check if department has specific workflow matching this app
  const matchedWorkflow = deptWorkflows.find(
    (wf: any) =>
      wf.app.toLowerCase() === appName.toLowerCase() ||
      (domain && wf.app.toLowerCase().includes(domain.toLowerCase())),
  );

  let inferredActivity = "";
  if (matchedWorkflow?.description) {
    inferredActivity = `${deptName} Department - ${matchedWorkflow.description} (${appName || domain})`;
  } else if (
    deptResponsibilities.length > 0 &&
    (appName || domain || title)
  ) {
    inferredActivity = `${deptName} (${deptResponsibilities.slice(0, 2).join(", ")}) - Working on ${appName || domain || title}`;
  } else if (appInfo.activityTemplates && appInfo.activityTemplates.length > 0) {
    inferredActivity = `${deptName} - ${appInfo.activityTemplates[0]}`;
  } else {
    inferredActivity = `${deptName} - Active on ${appName || domain || title || "Web Activity"}`;
  }

  // Refine inference using page title or URL context
  if (title && !inferredActivity.includes(title)) {
    inferredActivity += ` ["${title}"]`;
  }

  return {
    app: appName || appInfo.appName,
    domain: domain || appInfo.domain,
    title,
    url,
    departmentName: deptName,
    departmentResponsibilities: deptResponsibilities,
    appPurpose: appInfo.purpose,
    appCategory: appInfo.category as any,
    inferredActivity,
    suggestedTaskCategory: matchedWorkflow ? matchedWorkflow.app : deptName,
    confidence: matchedWorkflow ? 0.95 : 0.8,
  };
};
