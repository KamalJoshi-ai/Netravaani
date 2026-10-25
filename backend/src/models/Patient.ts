import mongoose, { Schema, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

export const PatientStatusEnum = ["ACTIVE", "INACTIVE", "PENDING_BED_APPROVAL"] as const;
export type PatientStatus = (typeof PatientStatusEnum)[number];

export const PatientBedStatusEnum = ["NONE", "PENDING_APPROVAL", "OCCUPIED"] as const;
export type PatientBedStatus = (typeof PatientBedStatusEnum)[number];

export const NurseAssignmentStatusEnum = [
  "NONE",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type NurseAssignmentStatus = (typeof NurseAssignmentStatusEnum)[number];

export interface INurseAssignment {
  nurseId?: string | Types.ObjectId;
  nurseName?: string;
  nurseRole?: string;
  requestedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  status: NurseAssignmentStatus;
}

export interface IPatient extends Document {
  patientCode: string;
  displayName: string;
  email?: string;
  userId?: string | Types.ObjectId;
  bedLabel?: string;
  pendingBedLabel?: string;
  bedStatus: PatientBedStatus;
  bedAssignedBy?: string;
  bedProposedAt?: Date;
  bedApprovedAt?: Date;
  bedRejectedAt?: Date;
  status: PatientStatus;
  password?: string;
  nurseAssignment: INurseAssignment;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const NurseAssignmentSchema = new Schema<INurseAssignment>(
  {
    nurseId: {
      type: Schema.Types.Mixed,
    },
    nurseName: {
      type: String,
      trim: true,
    },
    nurseRole: {
      type: String,
      default: "nurse",
    },
    requestedAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: NurseAssignmentStatusEnum,
      default: "NONE",
      required: true,
    },
  },
  { _id: false }
);

const PatientSchema = new Schema<IPatient>(
  {
    patientCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },
    userId: {
      type: Schema.Types.Mixed,
    },
    bedLabel: {
      type: String,
      trim: true,
      uppercase: true,
    },
    pendingBedLabel: {
      type: String,
      trim: true,
      uppercase: true,
    },
    bedStatus: {
      type: String,
      enum: PatientBedStatusEnum,
      default: "NONE",
      required: true,
      index: true,
    },
    bedAssignedBy: {
      type: String,
      trim: true,
    },
    bedProposedAt: {
      type: Date,
    },
    bedApprovedAt: {
      type: Date,
    },
    bedRejectedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: PatientStatusEnum,
      default: "ACTIVE",
      required: true,
      index: true,
    },
    password: {
      type: String,
      select: false,
    },
    nurseAssignment: {
      type: NurseAssignmentSchema,
      default: () => ({ status: "NONE" }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Hash password prior to saving
PatientSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

PatientSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  const hash = this.password;
  if (!hash) {
    // If no explicit password set, default PIN 'patient123' or patientCode is accepted
    return (
      candidatePassword.trim() === "patient123" ||
      candidatePassword.trim().toUpperCase() === this.patientCode.toUpperCase()
    );
  }
  const match = await bcrypt.compare(candidatePassword, hash);
  if (match) return true;
  if (candidatePassword.trim() !== candidatePassword) {
    return bcrypt.compare(candidatePassword.trim(), hash);
  }
  return false;
};

PatientSchema.index({ status: 1, createdAt: -1 });

// Prevent two patients from holding the same confirmed bed simultaneously
PatientSchema.index(
  { bedLabel: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bedLabel: { $exists: true, $type: "string", $gt: "" },
      status: "ACTIVE",
    },
  }
);

export const Patient = mongoose.model<IPatient>("Patient", PatientSchema);
export default Patient;
