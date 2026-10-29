import { Request, Response, NextFunction } from "express";
import { careRequestService, subscribeBedsideAudio, BedsideAudioEvent } from "../services/careRequestService.js";
import { deviceEventSchema, listCareRequestsQuerySchema } from "../schemas/index.js";

/**
 * Event Ingestion Endpoint
 * POST /api/device-events
 * Development/Test ingestion of gesture recognition events
 */
export const ingestDeviceEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validated = deviceEventSchema.parse(req.body);
    const result = await careRequestService.ingestDeviceEvent(validated);

    if (result.isDuplicate) {
      res.status(200).json({
        status: "success",
        message: "Event already processed (deduplicated)",
        duplicate: true,
        isDuplicate: true,
        data: result.careRequest,
      });
      return;
    }

    if (result.accepted && !result.careRequest) {
      res.status(201).json({
        status: "success",
        accepted: true,
      });
      return;
    }

    res.status(201).json({
      status: "success",
      message: "Care request created from recognized gesture event",
      accepted: true,
      requestId: result.careRequest?._id,
      isDuplicate: false,
      data: result.careRequest,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List Care Requests
 * GET /api/care-requests
 */
export const listCareRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validated = listCareRequestsQuerySchema.parse(req.query);
    const result = await careRequestService.listCareRequests(validated);

    res.status(200).json({
      status: "success",
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Single Care Request
 * GET /api/care-requests/:id
 */
export const getCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await careRequestService.getCareRequestById(id);

    res.status(200).json({
      status: "success",
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Acknowledge Care Request
 * PATCH /api/care-requests/:id/acknowledge
 */
export const acknowledgeCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await careRequestService.acknowledgeRequest(id);

    res.status(200).json({
      status: "success",
      message: "Care request acknowledged",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Move Care Request to IN_PROGRESS
 * PATCH /api/care-requests/:id/in-progress
 */
export const startHandlingCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await careRequestService.startHandlingRequest(id);

    res.status(200).json({
      status: "success",
      message: "Care request moved to in-progress",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resolve Care Request
 * PATCH /api/care-requests/:id/resolve
 */
export const resolveCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const resolvedBy = req.body?.resolvedBy === "PATIENT_CONFIRMED" ? "PATIENT_CONFIRMED" : "NURSE_OVERRIDE";
    const updated = await careRequestService.resolveRequest(id, resolvedBy);

    res.status(200).json({
      status: "success",
      message: "Care request resolved",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Confirm outgoing care request dispatch
 * POST /api/care-requests/:id/confirm-dispatch
 */
export const confirmDispatchCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await careRequestService.confirmDispatch(id);

    res.status(200).json({
      status: "success",
      message: "Care request confirmed and dispatched to nurse station",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel outgoing care request dispatch
 * POST /api/care-requests/:id/cancel-dispatch
 */
export const cancelDispatchCareRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await careRequestService.cancelDispatch(id);

    res.status(200).json({
      status: "success",
      message: "Care request dispatch cancelled",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Request Patient Confirmation for Care Request
 * PATCH /api/care-requests/:id/request-confirmation
 */
export const requestPatientConfirmation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await careRequestService.requestPatientConfirmation(id);

    res.status(200).json({
      status: "success",
      message: "Patient confirmation requested",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * SSE Bedside Audio Events Stream for phone bedside speaker
 * GET /api/care-requests/bedside-audio-events
 */
export const getBedsideAudioEvents = (req: Request, res: Response): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
  const patientCode = typeof req.query.patientCode === "string" ? req.query.patientCode : undefined;

  // Send initial connected event
  res.write(
    `data: ${JSON.stringify({
      type: "CONNECTED",
      message: "Bedside Audio SSE stream established",
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  const unsubscribe = subscribeBedsideAudio(
    { deviceId, patientCode },
    (event: BedsideAudioEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  );

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(pingInterval);
    unsubscribe();
  });
};

/**
 * Get active patient confirmation status for phone bedside speaker
 * GET /api/care-requests/bedside-audio-status
 */
export const getBedsideAudioStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
    const patientCode = typeof req.query.patientCode === "string" ? req.query.patientCode : undefined;
    const status = await careRequestService.getActiveConfirmation({ deviceId, patientCode });

    res.status(200).json({
      status: "success",
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Clear / Delete All Care Requests
 * DELETE /api/care-requests
 */
export const clearAllCareRequests = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deletedCount = await careRequestService.clearAllCareRequests();
    res.status(200).json({
      status: "success",
      message: `Cleared ${deletedCount} care requests`,
      deletedCount,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resolve All Open Care Requests at once
 * POST /api/care-requests/resolve-all
 */
export const resolveAllCareRequests = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const modifiedCount = await careRequestService.resolveAllCareRequests();
    res.status(200).json({
      status: "success",
      message: `Resolved ${modifiedCount} open care requests`,
      modifiedCount,
    });
  } catch (err) {
    next(err);
  }
};
