import { Request, Response, NextFunction } from "express";
import { bedService } from "../services/bedService.js";
import { AppError } from "../middleware/errorHandler.js";

// GET /api/beds
export const listBeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.query;
    const beds = await bedService.listBeds(status as any);
    res.status(200).json({
      status: "success",
      data: beds,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/beds/initiate-patient (Nurse initiates patient registration with an available bed)
export const initiatePatientRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { displayName, bedNumber, email, password } = req.body || {};
    const nurse = (req as any).user;

    const result = await bedService.initiatePatientRegistration({
      displayName,
      bedNumber,
      email,
      password,
      nurseId: nurse?._id?.toString(),
      nurseName: nurse?.name || "Staff Nurse",
    });

    res.status(201).json({
      status: "success",
      message: `Patient registration initiated. Bed '${bedNumber}' is marked pending patient approval.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/beds/propose-change (Nurse proposes a new bed for a patient)
export const proposeBedChange = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const patientCode = req.params?.patientCode || req.body?.patientCode;
    const newBedNumber = req.body?.newBedNumber;
    if (!patientCode || !newBedNumber) {
      throw new AppError(400, "MISSING_FIELDS", "patientCode and newBedNumber are required");
    }
    const nurse = (req as any).user;

    const result = await bedService.proposeBedChange(patientCode, newBedNumber, {
      nurseId: nurse?._id?.toString(),
      nurseName: nurse?.name || "Staff Nurse",
    });

    res.status(200).json({
      status: "success",
      message: `Bed change proposed. New bed '${newBedNumber}' is pending approval by patient '${patientCode}'. Existing bed is preserved.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/patients/:patientCode/bed/approve (Patient explicitly approves bed)
export const approveBedAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const patientCode = req.params?.patientCode || req.body?.patientCode;
    const user = (req as any).user;
    const identifier = user?.patientCode || user?.email || user?._id?.toString() || req.body?.userIdentifier;

    const patient = await bedService.approveBed(patientCode, identifier);

    res.status(200).json({
      status: "success",
      message: `Bed '${patient.bedLabel}' confirmed successfully! Patient registration is now active.`,
      data: { patient },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/patients/:patientCode/bed/reject (Patient explicitly rejects bed)
export const rejectBedAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const patientCode = req.params?.patientCode || req.body?.patientCode;
    const user = (req as any).user;
    const identifier = user?.patientCode || user?.email || user?._id?.toString() || req.body?.userIdentifier;

    const patient = await bedService.rejectBed(patientCode, identifier);

    res.status(200).json({
      status: "success",
      message: "Proposed bed assignment rejected. The bed has been released as available.",
      data: { patient },
    });
  } catch (err) {
    next(err);
  }
};
