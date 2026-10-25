import { customAlphabet } from "nanoid";
import jwt from "jsonwebtoken";
import { Patient, IPatient, PatientStatus } from "../models/Patient.js";
import { Bed } from "../models/Bed.js";
import User from "../models/User.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { CareRequest } from "../models/CareRequest.js";
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
    action: "YES",
    gestureId: "BLINK_2",
    gestureName: "2 blinks, wait",
    serialCommand: "[cmd] YES",
    dashboardLabel: "YES",
    instruction: "Blink twice and wait to indicate affirmative / yes.",
    badgeColor: "bg-[#E8E2D7] text-[#30251F] border-[#D6C7B7]",
    isEmergency: false,
  },
  {
    action: "WATER",
    gestureId: "BLINK_4_PLUS",
    gestureName: "4+ blinks",
    serialCommand: "[cmd] WATER",
    dashboardLabel: "WATER",
    instruction: "Blink 4 or more rapid times to request drinking water.",
    badgeColor: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7]",
    isEmergency: false,
  },
  {
    action: "NO",
    gestureId: "SQUEEZE_BOTH_1",
    gestureName: "Squeeze both hands together, once",
    serialCommand: "[cmd] NO",
    dashboardLabel: "NO",
    instruction: "Squeeze both hands together firmly once to indicate negative / no.",
    badgeColor: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C]",
    isEmergency: false,
  },
  {
    action: "CALL_NURSE",
    gestureId: "SQUEEZE_LEFT_3",
    gestureName: "Squeeze left hand 3 times",
    serialCommand: "[cmd] CALL NURSE",
    dashboardLabel: "CALL NURSE",
    instruction: "Squeeze left hand 3 distinct times to summon bedside nurse.",
    badgeColor: "bg-[#E5DFD7] text-[#30251F] border-[#CEBEB0]",
    isEmergency: false,
  },
  {
    action: "EMERGENCY",
    gestureId: "SQUEEZE_BOTH_3",
    gestureName: "Squeeze both hands together, 3 times",
    serialCommand: "[cmd] EMERGENCY / SEVERE PAIN",
    dashboardLabel: "EMERGENCY, LEDs 1–4 flash red",
    instruction: "Squeeze both hands together 3 rapid times for acute emergency & pain alert.",
    badgeColor: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29]",
    isEmergency: true,
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

    const assignmentMap = new Map();
    activeAssignments.forEach((assign) => {
      assignmentMap.set(assign.patient.toString(), assign);
    });

    const items = patients.map((p) => ({
      ...p,
      currentAssignment: assignmentMap.get(p._id.toString()) || null,
    }));

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

    return {
      ...patient,
      currentAssignment: currentAssignment || null,
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

  // Nurse Requests Assignment to Patient (with optional entered Bed Number)
  async requestNurseAssignment(
    patientCode: string,
    nurseData: { nurseId?: string; nurseName: string; nurseRole?: string; bedNumber?: string; bedLabel?: string }
  ) {
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

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
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

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
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
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
    return this.getPatientByCode(patientCode);
  }

  // Patient Rejects Nurse Request
  async rejectNurseAssignment(patientCode: string) {
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    patient.nurseAssignment.status = "REJECTED";
    patient.nurseAssignment.rejectedAt = new Date();

    await patient.save();
    return this.getPatientByCode(patientCode);
  }

  // Patient Directly Triggers Command (Bedside Touchscreen / Simulation)
  async triggerPatientCommand(patientCode: string, actionName: string) {
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

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

    const targetCmd = PREDEFINED_COMMANDS.find(
      (c) => c.action.toUpperCase() === actionName.toUpperCase()
    ) || {
      action: actionName as any,
      gestureId: actionName.toUpperCase(),
      gestureName: actionName,
      isEmergency: actionName.toUpperCase() === "EMERGENCY",
    };

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

    const populated = await CareRequest.findById(careRequest._id)
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    return populated || careRequest;
  }
}

export const patientService = new PatientService();
