import { Request, Response, NextFunction } from "express";
import { careRequestService } from "../services/careRequestService.js";
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
    const updated = await careRequestService.resolveRequest(id);

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
