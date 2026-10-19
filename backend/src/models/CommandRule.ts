import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * The editable command rules currently set for a device. Every save also writes
 * an immutable DeviceConfig version, which is what the device downloads.
 */
export interface ICommandRule extends Document {
  device: Types.ObjectId;
  ruleKey: string; // sent to the device as "id": ^[a-z0-9_-]{1,24}$, unique per device
  label: string; // sent to the device: 1-40 printable ASCII characters
  displayLabel?: string; // dashboard-only, any language or emoji, never sent to the device
  eogMin: number;
  eogMax: number;
  leftMin: number;
  leftMax: number;
  rightMin: number;
  rightMax: number;
  simultaneous: boolean;
  urgent: boolean;
  alarm: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const count = { type: Number, required: true, min: 0, max: 20 };

const CommandRuleSchema = new Schema<ICommandRule>(
  {
    device: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
    ruleKey: { type: String, required: true, trim: true },
    label: { type: String, required: true },
    displayLabel: { type: String, trim: true },
    eogMin: count,
    eogMax: count,
    leftMin: count,
    leftMax: count,
    rightMin: count,
    rightMax: count,
    simultaneous: { type: Boolean, default: false },
    urgent: { type: Boolean, default: false },
    alarm: { type: Boolean, default: false },
    sortOrder: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false }
);

CommandRuleSchema.index({ device: 1, ruleKey: 1 }, { unique: true });
CommandRuleSchema.index({ device: 1, sortOrder: 1 });

export const CommandRule = mongoose.model<ICommandRule>("CommandRule", CommandRuleSchema);
