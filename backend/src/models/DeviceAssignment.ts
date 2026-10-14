import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDeviceAssignment extends Document {
  device: Types.ObjectId;
  patient: Types.ObjectId;
  assignedAt: Date;
  unassignedAt?: Date;
  assignedBy?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceAssignmentSchema = new Schema<IDeviceAssignment>(
  {
    device: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    unassignedAt: {
      type: Date,
    },
    assignedBy: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Enforce invariant: A device can have at most ONE active assignment at any point in time
// Partial unique filter index ensures uniqueness only where isActive: true
DeviceAssignmentSchema.index(
  { device: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

// Enforce invariant: A patient can have at most ONE active device assignment at any point in time
DeviceAssignmentSchema.index(
  { patient: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

// Index for query history
DeviceAssignmentSchema.index({ device: 1, assignedAt: -1 });
DeviceAssignmentSchema.index({ patient: 1, assignedAt: -1 });

export const DeviceAssignment = mongoose.model<IDeviceAssignment>(
  "DeviceAssignment",
  DeviceAssignmentSchema
);
