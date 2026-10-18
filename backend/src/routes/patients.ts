import { Router } from "express";
import {
  createPatient,
  listPatients,
  getPatient,
  patientLogin,
  getPatientMe,
  requestNurse,
  allocateNurse,
  deallocateNurse,
  approveNurse,
  rejectNurse,
  triggerCommand,
  getPredefinedCommands,
} from "../controllers/patientController.js";

import { Patient } from "../models/Patient.js";

export const patientRouter = Router();

// Clean up any previously seeded fake demo patient from the database
let cleanedUp = false;
patientRouter.use(async (_req, _res, next) => {
  if (!cleanedUp) {
    try {
      await Patient.deleteMany({ patientCode: "PT-101001" });
      cleanedUp = true;
    } catch {
      // ignore if DB not ready
    }
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

// Nurse Assignment Workflow (Allocate by Nurse, Request, Approve, Deallocate)
patientRouter.post("/:patientCode/request-nurse", requestNurse);
patientRouter.post("/:patientCode/allocate-nurse", allocateNurse);
patientRouter.post("/:patientCode/deallocate-nurse", deallocateNurse);
patientRouter.post("/:patientCode/approve-nurse", approveNurse);
patientRouter.post("/:patientCode/reject-nurse", rejectNurse);

// Command Execution by Patient Bedside Terminal
patientRouter.post("/:patientCode/trigger-command", triggerCommand);
