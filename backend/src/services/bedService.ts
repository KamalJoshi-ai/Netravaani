import mongoose from "mongoose";
import { Bed, IBed, BedStatus } from "../models/Bed.js";
import { Patient, IPatient } from "../models/Patient.js";
import { AppError } from "../middleware/errorHandler.js";

export interface InitiatePatientRegistrationDto {
  displayName: string;
  bedNumber: string;
  email?: string;
  password?: string;
  nurseId?: string;
  nurseName?: string;
}

export class BedService {
  /**
   * Sync confirmed patient beds with the beds collection
   */
  async seedDefaultBedsIfEmpty(): Promise<void> {
    // Purge any legacy unassigned fake beds from database
    await Bed.deleteMany({
      bedNumber: {
        $in: [
          "BED-101",
          "BED-102",
          "BED-103",
          "BED-104",
          "BED-105",
          "BED-106",
          "BED-107",
          "BED-108",
          "ICU-01",
          "ICU-02",
          "ICU-03",
          "ICU-04",
        ],
      },
      currentPatient: null,
      pendingPatient: null,
    });

    // Sync any active patients who already have confirmed beds
    const activePatientsWithBeds = await Patient.find({
      status: "ACTIVE",
      bedLabel: { $exists: true, $ne: "" },
    }).lean();

    for (const p of activePatientsWithBeds) {
      if (p.bedLabel) {
        const norm = p.bedLabel.trim().toUpperCase();
        await Bed.updateOne(
          { bedNumber: norm },
          {
            $set: {
              bedNumber: norm,
              status: "OCCUPIED",
              currentPatient: p._id,
            },
          },
          { upsert: true }
        );
      }
    }
  }

  /**
   * Find or create a bed record by normalized bedNumber
   */
  async ensureBedExists(bedNumber: string): Promise<IBed> {
    const norm = (bedNumber || "").trim().toUpperCase();
    if (!norm) {
      throw new AppError(400, "INVALID_BED_NUMBER", "Bed number is required");
    }
    let bed = await Bed.findOne({ bedNumber: norm });
    if (!bed) {
      bed = await Bed.create({
        bedNumber: norm,
        status: "AVAILABLE",
      });
    }
    return bed;
  }

  /**
   * List all hospital beds with optional status filter
   */
  async listBeds(status?: BedStatus) {
    await this.seedDefaultBedsIfEmpty();
    const query: Record<string, unknown> = {};
    if (status) {
      query.status = status;
    }
    return Bed.find(query)
      .populate("currentPatient", "patientCode displayName bedLabel status")
      .populate("pendingPatient", "patientCode displayName pendingBedLabel status")
      .sort({ bedNumber: 1 })
      .lean();
  }

