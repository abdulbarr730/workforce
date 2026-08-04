import mongoose from "mongoose";

const todoItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    timeTaken: { type: String, default: "" },
    estimatedTime: { type: String, default: "" },
    isTopTask: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const checkinEntrySchema = new mongoose.Schema(
  {
    interval: { type: String, required: true }, // e.g. "10:30 - 12:30"
    completedTasks: { type: [String], default: [] },
    notes: { type: String, default: "" },
    timeSpent: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const dailyTodoSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    items: { type: [todoItemSchema], default: [] },
    checkins: { type: [checkinEntrySchema], default: [] },
    todoEditCount: { type: Number, default: 0 },
    isMissedTodo: { type: Boolean, default: false },
    todoHistory: {
      type: [
        {
          items: [todoItemSchema],
          reason: String,
          editedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

dailyTodoSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const DailyTodo = mongoose.model("DailyTodo", dailyTodoSchema);

