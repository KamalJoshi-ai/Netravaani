import { Request, Response, NextFunction } from "express";
import { deviceService } from "../services/deviceService.js";
import { assignmentService } from "../services/assignmentService.js";
import { configService } from "../services/configService.js";
import { patientCommunicationService } from "../services/patientCommunicationService.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  registerDeviceSchema,
  devRegisterDeviceSchema,
  esp32RegisterDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
  assignDeviceSchema,
  unassignDeviceSchema,
  createConfigSchema,
  acknowledgeConfigSchema,
  deviceHeartbeatSchema,
} from "../schemas/index.js";

export const registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check if this is an ESP32 hardware registration
    const isEsp32 =
      req.body.registrationSource === "ESP32_WIFI" ||
      req.body.isDevRegistration === false ||
      (Boolean(req.body.hardwareId) && !req.body.name);

    if (isEsp32) {
      const validated = esp32RegisterDeviceSchema.parse(req.body);
      const { device, isNew } = await deviceService.registerEsp32Device(validated);
      res.status(isNew ? 201 : 200).json({
        status: "success",
        deviceId: device.deviceId,
        token: device.token,
        message: isNew ? "ESP32 device registered successfully" : "ESP32 device already registered (idempotent)",
        data: {
          deviceId: device.deviceId,
          hardwareId: device.hardwareId,
          token: device.token,
          name: device.name,
          status: device.status,
          registered: true,
          isNew,
        },
      });
      return;
    }

    // Default to dev registration validation (requires isDevRegistration: true)
    const validated = devRegisterDeviceSchema.parse(req.body);
    const device = await deviceService.registerDevice(validated);
    res.status(201).json({
      status: "success",
      deviceId: device.deviceId,
      token: device.token,
      message: "Device registered via development provisioning",
      data: device,
    });
  } catch (err) {
    next(err);
  }
};

export const registerEsp32 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = esp32RegisterDeviceSchema.parse(req.body);
    const { device, isNew } = await deviceService.registerEsp32Device(validated);
    res.status(isNew ? 201 : 200).json({
      status: "success",
      deviceId: device.deviceId,
      token: device.token,
      message: isNew ? "ESP32 device registered successfully" : "ESP32 device already registered (idempotent)",
      data: {
        deviceId: device.deviceId,
        hardwareId: device.hardwareId,
        token: device.token,
        name: device.name,
        status: device.status,
        registered: true,
        isNew,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const discoverDevices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const devices = await deviceService.discoverWifiDevices();
    res.status(200).json({
      status: "success",
      message: "Scanned local Wi-Fi network for available NPG / ESP32 devices",
      data: devices,
    });
  } catch (err) {
    next(err);
  }
};

export const connectWifiDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { hardwareId, name, firmwareVersion, ipAddress } = req.body;
    if (!hardwareId) {
      throw new AppError(400, "MISSING_HARDWARE_ID", "hardwareId is required to connect to device");
    }

    const result = await deviceService.connectWifiDevice({
      hardwareId,
      name,
      firmwareVersion,
      ipAddress,
      registeredBy: req.body.registeredBy,
    });

    res.status(200).json({
      status: "success",
      message: `Device '${result.device?.name || hardwareId}' connected successfully via Wi-Fi`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const listDevices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = listDevicesQuerySchema.parse(req.query);
    const result = await deviceService.listDevices(
      query.page,
      query.limit,
      query.status,
      query.connectivityStatus,
      query.registeredBy
    );
    res.status(200).json({
      status: "success",
      data: result.items,
      meta: result.meta,
    });
  } catch (err) {
    next(err);
  }
};

export const getDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const device = await deviceService.getDeviceByDeviceId(deviceId);
    res.status(200).json({
      status: "success",
      data: device,
    });
  } catch (err) {
    next(err);
  }
};

