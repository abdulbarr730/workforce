import mongoose, { Document, Schema } from "mongoose";
export interface IFailedEvent extends Document {
  createdAt?: Date;
  updatedAt?: Date;
  rejectionReason: string;
  rawPayload: any;
  employeeId?: string;
  deviceId?: string;
  deviceTimestamp?: string;
}

const failedEventSchema = new Schema<IFailedEvent>(
  {
    rejectionReason: {
      type: String,
      required: true,
    },
    rawPayload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    employeeId: {
      type: String,
      required: false,
    },
    deviceId: {
      type: String,
      required: false,
    },
    deviceTimestamp: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying by dashboard
failedEventSchema.index({ createdAt: -1 });
failedEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
); // Auto-delete after 7 days
failedEventSchema.index({ employeeId: 1 });
failedEventSchema.index({ deviceId: 1 });

export const FailedEvent =
  mongoose.models.FailedEvent ||
  mongoose.model<IFailedEvent>("FailedEvent", failedEventSchema);
