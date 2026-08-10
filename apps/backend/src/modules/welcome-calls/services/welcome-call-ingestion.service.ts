import crypto from "crypto";
import mongoose from "mongoose";
import { AppError } from "../../../shared/utils/app-error";
import { WelcomeCallCampaign } from "../model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";
import { allocateWelcomeCallLeads } from "./welcome-call-allocation.service";

type RegistrationInput = Record<string, unknown>;

type IngestionInput = {
  campaignId?: string;
  campaignKey?: string;
  amount?: number;
  source?: string;
  registrations: RegistrationInput[];
  actorEmployeeId?: string;
};

const cleanPhone = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");

const safeDate = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const safeAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const readExternalId = (registration: RegistrationInput, source: string) => {
  const provided =
    registration.externalRegistrationId ||
    registration.registrationId ||
    registration.leadId ||
    registration.id;
  if (provided) return String(provided).trim();

  return crypto
    .createHash("sha256")
    .update(
      [
        source,
        cleanPhone(registration.phone || registration.mobile),
        String(registration.email || "")
          .trim()
          .toLowerCase(),
        String(registration.registeredAt || registration.createdAt || ""),
      ].join("|"),
    )
    .digest("hex");
};

async function resolveCampaign(input: IngestionInput) {
  if (input.campaignId) {
    if (!mongoose.isValidObjectId(input.campaignId)) {
      throw new AppError("Invalid campaign ID", 400);
    }
    return WelcomeCallCampaign.findById(input.campaignId);
  }
  if (input.campaignKey) {
    return WelcomeCallCampaign.findOne({
      key: input.campaignKey.trim().toLowerCase(),
      isActive: true,
    });
  }

  const amount = Number(
    input.amount ??
      input.registrations[0]?.amount ??
      input.registrations[0]?.paymentAmount,
  );
  if (!Number.isFinite(amount)) {
    throw new AppError(
      "campaignId, campaignKey, or registration amount is required",
      400,
    );
  }
  return WelcomeCallCampaign.findOne({
    registrationAmount: amount,
    isActive: true,
  }).sort({ updatedAt: -1 });
}

export async function ingestWelcomeCallRegistrations(input: IngestionInput) {
  if (!Array.isArray(input.registrations) || input.registrations.length === 0) {
    throw new AppError("At least one registration is required", 400);
  }
  if (input.registrations.length > 5000) {
    throw new AppError(
      "A maximum of 5,000 registrations can be imported at once",
      400,
    );
  }

  const campaign = await resolveCampaign(input);
  if (!campaign)
    throw new AppError("Matching welcome-call campaign not found", 404);

  const source = String(input.source || "crm").trim() || "crm";
  const uniqueRegistrations = new Map<string, RegistrationInput>();
  for (const registration of input.registrations) {
    const externalRegistrationId = readExternalId(registration, source);
    uniqueRegistrations.set(externalRegistrationId, registration);
  }

  const validRows: Array<{
    externalRegistrationId: string;
    registration: RegistrationInput;
    name: string;
    phone: string;
  }> = [];
  const rejected: Array<{ index: number; reason: string }> = [];
  let index = 0;
  uniqueRegistrations.forEach((registration, externalRegistrationId) => {
    const name = String(
      registration.registrantName ||
        registration.fullName ||
        registration.name ||
        "",
    ).trim();
    const phone = cleanPhone(registration.phone || registration.mobile);
    if (!name || !phone) {
      rejected.push({ index, reason: "Name and phone are required" });
    } else {
      validRows.push({ externalRegistrationId, registration, name, phone });
    }
    index += 1;
  });

  if (validRows.length === 0) {
    throw new AppError("No valid registrations were supplied", 400);
  }

  const result = await WelcomeCallLead.bulkWrite(
    validRows.map(({ externalRegistrationId, registration, name, phone }) => ({
      updateOne: {
        filter: { campaignId: campaign._id, externalRegistrationId },
        update: {
          $setOnInsert: {
            campaignId: campaign._id,
            externalRegistrationId,
            source,
            registrantName: name,
            phone,
            email: String(registration.email || "")
              .trim()
              .toLowerCase(),
            registeredAt: safeDate(
              registration.registeredAt || registration.createdAt,
            ),
            amount: safeAmount(
              registration.amount ?? registration.paymentAmount,
              campaign.registrationAmount,
            ),
            status: "UNASSIGNED",
            metadata: registration.metadata || {},
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const externalIds = validRows.map((row) => row.externalRegistrationId);
  const pendingLeads = await WelcomeCallLead.find({
    campaignId: campaign._id,
    externalRegistrationId: { $in: externalIds },
    status: "UNASSIGNED",
    assignedToEmployeeId: null,
  })
    .select("_id")
    .lean();
  const allocation = await allocateWelcomeCallLeads(campaign, {
    leadIds: pendingLeads.map((lead) => String(lead._id)),
    reason: "INITIAL_DISTRIBUTION",
    assignedByEmployeeId: input.actorEmployeeId || "CRM",
  });

  return {
    campaign: {
      id: String(campaign._id),
      key: campaign.key,
      name: campaign.name,
    },
    received: input.registrations.length,
    accepted: validRows.length,
    created: result.upsertedCount,
    duplicates: validRows.length - result.upsertedCount,
    rejected,
    allocation,
  };
}
