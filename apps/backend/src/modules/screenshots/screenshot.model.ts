import mongoose from "mongoose";

const screenshotSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    capturedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Screenshot = mongoose.model("Screenshot", screenshotSchema);
