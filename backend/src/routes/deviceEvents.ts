import { Router } from "express";
import { ingestDeviceEvent } from "../controllers/careRequestController.js";

export const deviceEventRouter = Router();

// POST /api/device-events
deviceEventRouter.post("/", ingestDeviceEvent);