  /**
   * Step 2-4: Nurse selects an available bed and initiates patient registration.
   * Bed is marked PENDING_APPROVAL. Patient is created in PENDING_BED_APPROVAL status.
   */
  async initiatePatientRegistration(dto: InitiatePatientRegistrationDto) {
    const normBed = (dto.bedNumber || "").trim().toUpperCase();
    if (!normBed) {
      throw new AppError(400, "BED_NUMBER_REQUIRED", "A valid bed must be assigned to initiate patient registration");
    }
    if (!dto.displayName || !dto.displayName.trim()) {
      throw new AppError(400, "DISPLAY_NAME_REQUIRED", "Patient display name is required");
    }

    await this.ensureBedExists(normBed);

    // Atomically claim the bed for approval if currently AVAILABLE
    const claimedBed = await Bed.findOneAndUpdate(
      { bedNumber: normBed, status: "AVAILABLE" },
      {
        $set: {
          status: "PENDING_APPROVAL",
          assignedNurse: dto.nurseId || dto.nurseName || "Staff Nurse",
        },
      },
      { new: true }
    );

    if (!claimedBed) {
      throw new AppError(
        409,
        "BED_UNAVAILABLE",
        `Bed '${normBed}' is not available. It is currently occupied or pending patient approval.`
      );
    }

    const { customAlphabet } = await import("nanoid");
    const generatePatientId = customAlphabet("0123456789", 6);
    const patientCode = `PT-${generatePatientId()}`;

    try {
      const patient = await Patient.create({
        patientCode,
        displayName: dto.displayName.trim(),
        email: dto.email ? dto.email.trim().toLowerCase() : undefined,
        status: "PENDING_BED_APPROVAL",
        bedStatus: "PENDING_APPROVAL",
        pendingBedLabel: normBed,
        bedAssignedBy: dto.nurseName || "Staff Nurse",
        bedProposedAt: new Date(),
        password: dto.password || "patient123",
        nurseAssignment: {
          nurseId: dto.nurseId as any,
          nurseName: dto.nurseName || "Staff Nurse",
          status: "PENDING",
          requestedAt: new Date(),
        },
      });

      // Link patient to the claimed bed
      claimedBed.pendingPatient = patient._id as any;
      await claimedBed.save();

      return {
        patient,
        bed: claimedBed,
      };
    } catch (err) {
      // Revert bed claim on patient creation failure
      await Bed.updateOne(
        { _id: claimedBed._id, status: "PENDING_APPROVAL" },
        { $set: { status: "AVAILABLE", pendingPatient: null, assignedNurse: null } }
      );
      throw err;
    }
  }

  /**
   * Nurse proposes a bed change for an existing patient.
   * New bed must be available. Old confirmed bed is retained pending approval.
   */
  async proposeBedChange(
    patientCode: string,
    newBedNumber: string,
    nurseData?: { nurseId?: string; nurseName?: string }
  ) {
    const trimmedCode = (patientCode || "").trim();
    const patient = await Patient.findOne({
      $or: [
        { patientCode: trimmedCode },
        { patientCode: trimmedCode.toUpperCase() },
      ],
    });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    const normNewBed = (newBedNumber || "").trim().toUpperCase();
    if (!normNewBed) {
      throw new AppError(400, "BED_NUMBER_REQUIRED", "New bed number is required");
    }

    if (patient.bedLabel === normNewBed && patient.bedStatus === "OCCUPIED") {
      throw new AppError(
        400,
        "ALREADY_IN_BED",
        `Patient '${patientCode}' is already confirmed and occupying bed '${normNewBed}'.`
      );
    }

    await this.ensureBedExists(normNewBed);

    // Atomically claim the new bed
    const claimedNewBed = await Bed.findOneAndUpdate(
      { bedNumber: normNewBed, status: "AVAILABLE" },
      {
        $set: {
          status: "PENDING_APPROVAL",
          pendingPatient: patient._id,
          assignedNurse: nurseData?.nurseId || nurseData?.nurseName || "Staff Nurse",
        },
      },
      { new: true }
    );

    if (!claimedNewBed) {
      throw new AppError(
        409,
        "BED_UNAVAILABLE",
        `Bed '${normNewBed}' is not available. It is currently occupied or pending approval by another patient.`
      );
    }

    // Release any previous pending bed if different from the newly claimed bed
    if (patient.pendingBedLabel && patient.pendingBedLabel !== normNewBed) {
      await Bed.updateOne(
        { bedNumber: patient.pendingBedLabel, status: "PENDING_APPROVAL", pendingPatient: patient._id },
        { $set: { status: "AVAILABLE", pendingPatient: null, assignedNurse: null } }
      );
    }

    // Update patient with proposed bed while retaining existing confirmed bed
    patient.pendingBedLabel = normNewBed;
    patient.bedStatus = "PENDING_APPROVAL";
    patient.bedAssignedBy = nurseData?.nurseName || "Staff Nurse";
    patient.bedProposedAt = new Date();
    patient.bedRejectedAt = undefined;
    await patient.save();

    return {
      patient,
      proposedBed: claimedNewBed,
    };
  }

