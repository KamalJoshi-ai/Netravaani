import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDeviceCommand extends Document {
  device: Types.ObjectId;
  deviceId: string;
  gestureId: string; // "c01".."c07"
  label: string; // sent to the device: 1-40 printable ASCII
  displayLabel?: string; // dashboard-only
  speechTemplate?: string; // spoken phrase
  urgent: boolean;
  alarm: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceCommandSchema = new Schema<IDeviceCommand>(
  {
    device: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    gestureId: {
      type: String,
      required: true,
      enum: ["c01", "c02", "c03", "c04", "c05", "c06", "c07"],
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    displayLabel: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    speechTemplate: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    urgent: {
      type: Boolean,
      default: false,
    },
    alarm: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

DeviceCommandSchema.index({ device: 1, gestureId: 1 }, { unique: true });
DeviceCommandSchema.index({ deviceId: 1, gestureId: 1 }, { unique: true });

export const DeviceCommand = mongoose.model<IDeviceCommand>("DeviceCommand", DeviceCommandSchema);

