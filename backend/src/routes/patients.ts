import { Router } from "express";
import {
  createPatient,
  listPatients,
  getPatient,
  patientLogin,
  getPatientMe,
  requestNurse,
  approveNurse,
  rejectNurse,
  triggerCommand,
  getPredefinedCommands,
} from "../controllers/patientController.js";

import { Patient } from "../models/Patient.js";

export const patientRouter = Router();

async function ensureDefaultPatients() {
  const count = await Patient.countDocuments();
  if (count === 0) {
    await Patient.create({
      patientCode: "PT-101001",
      displayName: "Eleanor Vance",
      bedLabel: "ICU-Bed-04",
      status: "ACTIVE",
      password: "patient123",
      nurseAssignment: { status: "NONE" },
    });
  }
}

patientRouter.use(async (_req, _res, next) => {
  try {
    await ensureDefaultPatients();
  } catch {
    // ignore
  }
  next();
});

// Commands definition
patientRouter.get("/commands", getPredefinedCommands);

// Authentication & Self
patientRouter.post("/login", patientLogin);
patientRouter.get("/me", getPatientMe);

// Patient CRUD
patientRouter.post("/", createPatient);
patientRouter.get("/", listPatients);
patientRouter.get("/:patientCode", getPatient);

// Nurse Assignment Workflow (Request by Nurse -> Approval by Patient)
patientRouter.post("/:patientCode/request-nurse", requestNurse);
patientRouter.post("/:patientCode/approve-nurse", approveNurse);
patientRouter.post("/:patientCode/reject-nurse", rejectNurse);

// Command Execution by Patient Bedside Terminal
patientRouter.post("/:patientCode/trigger-command", triggerCommand);
