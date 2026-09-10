import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const assignedTaskCommentSchema = new mongoose.Schema(
  {
    byEmployeeId: { type: String, required: true },
    byName: { type: String, required: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const assignedTaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, default: () => randomUUID(), unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "ACCEPTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    source: {
      type: String,
      enum: ["ADMIN_DASHBOARD", "TEAMS", "MANUAL"],
      default: "ADMIN_DASHBOARD",
      index: true,
    },
    assignedByEmployeeId: { type: String, required: true, index: true },
    assignedByName: { type: String, required: true },
    assignedToEmployeeId: { type: String, required: true, index: true },
    assignedToName: { type: String, required: true },
    assignedToDepartmentName: { type: String, default: "" },
    scheduledFor: { type: String, required: true, index: true },
    deadlineAt: { type: Date, default: null, index: true },
    reminderAt: { type: Date, default: null },
    reminderFrequency: {
      type: String,
      enum: ["OFF", "DAILY", "EVERY_2_DAYS", "TWICE_WEEKLY", "WEEKLY"],
      default: "OFF",
    },
    estimatedTime: { type: String, default: "" },
    addToTodo: { type: Boolean, default: true },
    autoAddToEodOnComplete: { type: Boolean, default: true },
    todoDate: { type: String, default: "" },
    todoItemTaskId: { type: String, default: "" },
    eodAddedAt: { type: Date, default: null },
    teamsMessageId: { type: String, default: "" },
    teamsConversationId: { type: String, default: "" },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    actualTime: { type: String, default: "" },
    completionNote: { type: String, default: "" },
    comments: { type: [assignedTaskCommentSchema], default: [] },
  },
  { timestamps: true },
);

assignedTaskSchema.index({ assignedToEmployeeId: 1, status: 1, deadlineAt: 1 });
assignedTaskSchema.index({ assignedByEmployeeId: 1, createdAt: -1 });
assignedTaskSchema.index({ scheduledFor: 1, deadlineAt: 1 });

export const AssignedTask = mongoose.model(
  "AssignedTask",
  assignedTaskSchema,
);

