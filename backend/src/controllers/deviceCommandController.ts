import { Request, Response, NextFunction } from "express";
import { deviceCommandService } from "../services/deviceCommandService.js";
import { authUserOf } from "../middleware/requireRole.js";
import { AppError } from "../middleware/errorHandler.js";

const savedBy = (req: Request) => {
  const u = authUserOf(req);
  return u?.name || u?.email || u?.id || undefined;
};

const extractBearerToken = (req: Request): string | undefined => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
};

/**
 * GET /api/devices/:deviceId/config (and /api/devices/config):
 * The device downloads this compact JSON (section 3). No "rules" key.
 */
export const getDeviceConfigPayload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const bearer = extractBearerToken(req);
    const id = req.params.deviceId || (req.headers["x-device-id"] as string) || (req.headers["x-hardware-id"] as string);

    const payload = await deviceCommandService.getDevicePayload(id, bearer);
    if (!payload) {
      res.status(404).json({ status: "error", code: "NO_CONFIG", message: "No configuration yet" });
      return;
    }

    // Return compact JSON without indentation as required by nv-5.0.0
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/devices/:deviceId/commands:
 * Dashboard endpoint returning the 7 commands merged with GESTURES.
 */
export const getDeviceCommands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const bearer = extractBearerToken(req);
    const data = await deviceCommandService.getCommands(req.params.deviceId, bearer);
    res.status(200).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/devices/:deviceId/commands:
 * Takes all 7 commands, validates them, saves new version.
 */
export const saveDeviceCommands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const commands = Array.isArray(req.body) ? req.body : req.body?.commands;
    if (!Array.isArray(commands)) {
      throw new AppError(400, "INVALID_BODY", "Request body must be an array of 7 commands or contain a 'commands' array");
    }

    const version = await deviceCommandService.saveCommands(req.params.deviceId, commands, savedBy(req));
    res.status(201).json({
      status: "success",
      message: `Commands saved as version ${version.version}; waiting for device to apply`,
      data: version,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/devices/:deviceId/commands/reset
 */
export const resetDeviceCommands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const version = await deviceCommandService.resetToDefaults(req.params.deviceId, savedBy(req));
    res.status(201).json({ status: "success", message: "Default commands restored", data: version });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/devices/:deviceId/commands/revert/:version
 */
export const revertDeviceCommands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const target = parseInt(req.params.version, 10);
    if (!Number.isInteger(target) || target < 1) {
      throw new AppError(400, "INVALID_VERSION", "Version must be a positive integer");
    }
    const version = await deviceCommandService.revertToVersion(req.params.deviceId, target, savedBy(req));
    res.status(201).json({
      status: "success",
      message: `Version ${target} re-issued as version ${version.version}`,
      data: version,
    });
  } catch (err) {
    next(err);
  }
};

