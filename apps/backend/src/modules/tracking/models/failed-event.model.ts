import mongoose, { Document, Schema } from 'mongoose';
import { DefaultTimestampProps } from '../../../shared/models/types';

export interface IFailedEvent extends Document, DefaultTimestampProps {
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
  }
);

// Index for efficient querying by dashboard
failedEventSchema.index({ createdAt: -1 });
failedEventSchema.index({ employeeId: 1 });
failedEventSchema.index({ deviceId: 1 });

export const FailedEvent = mongoose.models.FailedEvent || mongoose.model<IFailedEvent>('FailedEvent', failedEventSchema);
