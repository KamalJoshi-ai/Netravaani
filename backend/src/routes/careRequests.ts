import { Router } from "express";
import {
  listCareRequests,
  getCareRequest,
  acknowledgeCareRequest,
  startHandlingCareRequest,
  resolveCareRequest,
  requestPatientConfirmation,
  confirmDispatchCareRequest,
  cancelDispatchCareRequest,
  getBedsideAudioEvents,
  getBedsideAudioStatus,
  ingestDeviceEvent,
  clearAllCareRequests,
  resolveAllCareRequests,
} from "../controllers/careRequestController.js";

export const careRequestRouter = Router();

// Ingestion Alias
careRequestRouter.post("/events", ingestDeviceEvent);

// Bedside Audio Speaker routes (MUST precede /:id)
careRequestRouter.get("/bedside-audio-events", getBedsideAudioEvents);
careRequestRouter.get("/bedside-audio-status", getBedsideAudioStatus);

// Retrieval
careRequestRouter.get("/", listCareRequests);
careRequestRouter.get("/:id", getCareRequest);

// Outgoing Dispatch Confirmation from Bedside
careRequestRouter.post("/:id/confirm-dispatch", confirmDispatchCareRequest);
careRequestRouter.patch("/:id/confirm-dispatch", confirmDispatchCareRequest);
careRequestRouter.post("/:id/cancel-dispatch", cancelDispatchCareRequest);
careRequestRouter.patch("/:id/cancel-dispatch", cancelDispatchCareRequest);

// Lifecycle Transitions (supports PATCH and POST)
careRequestRouter.patch("/:id/acknowledge", acknowledgeCareRequest);
careRequestRouter.post("/:id/acknowledge", acknowledgeCareRequest);
careRequestRouter.patch("/:id/in-progress", startHandlingCareRequest);
careRequestRouter.post("/:id/in-progress", startHandlingCareRequest);
careRequestRouter.patch("/:id/request-confirmation", requestPatientConfirmation);
careRequestRouter.post("/:id/request-confirmation", requestPatientConfirmation);
careRequestRouter.patch("/:id/resolve", resolveCareRequest);
careRequestRouter.post("/:id/resolve", resolveCareRequest);

// Bulk Actions
careRequestRouter.delete("/", clearAllCareRequests);
careRequestRouter.post("/resolve-all", resolveAllCareRequests);