export const updateDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const validated = updateDeviceSchema.parse(req.body);
    const updated = await deviceService.updateDevice(deviceId, validated);
    res.status(200).json({
      status: "success",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const getDeviceAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const assignments = await deviceService.getDeviceAssignments(deviceId);
    res.status(200).json({
      status: "success",
      data: assignments,
    });
  } catch (err) {
    next(err);
  }
};

export const assignDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const validated = assignDeviceSchema.parse(req.body);
    const isNurse = (req as any).user?.role === "nurse";
    const requireOnline = validated.requireOnline ?? (isNurse ? true : undefined);
    const assignment = await assignmentService.assignDevice({
      deviceId,
      patientCode: validated.patientCode,
      assignedBy: validated.assignedBy,
      reassign: validated.reassign,
      requireOnline,
    });
    res.status(200).json({
      status: "success",
      message: "Device assigned successfully",
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

export const unassignDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const validated = unassignDeviceSchema.parse(req.body);
    const assignment = await assignmentService.unassignDevice({
      deviceId,
      notes: validated.notes,
    });
    res.status(200).json({
      status: "success",
      message: "Device unassigned successfully",
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

export const createDeviceConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const validated = createConfigSchema.parse(req.body);
    const config = await configService.createDesiredConfig({
      deviceId,
      mappings: validated.mappings,
    });
    res.status(201).json({
      status: "success",
      message: "Desired device configuration created (PENDING delivery to hardware)",
      data: config,
    });
  } catch (err) {
    next(err);
  }
};

export const getLatestDeviceConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const config = await configService.getLatestConfig(deviceId);
    res.status(200).json({
      status: "success",
      data: config,
    });
  } catch (err) {
    next(err);
  }
};

export const getDeviceConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const configs = await configService.getDeviceConfigs(deviceId);
    res.status(200).json({
      status: "success",
      data: configs,
    });
  } catch (err) {
    next(err);
  }
};

export const acknowledgeDeviceConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { deviceId, version } = req.params;
    const parsedVersion = parseInt(version, 10);
    if (isNaN(parsedVersion) || parsedVersion < 1) {
      throw new AppError(400, "INVALID_VERSION", "Configuration version in URL parameter must be a positive integer");
    }

    const validated = acknowledgeConfigSchema.parse(req.body);
    const result = await configService.acknowledgeConfig(deviceId, parsedVersion, validated);

    res.status(200).json({
      status: "success",
      message: result.isIdempotent
        ? `Configuration v${parsedVersion} was already confirmed as APPLIED`
        : `Configuration v${parsedVersion} acknowledgement recorded as ${validated.status}`,
      data: result.config,
      isIdempotent: result.isIdempotent,
    });
  } catch (err) {
    next(err);
  }
};

export const deviceHeartbeat = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const validated = deviceHeartbeatSchema.parse(req.body);
    const identifier = req.params.deviceId || validated.deviceId || validated.hardwareId || (req.headers["x-device-id"] as string);

    if (!identifier && !bearerToken) {
      throw new AppError(400, "MISSING_DEVICE_ID", "deviceId, hardwareId, or Authorization header must be provided");
    }

    const { device: updated, silenceAlarm } = await deviceService.recordHeartbeat(identifier || "", validated, bearerToken);

    res.status(200).json({
      desiredConfigVersion: updated.desiredConfigVersion || 1,
      silenceAlarm,
      status: "success",
      message: "Device heartbeat processed successfully",
      data: {
        deviceId: updated.deviceId,
        hardwareId: updated.hardwareId,
        status: updated.status,
        connectivityStatus: updated.connectivityStatus,
        lastSeenAt: updated.lastSeenAt,
        firmwareVersion: updated.firmwareVersion,
        batteryLevel: updated.batteryLevel,
        appliedConfigVersion: updated.appliedConfigVersion,
        desiredConfigVersion: updated.desiredConfigVersion,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getDeviceCommunicationState = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const state = await patientCommunicationService.getForActiveDevice(deviceId);
    res.status(200).json({
      status: "success",
      data: state,
    });
  } catch (err) {
    next(err);
  }
};

