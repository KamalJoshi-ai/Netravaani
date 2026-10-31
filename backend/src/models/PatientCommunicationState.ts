import mongoose, { Schema, Document, Types } from "mongoose";

export type CommunicationMode = "MANDATORY_HANDSHAKE" | "NORMAL_COMMUNICATION";
export type HandshakeStatus = "PENDING" | "WAITING_FOR_NO" | "WAITING_FOR_YES" | "COMPLETED";

export interface IPatientCommunicationState extends Document {
  patient: Types.ObjectId;
  device: Types.ObjectId;
  assignment: Types.ObjectId;
  communicationMode: CommunicationMode;
  handshakeStatus: HandshakeStatus;
  yesSentAt?: Date;
  noSentAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PatientCommunicationStateSchema = new Schema<IPatientCommunicationState>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    device: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true,
    },
    assignment: {
      type: Schema.Types.ObjectId,
      ref: "DeviceAssignment",
      required: true,
      index: true,
      unique: true,
    },
    communicationMode: {
      type: String,
      enum: ["MANDATORY_HANDSHAKE", "NORMAL_COMMUNICATION"],
      default: "MANDATORY_HANDSHAKE",
      required: true,
    },
    handshakeStatus: {
      type: String,
      enum: ["PENDING", "WAITING_FOR_NO", "WAITING_FOR_YES", "COMPLETED"],
      default: "PENDING",
      required: true,
    },
    yesSentAt: { type: Date },
    noSentAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const PatientCommunicationState = mongoose.model<IPatientCommunicationState>(
  "PatientCommunicationState",
  PatientCommunicationStateSchema
);

