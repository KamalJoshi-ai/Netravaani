import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { patientService, PREDEFINED_COMMANDS } from "../services/patientService.js";
import { assignmentService } from "../services/assignmentService.js";
import { Patient } from "../models/Patient.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { AppError } from "../middleware/errorHandler.js";
import User from "../models/User.js";
import {
  createPatientSchema,
  listPatientsQuerySchema,
} from "../schemas/index.js";
import { env } from "../config/env.js";

export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createPatientSchema.parse(req.body);
    const patient = await patientService.createPatient(validated);
    res.status(201).json({
      status: "success",
      message: "Patient registered successfully",
      data: patient,
    });
  } catch (err) {
    next(err);
  }
};

export const listPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = listPatientsQuerySchema.parse(req.query);
    const result = await patientService.listPatients(query.page, query.limit, query.status);
    res.status(200).json({
      status: "success",
      data: result.items,
      meta: result.meta,
    });
  } catch (err) {
    next(err);
  }
};

export const getPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const patient = await patientService.getPatientByCode(patientCode);
    res.status(200).json({
      status: "success",
      data: patient,
    });
  } catch (err) {
    next(err);
  }
};

// Patient Login
export const patientLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode, password } = req.body;
    const result = await patientService.patientLogin(patientCode, password || "patient123");
    res.status(200).json({
      status: "success",
      message: "Patient authenticated successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// Patient Self Profile Check
export const getPatientMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token =
      req.cookies?.patient_token ||
      req.cookies?.access_token ||
      req.cookies?.netravaani_token ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      res.status(401).json({ status: "error", message: "Patient session missing" });
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET
    ) as any;

    let identifier = decoded.patientCode || decoded.email || decoded.username;
    if (!identifier && (decoded.userId || decoded.id)) {
      const u = await User.findById(decoded.userId || decoded.id);
      if (u) {
        identifier = u.patientCode || u.email || u.username || u.name;
      }
    }

    if (!identifier) {
      res.status(404).json({ status: "error", message: "Patient identity not identified" });
      return;
    }

    const patient = await patientService.getPatientByCode(identifier);
    res.status(200).json({
      status: "success",
      data: patient,
    });
  } catch (err) {
    next(err);
  }
};

// Nurse Requests Assignment to Patient
export const requestNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { nurseId, nurseName, nurseRole } = req.body;
    const updated = await patientService.requestNurseAssignment(patientCode, {
      nurseId,
      nurseName: nurseName || "Bedside Nurse Station",
      nurseRole,
    });
    res.status(200).json({
      status: "success",
      message: `Nurse assignment request dispatched to patient ${patientCode}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Patient Approves Nurse Request (with optional Bed Number)
export const approveNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { bedLabel } = req.body || {};
    const updated = await patientService.approveNurseAssignment(patientCode, bedLabel);
    res.status(200).json({
      status: "success",
      message: "Nurse assignment request approved by patient",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Nurse Directly Allocates Patient by Herself
export const allocateNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { nurseId, nurseName, nurseRole, bedLabel } = req.body || {};
    const updated = await patientService.allocateNurse(patientCode, {
      nurseId,
      nurseName: nurseName || "Staff Nurse",
      nurseRole: nurseRole || "nurse",
      bedLabel,
    });
    res.status(200).json({
      status: "success",
      message: `Patient ${patientCode} allocated successfully to nurse ${nurseName || "Staff Nurse"}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Nurse Deallocates Patient by Herself
export const deallocateNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const updated = await patientService.deallocateNurse(patientCode);
    res.status(200).json({
      status: "success",
      message: `Patient ${patientCode} deallocated successfully`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Patient Rejects Nurse Request
export const rejectNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const updated = await patientService.rejectNurseAssignment(patientCode);
    res.status(200).json({
      status: "success",
      message: "Nurse assignment request declined by patient",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Patient Triggers Command
export const triggerCommand = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { action } = req.body;
    const careRequest = await patientService.triggerPatientCommand(patientCode, action);
    res.status(201).json({
      status: "success",
      message: `Patient command '${action}' dispatched to nurse station`,
      data: careRequest,
    });
  } catch (err) {
    next(err);
  }
};

// Predefined Commands List
export const getPredefinedCommands = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: "success",
    data: PREDEFINED_COMMANDS,
  });
};

// Allocate a Device to Patient
export const allocateDeviceToPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { deviceId, assignedBy, reassign } = req.body || {};
    if (!deviceId) {
      throw new AppError(400, "DEVICE_ID_REQUIRED", "deviceId is required to allocate a device to a patient");
    }
    const assignment = await assignmentService.assignDevice({
      deviceId,
      patientCode,
      assignedBy,
      reassign,
    });
    res.status(200).json({
      status: "success",
      message: `Device '${deviceId}' allocated to patient '${patientCode}' successfully`,
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

// Deallocate Device from Patient
export const deallocateDeviceFromPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const { deviceId, notes } = req.body || {};
    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      const patient = await Patient.findOne({
        $or: [
          { patientCode },
          { patientCode: patientCode.toUpperCase() },
          { patientCode: patientCode.toLowerCase() },
        ],
      });
      if (!patient) {
        throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
      }
      const activeAssignment = await DeviceAssignment.findOne({
        patient: patient._id,
        isActive: true,
      }).populate("device");
      if (!activeAssignment || !activeAssignment.device) {
        throw new AppError(404, "NO_ACTIVE_ASSIGNMENT", `Patient '${patientCode}' does not have an active device allocated`);
      }
      targetDeviceId = (activeAssignment.device as any).deviceId;
    }

    const assignment = await assignmentService.unassignDevice({
      deviceId: targetDeviceId,
      notes,
    });
    res.status(200).json({
      status: "success",
      message: `Device '${targetDeviceId}' deallocated from patient '${patientCode}' successfully`,
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

