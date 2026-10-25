import { Router } from "express";
import {
  listBeds,
  initiatePatientRegistration,
  proposeBedChange,
  approveBedAssignment,
  rejectBedAssignment,
} from "../controllers/bedController.js";

export const bedRouter = Router();

// Bed management
bedRouter.get("/", listBeds);
bedRouter.post("/initiate-patient", initiatePatientRegistration);
bedRouter.post("/initiate-registration", initiatePatientRegistration);
bedRouter.post("/propose", proposeBedChange);
bedRouter.post("/propose-change", proposeBedChange);
bedRouter.post("/:patientCode/approve", approveBedAssignment);
bedRouter.post("/:patientCode/reject", rejectBedAssignment);

export default bedRouter;
