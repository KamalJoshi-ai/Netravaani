import { Request, Response, NextFunction } from "express";
import { commandRuleService } from "../services/commandRuleService.js";
import { saveCommandRulesSchema } from "../schemas/index.js";
import { authUserOf } from "../middleware/requireRole.js";
import { AppError } from "../middleware/errorHandler.js";

const savedBy = (req: Request) => {
  const u = authUserOf(req);
  return u?.name || u?.email || u?.id || undefined;
};

/** GET /api/devices/:deviceId/config: the device downloads this (compact JSON, no envelope). */
export const getDeviceConfigPayload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = await commandRuleService.getDevicePayload(req.params.deviceId);
    if (!payload) {
      res.status(404).json({ status: "error", code: "NO_CONFIG", message: "No configuration yet" });
      return;
    }
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (err) {
    next(err);
  }
};

/** GET /api/devices/:deviceId/rules */
export const getCommandRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await commandRuleService.getRules(req.params.deviceId);
    res.status(200).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/devices/:deviceId/rules: the complete rule list, never a partial patch. */
export const saveCommandRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rules } = saveCommandRulesSchema.parse(req.body);
    const version = await commandRuleService.saveRules(req.params.deviceId, rules, savedBy(req));
    res.status(201).json({
      status: "success",
      message: `Command rules saved as version ${version.version}; waiting for the device to apply them`,
      data: version,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/devices/:deviceId/rules/reset */
export const resetCommandRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const version = await commandRuleService.resetToDefaults(req.params.deviceId, savedBy(req));
    res.status(201).json({ status: "success", message: "Default rules restored", data: version });
  } catch (err) {
    next(err);
  }
};

/** POST /api/devices/:deviceId/rules/revert/:version */
export const revertCommandRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const target = parseInt(req.params.version, 10);
    if (!Number.isInteger(target) || target < 1) {
      throw new AppError(400, "INVALID_VERSION", "Version must be a positive integer");
    }
    const version = await commandRuleService.revertToVersion(req.params.deviceId, target, savedBy(req));
    res.status(201).json({
      status: "success",
      message: `Version ${target} re-issued as version ${version.version}`,
      data: version,
    });
  } catch (err) {
    next(err);
  }
};
