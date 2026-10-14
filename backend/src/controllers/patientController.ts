import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { patientService, PREDEFINED_COMMANDS } from "../services/patientService.js";
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
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      res.status(401).json({ status: "error", message: "Patient session missing" });
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET
    ) as { patientCode: string };

    const patient = await patientService.getPatientByCode(decoded.patientCode);
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

// Patient Approves Nurse Request
export const approveNurse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patientCode } = req.params;
    const updated = await patientService.approveNurseAssignment(patientCode);
    res.status(200).json({
      status: "success",
      message: "Nurse assignment request approved by patient",
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
