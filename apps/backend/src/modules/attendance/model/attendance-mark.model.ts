import mongoose from "mongoose";

/**
 * "Mark Attendance" settings (one document). Off by default: until an admin
 * turns it on, attendance works exactly as before (from agent activity).
 */
const attendanceMarkSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    // Present / Late / Half day only after the employee clicks Mark Attendance.
    markRequired: { type: Boolean, default: false },
    // The login counts only at an assigned work location.
    locationRequired: { type: Boolean, default: false },
    // First business day the rules apply (earlier days are never changed).
    requiredFrom: { type: String, default: null }, // YYYY-MM-DD
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const AttendanceMarkSettings = mongoose.model(
  "AttendanceMarkSettings",
  attendanceMarkSettingsSchema,
);

/** A place attendance can be marked from (switched off, never deleted). */
const workLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Map point + radius (GPS / Windows location). Optional.
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    radiusMeters: { type: Number, default: 200 },
    // Office Wi-Fi names and office internet addresses also prove presence.
    wifiNames: { type: [String], default: [] },
    publicIps: { type: [String], default: [] },
    appliesTo: { type: String, enum: ["ALL", "EMPLOYEES"], default: "ALL" },
    employeeIds: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    createdByName: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const WorkLocation = mongoose.model("WorkLocation", workLocationSchema);

const locationCheckSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracyMeters: { type: Number, default: null },
    wifiName: { type: String, default: null },
    publicIp: { type: String, default: null },
    matched: { type: Boolean, default: false },
    locationName: { type: String, default: null },
    method: { type: String, default: null }, // GPS | WIFI | IP
    distanceMeters: { type: Number, default: null },
  },
  { _id: false },
);

/** One employee's Mark Attendance for one day. */
const attendanceMarkSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, default: null },
    date: { type: String, required: true }, // YYYY-MM-DD business date
    // When the laptop was first opened / used that day (from the agent).
    laptopOpenAt: { type: Date, default: null },
    // When the employee clicked Mark Attendance.
    markedAt: { type: Date, default: null },
    // When they were first seen at a work location.
    locationReachedAt: { type: Date, default: null },
    // The login time attendance uses.
    loginTime: { type: Date, default: null },
    status: {
      type: String,
      // WAITING_LOCATION: not at a work location yet.
      // PENDING_APPROVAL: working from elsewhere, reason given, admin to decide.
      // REJECTED: admin said no to working from elsewhere.
      enum: ["WAITING_LOCATION", "PENDING_APPROVAL", "REJECTED", "MARKED"],
      default: "WAITING_LOCATION",
    },
    locationName: { type: String, default: null },
    method: { type: String, default: null }, // GPS | WIFI | IP | NONE | REMOTE
    // Working from somewhere else: the employee's reason and the admin's decision.
    remoteReason: { type: String, default: null },
    remoteRequestedAt: { type: Date, default: null },
    remoteDecision: { type: String, default: null }, // APPROVED | REJECTED
    remoteDecidedByName: { type: String, default: null },
    remoteDecidedAt: { type: Date, default: null },
    remoteDecisionNote: { type: String, default: null },
    checks: { type: [locationCheckSchema], default: [] },
  },
  { timestamps: true },
);
attendanceMarkSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceMarkSchema.index({ date: 1 });

export const AttendanceMark = mongoose.model("AttendanceMark", attendanceMarkSchema);
