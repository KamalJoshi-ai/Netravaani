import mongoose, { Schema, Document } from "mongoose";

export const DeviceStatusEnum = ["AVAILABLE", "ASSIGNED", "OFFLINE", "DISABLED"] as const;
export type DeviceStatus = (typeof DeviceStatusEnum)[number];

export const DeviceConnectivityStatusEnum = ["NEVER_SEEN", "ONLINE", "OFFLINE"] as const;
export type DeviceConnectivityStatus = (typeof DeviceConnectivityStatusEnum)[number];

export interface IDevice extends Document {
  deviceId: string;
  hardwareId?: string;
  hardwareIdVerified: boolean;
  name: string;
  token?: string;
  status: DeviceStatus;
  connectivityStatus: DeviceConnectivityStatus;
  firmwareVersion?: string;
  lastSeenAt?: Date;
  desiredConfigVersion?: number;
  appliedConfigVersion?: number;
  isDevRegistration: boolean;
  registrationSource?: "DEV_MANUAL" | "ESP32_WIFI";
  silenceAlarmPending?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    hardwareId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    token: {
      type: String,
      trim: true,
    },
    hardwareIdVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: DeviceStatusEnum,
      default: "AVAILABLE",
      required: true,
      index: true,
    },
    connectivityStatus: {
      type: String,
      enum: DeviceConnectivityStatusEnum,
      default: "NEVER_SEEN",
      required: true,
      index: true,
    },
    firmwareVersion: {
      type: String,
      trim: true,
    },
    lastSeenAt: {
      type: Date,
      index: true,
    },
    desiredConfigVersion: {
      type: Number,
      min: 1,
    },
    appliedConfigVersion: {
      type: Number,
      min: 1,
    },
    isDevRegistration: {
      type: Boolean,
      default: false,
    },
    registrationSource: {
      type: String,
      enum: ["DEV_MANUAL", "ESP32_WIFI"],
      default: "DEV_MANUAL",
    },
    silenceAlarmPending: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
DeviceSchema.index({ status: 1, createdAt: -1 });
DeviceSchema.index({ connectivityStatus: 1, lastSeenAt: -1 });

export const Device = mongoose.model<IDevice>("Device", DeviceSchema);
