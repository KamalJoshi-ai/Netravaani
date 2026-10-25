import mongoose, { Schema, Document, Types } from "mongoose";

export const BedStatusEnum = ["AVAILABLE", "PENDING_APPROVAL", "OCCUPIED"] as const;
export type BedStatus = (typeof BedStatusEnum)[number];

export interface IBed extends Document {
  _id: Types.ObjectId;
  bedNumber: string;
  status: BedStatus;
  currentPatient?: Types.ObjectId | null;
  pendingPatient?: Types.ObjectId | null;
  assignedNurse?: string | Types.ObjectId | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BedSchema = new Schema<IBed>(
  {
    bedNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: BedStatusEnum,
      default: "AVAILABLE",
      required: true,
      index: true,
    },
    currentPatient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
    pendingPatient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
    assignedNurse: {
      type: Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Invariant: At most one confirmed patient occupying a bed
BedSchema.index(
  { currentPatient: 1 },
  {
    unique: true,
    partialFilterExpression: { currentPatient: { $exists: true, $ne: null } },
  }
);

export const Bed = mongoose.model<IBed>("Bed", BedSchema);
export default Bed;
