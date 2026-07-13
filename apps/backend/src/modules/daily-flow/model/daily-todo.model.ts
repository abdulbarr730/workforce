import mongoose from "mongoose";

const todoItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const dailyTodoSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    items: { type: [todoItemSchema], default: [] },
  },
  { timestamps: true },
);

dailyTodoSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const DailyTodo = mongoose.model("DailyTodo", dailyTodoSchema);
