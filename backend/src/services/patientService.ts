import mongoose from "mongoose";
import { customAlphabet } from "nanoid";
import jwt from "jsonwebtoken";
import { Patient, IPatient, PatientStatus } from "../models/Patient.js";
import { Bed } from "../models/Bed.js";
import User from "../models/User.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { CareRequest } from "../models/CareRequest.js";
import { PatientCommunicationState } from "../models/PatientCommunicationState.js";
import { broadcastBedsideAudio, MAX_ACTIVE_REQUESTS_PER_PATIENT } from "./careRequestService.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";

const generatePatientId = customAlphabet("0123456789", 6);

export interface CreatePatientDto {
  displayName: string;
  bedLabel?: string;
  status?: PatientStatus;
  password?: string;
  deviceId?: string;
}

export const PREDEFINED_COMMANDS = [
  {
    action: "BLINK_RIGHT",
    gestureId: "BLINK_RIGHT",
    gestureName: "Blink 2-4 times, squeeze right hand once",
    serialCommand: "[cmd] BLINK + RIGHT SQUEEZE",
    dashboardLabel: "BLINK + RIGHT SQUEEZE",
    instruction: "Blink 2 to 4 times, then squeeze right hand once.",
    badgeColor: "bg-[#E8E2D7] text-[#30251F] border-[#D6C7B7]",
    isEmergency: false,
  },
  {
    action: "BLINK_BOTH",
    gestureId: "BLINK_BOTH",
    gestureName: "Blink 2-4 times, squeeze both hands once",
    serialCommand: "[cmd] BLINK + BOTH SQUEEZE",
    dashboardLabel: "BLINK + BOTH SQUEEZE",
    instruction: "Blink 2 to 4 times, then squeeze both hands together once.",
    badgeColor: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7]",
    isEmergency: false,
  },
  {
    action: "YES",
    gestureId: "RIGHT_2",
    gestureName: "Squeeze right hand twice",
    serialCommand: "[cmd] 2 RIGHT SQUEEZES",
    dashboardLabel: "2 RIGHT SQUEEZES (YES)",
    instruction: "Squeeze right hand twice to indicate affirmative / yes.",
    badgeColor: "bg-[#EAF3EF] text-[#287A59] border-[#BEDECE]",
    isEmergency: false,
  },
  {
    action: "NO",
    gestureId: "LEFT_2",
    gestureName: "Squeeze left hand twice",
    serialCommand: "[cmd] 2 LEFT SQUEEZES",
    dashboardLabel: "2 LEFT SQUEEZES (NO)",
    instruction: "Squeeze left hand twice to indicate negative / no.",
    badgeColor: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C]",
    isEmergency: false,
  },
  {
    action: "BOTH_2",
    gestureId: "BOTH_2",
    gestureName: "Squeeze both hands at the same time twice",
    serialCommand: "[cmd] 2 BOTH SQUEEZES",
    dashboardLabel: "2 BOTH SQUEEZES",
    instruction: "Squeeze both hands at the same time twice.",
    badgeColor: "bg-[#E5DFD7] text-[#30251F] border-[#CEBEB0]",
    isEmergency: false,
  },
  {
    action: "EMERGENCY",
    gestureId: "BOTH_4",
    gestureName: "Squeeze both hands together 4 times",
    serialCommand: "[cmd] EMERGENCY / SEVERE PAIN",
    dashboardLabel: "EMERGENCY, LEDs 1–4 flash red",
    instruction: "Squeeze both hands at the same time 4 times (The onboard RGB LEDs will flash red and raise alarm!).",
    badgeColor: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29]",
    isEmergency: true,
  },
  {
    action: "BLINK_LEFT",
    gestureId: "BLINK_LEFT",
    gestureName: "Blink 2-4 times, squeeze left hand once",
    serialCommand: "[cmd] BLINK + LEFT SQUEEZE",
    dashboardLabel: "BLINK + LEFT SQUEEZE",
    instruction: "Blink 2 to 4 times, then squeeze left hand once.",
    badgeColor: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7]",
    isEmergency: false,
  },
];

