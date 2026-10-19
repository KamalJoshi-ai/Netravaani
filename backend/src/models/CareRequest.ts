import mongoose, { Schema, Document, Types } from "mongoose";
import { RequestActionEnum, RequestAction } from "./DeviceConfig.js";

export const CareRequestStatusEnum = [
  "NEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
] as const;
export type CareRequestStatus = (typeof CareRequestStatusEnum)[number];

export interface ICareRequest extends Document {
  eventId: string;
  device: Types.ObjectId;
  patient: Types.ObjectId;
  gestureId: string;
  gesture?: string;
  urgent?: boolean;
  alarm?: boolean;
  ruleId?: string; // command rule that fired (firmware nv-4.0.0+)
  label?: string; // device label of that rule at the time of the request
  counts?: { eog: number; emgLeft: number; emgRight: number; together: number };
  action: RequestAction;
  configVersion: number;
  status: CareRequestStatus;
  acknowledgedAt?: Date;
  inProgressAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CareRequestSchema = new Schema<ICareRequest>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    device: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true,
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: false,
      index: true,
    },
    gestureId: {
      type: String,
      required: true,
      trim: true,
    },
    gesture: {
      type: String,
      trim: true,
    },
    urgent: {
      type: Boolean,
      default: false,
    },
    alarm: {
      type: Boolean,
      default: false,
    },
    ruleId: {
      type: String,
      trim: true,
    },
    label: {
      type: String,
    },
    counts: {
      type: Schema.Types.Mixed,
    },
    action: {
      type: String,
      enum: RequestActionEnum,
      required: true,
      trim: true,
    },
    configVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: CareRequestStatusEnum,
      default: "NEW",
      required: true,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
    },
    inProgressAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

CareRequestSchema.index({ device: 1, createdAt: -1 });
CareRequestSchema.index({ patient: 1, createdAt: -1 });
CareRequestSchema.index({ status: 1, createdAt: -1 });

export const CareRequest = mongoose.model<ICareRequest>(
  "CareRequest",
  CareRequestSchema
);
