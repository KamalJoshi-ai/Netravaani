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
  allocateDeviceToPatient,
  deallocateDeviceFromPatient,
} from "../controllers/patientController.js";
import {
  proposeBedChange,
  approveBedAssignment,
  rejectBedAssignment,
} from "../controllers/bedController.js";

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

// Bed Assignment Workflow (Propose Bed by Nurse, Approve by Patient, Reject by Patient)
patientRouter.post("/:patientCode/bed/propose", proposeBedChange);
patientRouter.post("/:patientCode/propose-bed", proposeBedChange);
patientRouter.post("/:patientCode/bed/approve", approveBedAssignment);
patientRouter.post("/:patientCode/approve-bed", approveBedAssignment);
patientRouter.post("/:patientCode/bed/reject", rejectBedAssignment);
patientRouter.post("/:patientCode/reject-bed", rejectBedAssignment);

// Command Execution by Patient Bedside Terminal
patientRouter.post("/:patientCode/trigger-command", triggerCommand);

// Device Allocation to Patient
patientRouter.post("/:patientCode/assign-device", allocateDeviceToPatient);
patientRouter.post("/:patientCode/unassign-device", deallocateDeviceFromPatient);