export class PatientService {
  async createPatient(data: CreatePatientDto): Promise<IPatient> {
    const patientCode = `PT-${generatePatientId()}`;
    const normBed = data.bedLabel ? data.bedLabel.trim().toUpperCase() : undefined;
    const patientStatus = data.status || "ACTIVE";
    const bedStatus = normBed && patientStatus === "ACTIVE" ? "OCCUPIED" : (normBed ? "PENDING_APPROVAL" : "NONE");

    const patient = await Patient.create({
      patientCode,
      displayName: data.displayName,
      bedLabel: normBed,
      bedStatus,
      status: patientStatus,
      password: data.password || "patient123",
      nurseAssignment: {
        status: "NONE",
      },
    });

    if (normBed && bedStatus === "OCCUPIED") {
      await Bed.updateOne(
        { bedNumber: normBed },
        { $set: { status: "OCCUPIED", currentPatient: patient._id } },
        { upsert: true }
      );
    }

    if (data.deviceId) {
      try {
        const { assignmentService } = await import("./assignmentService.js");
        await assignmentService.assignDevice({
          deviceId: data.deviceId,
          patientCode,
          assignedBy: "Clinical Intake",
        });
      } catch (assignErr) {
        // Log or silently ignore if device assignment fails during initial registration
      }
    }

    return patient;
  }

