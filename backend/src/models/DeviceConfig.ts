import mongoose, { Schema, Document, Types } from "mongoose";

export const ConfigStatusEnum = ["PENDING", "APPLIED", "FAILED"] as const;
export type ConfigStatus = (typeof ConfigStatusEnum)[number];

export const RequestActionEnum = [
  "NEED_WATER",
  "NEED_ASSISTANCE",
  "PAIN_DISCOMFORT",
  "REPOSITION",
  "EMERGENCY",
  "YES",
  "NO",
  "CALL_NURSE",
  "PAIN",
  "WATER",
  "I_WANT_TO_REST",
  "CANT_BREATHE_NEED_SUCTION",
  "REQUEST_HELP",
  "REQUEST_WATER",
] as const;
export type RequestAction = (typeof RequestActionEnum)[number];

export interface IGestureMapping {
  gestureId: string;       // e.g. "BLINK_SINGLE", "BLINK_DOUBLE", "GAZE_LEFT"
  gestureName: string;     // e.g. "Single Blink", "Double Blink", "Gaze Left"
  action: RequestAction;   // e.g. "NEED_WATER", "NEED_ASSISTANCE"
  instruction?: string;    // e.g. "Blink once deliberately to request water"
}

export interface IDeviceConfig extends Document {
  device: Types.ObjectId;
  version: number;
  mappings: IGestureMapping[];
  status: ConfigStatus;
  appliedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GestureMappingSchema = new Schema<IGestureMapping>(
  {
    gestureId: {
      type: String,
      required: true,
      trim: true,
    },
    gestureName: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      enum: RequestActionEnum,
      required: true,
      trim: true,
    },
    instruction: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const DeviceConfigSchema = new Schema<IDeviceConfig>(
  {
    device: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    mappings: {
      type: [GestureMappingSchema],
      default: [],
      required: true,
    },
    status: {
      type: String,
      enum: ConfigStatusEnum,
      default: "PENDING",
      required: true,
    },
    appliedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Composite unique index ensures each device configuration version is unique and immutable
DeviceConfigSchema.index({ device: 1, version: 1 }, { unique: true });
DeviceConfigSchema.index({ device: 1, createdAt: -1 });

export const DeviceConfig = mongoose.model<IDeviceConfig>("DeviceConfig", DeviceConfigSchema);
