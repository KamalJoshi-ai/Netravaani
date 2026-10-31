import { Types } from "mongoose";
import {
  PatientCommunicationState,
  IPatientCommunicationState,
  CommunicationMode,
  HandshakeStatus,
} from "../models/PatientCommunicationState.js";
import { DeviceAssignment, IDeviceAssignment } from "../models/DeviceAssignment.js";
import { Device } from "../models/Device.js";
import { Patient } from "../models/Patient.js";
import { broadcastBedsideAudio } from "./careRequestService.js";

export class PatientCommunicationService {
  /**
   * Get or initialize the communication state for a specific assignment.
   * Every assignment gets its own independent handshake record.
   */
  async getOrCreateForAssignment(
    assignmentInput: IDeviceAssignment | Types.ObjectId | string
  ): Promise<IPatientCommunicationState | null> {
    const assignmentId =
      typeof assignmentInput === "object" && "_id" in assignmentInput
        ? assignmentInput._id
        : assignmentInput;

    if (!assignmentId) return null;

    let state = await PatientCommunicationState.findOne({ assignment: assignmentId });
    if (!state) {
      const assignment = await DeviceAssignment.findById(assignmentId);
      if (!assignment) return null;

      state = await PatientCommunicationState.create({
        assignment: assignment._id,
        patient: assignment.patient,
        device: assignment.device,
        communicationMode: "MANDATORY_HANDSHAKE",
        handshakeStatus: "PENDING",
      });
    }

    return state;
  }

  /**
   * Get the communication state for the currently active assignment of a device.
   */
  async getForActiveDevice(
    deviceIdOrHardware: string | Types.ObjectId
  ): Promise<IPatientCommunicationState | null> {
    let deviceDoc: any = null;
    if (Types.ObjectId.isValid(String(deviceIdOrHardware))) {
      deviceDoc = await Device.findById(deviceIdOrHardware);
    }
    if (!deviceDoc) {
      deviceDoc = await Device.findOne({
        $or: [{ deviceId: String(deviceIdOrHardware) }, { hardwareId: String(deviceIdOrHardware) }],
      });
    }
    if (!deviceDoc) return null;

    const assignment = await DeviceAssignment.findOne({
      device: deviceDoc._id,
      isActive: true,
    });
    if (!assignment) return null;

    return this.getOrCreateForAssignment(assignment);
  }

  /**
   * Get the communication state for the currently active assignment of a patient.
   */
  async getForActivePatient(
    patientCodeOrId: string | Types.ObjectId
  ): Promise<IPatientCommunicationState | null> {
    let patientDoc: any = null;
    if (Types.ObjectId.isValid(String(patientCodeOrId))) {
      patientDoc = await Patient.findById(patientCodeOrId);
    }
    if (!patientDoc) {
      patientDoc = await Patient.findOne({
        $or: [
          { patientCode: String(patientCodeOrId) },
          { patientCode: String(patientCodeOrId).toUpperCase() },
          { patientCode: String(patientCodeOrId).toLowerCase() },
        ],
      });
    }
    if (!patientDoc) return null;

    const assignment = await DeviceAssignment.findOne({
      patient: patientDoc._id,
      isActive: true,
    });
    if (!assignment) return null;

    return this.getOrCreateForAssignment(assignment);
  }

  /**
   * Atomically process incoming YES or NO gesture during handshake.
   */
  async processHandshakeGesture(
    assignmentId: Types.ObjectId | string,
    gesture: "YES" | "NO"
  ): Promise<{
    state: IPatientCommunicationState;
    transitionedToNormal: boolean;
    isRepeated: boolean;
  }> {
    const state = await this.getOrCreateForAssignment(assignmentId);
    if (!state) {
      throw new Error(`No communication state found for assignment ${assignmentId}`);
    }

    const now = new Date();
    let transitionedToNormal = false;
    let isRepeated = false;

    if (state.communicationMode === "NORMAL_COMMUNICATION" || state.handshakeStatus === "COMPLETED") {
      // Already completed; idempotent no-op for handshake
      return { state, transitionedToNormal: false, isRepeated: true };
    }

    if (gesture === "YES") {
      if (state.handshakeStatus === "PENDING") {
        state.handshakeStatus = "WAITING_FOR_NO";
        state.yesSentAt = now;
      } else if (state.handshakeStatus === "WAITING_FOR_YES") {
        // NO was already received, now YES completes it!
        state.handshakeStatus = "COMPLETED";
        state.communicationMode = "NORMAL_COMMUNICATION";
        state.yesSentAt = now;
        state.completedAt = now;
        transitionedToNormal = true;
      } else if (state.handshakeStatus === "WAITING_FOR_NO") {
        // Repeated YES
        isRepeated = true;
        state.yesSentAt = now;
      }
    } else if (gesture === "NO") {
      if (state.handshakeStatus === "PENDING") {
        state.handshakeStatus = "WAITING_FOR_YES";
        state.noSentAt = now;
      } else if (state.handshakeStatus === "WAITING_FOR_NO") {
        // YES was already received, now NO completes it!
        state.handshakeStatus = "COMPLETED";
        state.communicationMode = "NORMAL_COMMUNICATION";
        state.noSentAt = now;
        state.completedAt = now;
        transitionedToNormal = true;
      } else if (state.handshakeStatus === "WAITING_FOR_YES") {
        // Repeated NO
        isRepeated = true;
        state.noSentAt = now;
      }
    }

    await state.save();

    // Broadcast update to Bedside Audio and Nurse stations
    const populated = await DeviceAssignment.findById(assignmentId)
      .populate("device", "deviceId name")
      .populate("patient", "patientCode displayName bedLabel");

    const deviceObj = populated?.device as any;
    const patientObj = populated?.patient as any;

    let speechPrompt = "";
    if (transitionedToNormal) {
      speechPrompt = "Initial handshake complete. Normal communication mode is now active.";
    } else if (state.handshakeStatus === "WAITING_FOR_NO") {
      speechPrompt = isRepeated
        ? "YES acknowledged. Please squeeze both hands together for NO to complete initial handshake."
        : "YES received. Next, please squeeze both hands together for NO to complete handshake.";
    } else if (state.handshakeStatus === "WAITING_FOR_YES") {
      speechPrompt = isRepeated
        ? "NO acknowledged. Please blink 3 to 4 times for YES to complete initial handshake."
        : "NO received. Next, please blink 3 to 4 times for YES to complete handshake.";
    }

    broadcastBedsideAudio({
      type: "HANDSHAKE_UPDATED",
      deviceId: deviceObj?.deviceId,
      patientCode: patientObj?.patientCode,
      patientName: patientObj?.displayName,
      bedLabel: patientObj?.bedLabel,
      handshakeStatus: state.handshakeStatus,
      communicationMode: state.communicationMode,
      yesSentAt: state.yesSentAt ? state.yesSentAt.toISOString() : undefined,
      noSentAt: state.noSentAt ? state.noSentAt.toISOString() : undefined,
      completedAt: state.completedAt ? state.completedAt.toISOString() : undefined,
      speechPrompt,
      timestamp: new Date().toISOString(),
    });

    return { state, transitionedToNormal, isRepeated };
  }
}

export const patientCommunicationService = new PatientCommunicationService();