  async listPatients(page = 1, limit = 20, status?: PatientStatus) {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Patient.countDocuments(filter),
    ]);

    // Enhance each patient with active device assignment if present
    const patientIds = patients.map((p) => p._id);
    const activeAssignments = await DeviceAssignment.find({
      patient: { $in: patientIds },
      isActive: true,
    })
      .populate("device", "deviceId name status firmwareVersion connectivityStatus")
      .lean();

    const assignmentIds = activeAssignments.map((a) => a._id);
    const commStates = await PatientCommunicationState.find({
      assignment: { $in: assignmentIds },
    }).lean();
    const commStateMap = new Map();
    commStates.forEach((cs) => {
      commStateMap.set(cs.assignment.toString(), cs);
    });

    const assignmentMap = new Map();
    activeAssignments.forEach((assign) => {
      assignmentMap.set(assign.patient.toString(), assign);
    });

    const items = patients.map((p) => {
      const currentAssignment = assignmentMap.get(p._id.toString()) || null;
      const communicationState = currentAssignment ? commStateMap.get(currentAssignment._id.toString()) || null : null;
      return {
        ...p,
        currentAssignment,
        communicationState,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPatientByCode(patientCode: string) {
    const trimmed = (patientCode || "").trim();
    let patient = await Patient.findOne({
      $or: [
        { patientCode: trimmed },
        { patientCode: trimmed.toUpperCase() },
        { email: trimmed.toLowerCase() },
        { displayName: new RegExp(`^${trimmed}$`, "i") },
      ],
    }).lean();

    if (!patient) {
      const user = await User.findOne({
        $or: [
          { email: trimmed.toLowerCase() },
          { username: trimmed.toLowerCase() },
          { name: new RegExp(`^${trimmed}$`, "i") },
        ],
      });
      if (user) {
        patient = await Patient.findOne({
          $or: [
            ...(user.patientCode ? [{ patientCode: user.patientCode }] : []),
            { email: user.email },
            { userId: user._id },
            { displayName: user.name },
          ],
        }).lean();
      }
    }

    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    const currentAssignment = await DeviceAssignment.findOne({
      patient: patient._id,
      isActive: true,
    })
      .populate("device", "deviceId name status firmwareVersion connectivityStatus hardwareId")
      .lean();

    const communicationState = currentAssignment
      ? await PatientCommunicationState.findOne({ assignment: currentAssignment._id }).lean()
      : null;

    return {
      ...patient,
      currentAssignment: currentAssignment || null,
      communicationState: communicationState || null,
      commands: PREDEFINED_COMMANDS,
    };
  }

  // Patient Authentication
  async patientLogin(patientCode: string, passwordCandidate: string) {
    const trimmedCode = (patientCode || "").trim();
    let patient: any = await Patient.findOne({
      $or: [
        { patientCode: trimmedCode },
        { patientCode: trimmedCode.toUpperCase() },
        { email: trimmedCode.toLowerCase() },
        { displayName: new RegExp(`^${trimmedCode}$`, "i") },
      ],
    }).select("+password");

    let userMatched = false;
    if (!patient) {
      const user = await User.findOne({
        $or: [
          { email: trimmedCode.toLowerCase() },
          { username: trimmedCode.toLowerCase() },
          { patientCode: trimmedCode.toUpperCase() },
        ],
      }).select("+password +passwordHash");

      if (user) {
        const isUserPassCorrect =
          (await user.comparePassword(passwordCandidate)) ||
          (passwordCandidate.trim() !== passwordCandidate && (await user.comparePassword(passwordCandidate.trim())));
        if (isUserPassCorrect) {
          userMatched = true;
          patient = await Patient.findOne({
            $or: [
              ...(user.patientCode ? [{ patientCode: user.patientCode }] : []),
              { email: user.email },
              { userId: user._id },
              { displayName: user.name },
            ],
          }).select("+password");

          if (!patient) {
            const cleanCode = (user.patientCode || `PT-${Math.floor(100000 + Math.random() * 900000)}`).toUpperCase();
            patient = await Patient.create({
              patientCode: cleanCode,
              displayName: user.name,
              email: user.email,
              userId: user._id,
              status: "ACTIVE",
              password: passwordCandidate,
              nurseAssignment: { status: "NONE" },
            });
            user.patientCode = cleanCode;
            await user.save();
          }
        }
      }
    }

    if (!patient) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid Patient ID or Password");
    }

    if (!userMatched) {
      const isMatch = await patient.comparePassword(passwordCandidate);
      if (!isMatch) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid Patient ID or Password");
      }
    }

    // Generate lightweight JWT token for bedside patient terminal
    const token = jwt.sign(
      {
        patientId: (patient as any)._id.toString(),
        patientCode: patient.patientCode,
        displayName: patient.displayName,
        role: "patient",
      },
      process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const details = await this.getPatientByCode(patient.patientCode);

    return {
      token,
      patient: details,
    };
  }

  // Helper for resilient patient document lookup (case-insensitive & trimmed)
  async findPatientDoc(patientCode: string): Promise<IPatient> {
    const trimmed = (patientCode || "").trim();
    const patient = await Patient.findOne({
      $or: [
        { patientCode: trimmed },
        { patientCode: trimmed.toUpperCase() },
        { patientCode: trimmed.toLowerCase() },
        ...(mongoose.isValidObjectId(trimmed) ? [{ _id: trimmed }] : []),
      ],
    });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }
    return patient;
  }

  // Nurse Requests Assignment to Patient (with optional entered Bed Number)
  async requestNurseAssignment(
    patientCode: string,
    nurseData: { nurseId?: string; nurseName: string; nurseRole?: string; bedNumber?: string; bedLabel?: string }
  ) {
    const patient = await this.findPatientDoc(patientCode);

    const proposedBed = (nurseData.bedNumber || nurseData.bedLabel || "").trim().toUpperCase();

    patient.nurseAssignment = {
      nurseId: (nurseData.nurseId as any) || undefined,
      nurseName: nurseData.nurseName,
      nurseRole: nurseData.nurseRole || "nurse",
      requestedAt: new Date(),
      status: "PENDING",
    };

    if (proposedBed) {
      // Ensure the bed exists and claim as pending approval if available
      let bed = await Bed.findOne({ bedNumber: proposedBed });
      if (!bed) {
        bed = await Bed.create({ bedNumber: proposedBed, status: "AVAILABLE" });
      }
      if (bed.status === "OCCUPIED" && String(bed.currentPatient) !== String(patient._id)) {
        throw new AppError(409, "BED_OCCUPIED", `Bed '${proposedBed}' is already occupied by another patient.`);
      }

      await Bed.updateOne(
        { bedNumber: proposedBed },
        {
          $set: {
            status: "PENDING_APPROVAL",
            pendingPatient: patient._id,
            assignedNurse: nurseData.nurseName,
          },
        }
      );

      patient.pendingBedLabel = proposedBed;
      patient.bedStatus = "PENDING_APPROVAL";
      patient.bedAssignedBy = nurseData.nurseName;
      patient.bedProposedAt = new Date();
    }

    await patient.save();
    return this.getPatientByCode(patientCode);
  }

  // Patient Approves Nurse Request (with optional Bed Number confirmation)
  // STRICT RULE: ONLY PATIENT CAN APPROVE THE SEND CARE REQUEST LINK
  async approveNurseAssignment(patientCode: string, bedLabel?: string, approvingUserIdentifier?: string) {
    const patient = await this.findPatientDoc(patientCode);

    // Security check: ONLY patient can approve the send care request link
    if (approvingUserIdentifier) {
      const normIdent = approvingUserIdentifier.trim().toLowerCase();
      const ptCodeNorm = patient.patientCode.toLowerCase();
      const ptEmailNorm = (patient.email || "").toLowerCase();
      const ptUserIdNorm = (patient.userId ? String(patient.userId) : "").toLowerCase();

      const isMatch =
        normIdent === ptCodeNorm ||
        (ptEmailNorm && normIdent === ptEmailNorm) ||
        (ptUserIdNorm && normIdent === ptUserIdNorm);

      if (!isMatch) {
        throw new AppError(403, "FORBIDDEN", "Only the patient can approve the send care request link.");
      }
    }

    if (!patient.nurseAssignment || patient.nurseAssignment.status !== "PENDING") {
      throw new AppError(
        400,
        "NO_PENDING_REQUEST",
        "There is no pending nurse care request to approve for this patient."
      );
    }

    patient.nurseAssignment.status = "APPROVED";
    patient.nurseAssignment.approvedAt = new Date();

    const bedToConfirm = (bedLabel || patient.pendingBedLabel || "").trim().toUpperCase();
    if (bedToConfirm) {
      let bed = await Bed.findOne({ bedNumber: bedToConfirm });
      if (!bed) {
        bed = await Bed.create({ bedNumber: bedToConfirm, status: "AVAILABLE" });
      }

      // If patient was in an old bed, release it
      const oldBedNum = patient.bedLabel;
      if (oldBedNum && oldBedNum !== bedToConfirm) {
        await Bed.updateOne(
          { bedNumber: oldBedNum, currentPatient: patient._id },
          { $set: { status: "AVAILABLE", currentPatient: null } }
        );
      }

      // Mark confirmed bed as OCCUPIED
      await Bed.updateOne(
        { bedNumber: bedToConfirm },
        {
          $set: {
            status: "OCCUPIED",
            currentPatient: patient._id,
            pendingPatient: null,
            assignedNurse: patient.nurseAssignment.nurseName,
          },
        }
      );

      patient.bedLabel = bedToConfirm;
      patient.pendingBedLabel = undefined;
      patient.bedStatus = "OCCUPIED";
      patient.status = "ACTIVE";
      patient.bedApprovedAt = new Date();
    }

    await patient.save();
    return this.getPatientByCode(patientCode);
  }

  // Nurse Initiates Allocation - Requires Patient Approval
  async allocateNurse(
    patientCode: string,
    nurseData: { nurseId?: string; nurseName: string; nurseRole?: string; bedLabel?: string; bedNumber?: string }
  ) {
    // Direct approval without patient consent is disallowed: dispatch as pending request for patient bedside approval
    return this.requestNurseAssignment(patientCode, {
      nurseId: nurseData.nurseId,
      nurseName: nurseData.nurseName,
      nurseRole: nurseData.nurseRole,
      bedNumber: nurseData.bedNumber || nurseData.bedLabel,
    });
  }

  // Nurse Deallocates Patient by Herself
  async deallocateNurse(patientCode: string) {
    const patient = await this.findPatientDoc(patientCode);

    // If there is an unapproved pending bed proposal tied to this nurse link, release it
    if (patient.pendingBedLabel) {
      await Bed.updateOne(
        { bedNumber: patient.pendingBedLabel, pendingPatient: patient._id },
        { $set: { status: "AVAILABLE", pendingPatient: null, assignedNurse: null } }
      );
      patient.pendingBedLabel = undefined;
      if (patient.bedStatus === "PENDING_APPROVAL") {
        patient.bedStatus = patient.bedLabel ? "OCCUPIED" : "NONE";
      }
    }

    patient.nurseAssignment = {
      nurseId: undefined,
      nurseName: undefined,
      nurseRole: undefined,
      requestedAt: undefined,
      approvedAt: undefined,
      rejectedAt: undefined,
      status: "NONE",
    };

    await patient.save();
    return this.getPatientByCode(patient.patientCode);
  }

  // Patient Rejects Nurse Request
  async rejectNurseAssignment(patientCode: string) {
    const patient = await this.findPatientDoc(patientCode);

    patient.nurseAssignment.status = "REJECTED";
    patient.nurseAssignment.rejectedAt = new Date();

    await patient.save();
    return this.getPatientByCode(patient.patientCode);
  }

  // Patient Directly Triggers Command (Bedside Touchscreen / Simulation)
  async triggerPatientCommand(patientCode: string, actionName: string) {
    const patient = await this.findPatientDoc(patientCode);

    // Requirement 6: Check confirmed bed assignment
    if (!patient.bedLabel || patient.bedStatus === "PENDING_APPROVAL" || patient.status === "PENDING_BED_APPROVAL") {
      throw new AppError(
        400,
        "BED_NOT_CONFIRMED",
        `Patient '${patientCode}' does not have a confirmed bed assignment. Bedside gaze and gesture commands cannot be activated until the bed assignment is confirmed.`
      );
    }

    // Requirement 6: Find active assigned device
    const activeAssignment = await DeviceAssignment.findOne({
      patient: patient._id,
      isActive: true,
    }).populate("device");

    if (!activeAssignment || !activeAssignment.device) {
      throw new AppError(
        400,
        "NO_ALLOCATED_DEVICE",
        `Patient '${patientCode}' does not have an active allocated device yet.`
      );
    }

    const device = activeAssignment.device as any;
    if (device.status === "DISABLED") {
      throw new AppError(
        400,
        "DEVICE_DISABLED",
        `Device '${device.deviceId}' is disabled and cannot transmit bedside commands.`
      );
    }

    const isYes = actionName.toUpperCase() === "YES" || actionName.toUpperCase() === "CONFIRM_RESOLVED";
    const isNo = actionName.toUpperCase() === "NO" || actionName.toUpperCase() === "REJECT_RESOLVED";

    // 1. Check if patient is responding to a pending resolution confirmation
    if (isYes || isNo) {
      const pendingResolution = await CareRequest.findOne({
        patient: patient._id,
        status: "PENDING_PATIENT_CONFIRMATION",
        confirmationExpiresAt: { $gt: new Date() },
      }).sort({ confirmationRequestedAt: -1 });

      if (pendingResolution) {
        if (isYes) {
          pendingResolution.status = "RESOLVED";
          pendingResolution.resolvedAt = new Date();
          pendingResolution.resolvedBy = "PATIENT_CONFIRMED";
          pendingResolution.patientConfirmedAt = new Date();
          pendingResolution.patientDisputedAt = undefined;
          pendingResolution.confirmationNote = "Patient confirmed care received (Bedside Touchscreen / Yes)";
          await pendingResolution.save();

          broadcastBedsideAudio({
            type: "PATIENT_CONFIRMATION_RESULT",
            requestId: String(pendingResolution._id),
            deviceId: (activeAssignment.device as any).deviceId,
            patientCode: patient.patientCode,
            patientName: patient.displayName,
            bedLabel: patient.bedLabel,
            resolved: true,
            speechPrompt: "Thank you. Call marked as resolved by patient.",
            timestamp: new Date().toISOString(),
          });
        } else {
          pendingResolution.status = "IN_PROGRESS";
          pendingResolution.urgent = true; // Escalated
          pendingResolution.patientDisputedAt = new Date();
          pendingResolution.patientConfirmedAt = undefined;
          pendingResolution.resolvedBy = undefined;
          pendingResolution.confirmationNote = "Patient reported care was NOT received (Disputed via No)";
          await pendingResolution.save();

          broadcastBedsideAudio({
            type: "PATIENT_CONFIRMATION_RESULT",
            requestId: String(pendingResolution._id),
            deviceId: (activeAssignment.device as any).deviceId,
            patientCode: patient.patientCode,
            patientName: patient.displayName,
            bedLabel: patient.bedLabel,
            resolved: false,
            speechPrompt: "Nurse re-alerted. Help is on the way.",
            timestamp: new Date().toISOString(),
          });
        }

        const populated = await CareRequest.findById(pendingResolution._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return populated || pendingResolution;
      }

      // 2. Check if patient is responding to a pending dispatch confirmation
      const pendingDispatch = await CareRequest.findOne({
        patient: patient._id,
        status: "PENDING_DISPATCH_CONFIRMATION",
        confirmationExpiresAt: { $gt: new Date() },
      }).sort({ confirmationRequestedAt: -1 });

      if (pendingDispatch) {
        if (isYes) {
          pendingDispatch.status = "NEW";
          pendingDispatch.confirmationRequestedAt = undefined;
          pendingDispatch.confirmationExpiresAt = undefined;
          await pendingDispatch.save();

          broadcastBedsideAudio({
            type: "REQUEST_DISPATCHED",
            requestId: String(pendingDispatch._id),
            deviceId: (activeAssignment.device as any).deviceId,
            patientCode: patient.patientCode,
            patientName: patient.displayName,
            bedLabel: patient.bedLabel,
            speechPrompt: "Your request has been sent.",
            timestamp: new Date().toISOString(),
          });
        } else {
          pendingDispatch.status = "CANCELLED";
          await pendingDispatch.save();

          broadcastBedsideAudio({
            type: "REQUEST_CANCELLED",
            requestId: String(pendingDispatch._id),
            deviceId: (activeAssignment.device as any).deviceId,
            patientCode: patient.patientCode,
            patientName: patient.displayName,
            bedLabel: patient.bedLabel,
            speechPrompt: "Request cancelled.",
            timestamp: new Date().toISOString(),
          });
        }

        const populated = await CareRequest.findById(pendingDispatch._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return populated || pendingDispatch;
      }
    }

    const targetCmd = PREDEFINED_COMMANDS.find(
      (c) => c.action.toUpperCase() === actionName.toUpperCase()
    ) || {
      action: actionName as any,
      gestureId: actionName.toUpperCase(),
      gestureName: actionName,
      isEmergency: actionName.toUpperCase() === "EMERGENCY",
    };

    // 3. Requirement: Max active requests per patient (emergency bypasses this limit)
    if (!targetCmd.isEmergency) {
      const activeCount = await CareRequest.countDocuments({
        patient: patient._id,
        status: { $in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "PENDING_DISPATCH_CONFIRMATION", "PENDING_PATIENT_CONFIRMATION"] },
      });

      if (activeCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT) {
        broadcastBedsideAudio({
          type: "REQUEST_LIMIT_REACHED",
          deviceId: (activeAssignment.device as any).deviceId,
          patientCode: patient.patientCode,
          patientName: patient.displayName,
          bedLabel: patient.bedLabel,
          activeCount,
          maxLimit: MAX_ACTIVE_REQUESTS_PER_PATIENT,
          speechPrompt: `Active request limit reached. ${MAX_ACTIVE_REQUESTS_PER_PATIENT} calls are already pending for your bed. Please wait for nursing staff, or trigger emergency if urgent.`,
          timestamp: new Date().toISOString(),
        });

        throw new AppError(
          429,
          "ACTIVE_REQUEST_LIMIT_REACHED",
          `Patient '${patientCode}' has reached the maximum of ${MAX_ACTIVE_REQUESTS_PER_PATIENT} active requests. Only EMERGENCY requests can be added until existing requests are resolved.`
        );
      }
    }

    const eventId = `EVT-PT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const careRequest = await CareRequest.create({
      eventId,
      device: (activeAssignment.device as any)._id,
      patient: patient._id,
      gestureId: targetCmd.gestureId,
      gesture: targetCmd.gestureName,
      urgent: Boolean(targetCmd.isEmergency),
      action: targetCmd.action,
      configVersion: (activeAssignment.device as any).appliedConfigVersion || 1,
      status: "NEW",
    });

    broadcastBedsideAudio({
      type: "REQUEST_DISPATCHED",
      requestId: String(careRequest._id),
      deviceId: (activeAssignment.device as any).deviceId,
      patientCode: patient.patientCode,
      patientName: patient.displayName,
      bedLabel: patient.bedLabel,
      action: targetCmd.action,
      speechPrompt: "Your request has been sent.",
      timestamp: new Date().toISOString(),
    });

    const populated = await CareRequest.findById(careRequest._id)
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    return populated || careRequest;
  }
}

export const patientService = new PatientService();
