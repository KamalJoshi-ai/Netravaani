import { Router } from "express";
import {
  listCareRequests,
  getCareRequest,
  acknowledgeCareRequest,
  startHandlingCareRequest,
  resolveCareRequest,
  ingestDeviceEvent,
  clearAllCareRequests,
  resolveAllCareRequests,
} from "../controllers/careRequestController.js";

export const careRequestRouter = Router();

// Ingestion Alias
careRequestRouter.post("/events", ingestDeviceEvent);

// Retrieval
careRequestRouter.get("/", listCareRequests);
careRequestRouter.get("/:id", getCareRequest);

// Lifecycle Transitions (supports PATCH and POST)
careRequestRouter.patch("/:id/acknowledge", acknowledgeCareRequest);
careRequestRouter.post("/:id/acknowledge", acknowledgeCareRequest);
careRequestRouter.patch("/:id/in-progress", startHandlingCareRequest);
careRequestRouter.post("/:id/in-progress", startHandlingCareRequest);
careRequestRouter.patch("/:id/resolve", resolveCareRequest);
careRequestRouter.post("/:id/resolve", resolveCareRequest);

// Bulk Actions
careRequestRouter.delete("/", clearAllCareRequests);
careRequestRouter.post("/resolve-all", resolveAllCareRequests);