  /**
   * Step 6-7: Patient explicitly approves proposed bed assignment.
   * Atomically confirms new bed, releases old bed, and sets patient to ACTIVE.
   */
  async approveBed(patientCode: string, approvingUserIdentifier?: string) {
    const trimmedCode = (patientCode || "").trim();
    const patient = await Patient.findOne({
      $or: [
        { patientCode: trimmedCode },
        { patientCode: trimmedCode.toUpperCase() },
      ],
    });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    // Security check: patients cannot approve another patient's bed assignment
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
        throw new AppError(403, "FORBIDDEN", "Patients are only authorized to approve their own bed assignments.");
      }
    }

    if (!patient.pendingBedLabel) {
      throw new AppError(400, "NO_PENDING_BED", "There is no pending bed assignment proposal to approve.");
    }

    const newBedNum = patient.pendingBedLabel;
    const oldBedNum = patient.bedLabel;

    // Release previous confirmed bed if changing beds
    if (oldBedNum && oldBedNum !== newBedNum) {
      await Bed.updateOne(
        { bedNumber: oldBedNum, currentPatient: patient._id },
        { $set: { status: "AVAILABLE", currentPatient: null } }
      );
    }

    // Confirm new bed as OCCUPIED
    await Bed.updateOne(
      { bedNumber: newBedNum },
      {
        $set: {
          status: "OCCUPIED",
          currentPatient: patient._id,
          pendingPatient: null,
        },
      }
    );

    // Update patient to confirmed active status
    patient.bedLabel = newBedNum;
    patient.pendingBedLabel = undefined;
    patient.bedStatus = "OCCUPIED";
    patient.status = "ACTIVE";
    patient.bedApprovedAt = new Date();

    if (patient.nurseAssignment && patient.nurseAssignment.status === "PENDING") {
      patient.nurseAssignment.status = "APPROVED";
      patient.nurseAssignment.approvedAt = new Date();
    }

    await patient.save();
    return patient;
  }

  /**
   * Step 8: Patient rejects proposed bed assignment.
   * Releases proposed bed back to AVAILABLE. Retains existing confirmed bed if any.
   */
  async rejectBed(patientCode: string, rejectingUserIdentifier?: string) {
    const trimmedCode = (patientCode || "").trim();
    const patient = await Patient.findOne({
      $or: [
        { patientCode: trimmedCode },
        { patientCode: trimmedCode.toUpperCase() },
      ],
    });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    // Security check: patients cannot reject another patient's bed assignment
    if (rejectingUserIdentifier) {
      const normIdent = rejectingUserIdentifier.trim().toLowerCase();
      const ptCodeNorm = patient.patientCode.toLowerCase();
      const ptEmailNorm = (patient.email || "").toLowerCase();
      const ptUserIdNorm = (patient.userId ? String(patient.userId) : "").toLowerCase();

      const isMatch =
        normIdent === ptCodeNorm ||
        (ptEmailNorm && normIdent === ptEmailNorm) ||
        (ptUserIdNorm && normIdent === ptUserIdNorm);

      if (!isMatch) {
        throw new AppError(403, "FORBIDDEN", "Patients are only authorized to reject their own bed assignments.");
      }
    }

    if (!patient.pendingBedLabel) {
      throw new AppError(400, "NO_PENDING_BED", "There is no pending bed assignment proposal to reject.");
    }

    const proposedBedNum = patient.pendingBedLabel;

    // Release proposed bed back to AVAILABLE
    await Bed.updateOne(
      { bedNumber: proposedBedNum, pendingPatient: patient._id },
      { $set: { status: "AVAILABLE", pendingPatient: null, assignedNurse: null } }
    );

    patient.pendingBedLabel = undefined;
    patient.bedStatus = patient.bedLabel ? "OCCUPIED" : "NONE";
    patient.bedRejectedAt = new Date();
    await patient.save();

    return patient;
  }
}

export const bedService = new BedService();
