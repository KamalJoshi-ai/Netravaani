import { Device } from "../models/Device.js";
import { DeviceConfig, IDeviceConfig, IGestureMapping } from "../models/DeviceConfig.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { AppError } from "../middleware/errorHandler.js";

export interface CreateConfigDto {
  deviceId: string;
  mappings: IGestureMapping[];
}

export interface AcknowledgeConfigDto {
  status: "APPLIED" | "FAILED";
  failureReason?: string;
  isDevSimulated?: boolean;
}

export class ConfigService {
  async createDesiredConfig(dto: CreateConfigDto): Promise<IDeviceConfig> {
    const { deviceId, mappings } = dto;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    if (device.status === "DISABLED") {
      throw new AppError(400, "DEVICE_DISABLED", `Cannot configure disabled device '${deviceId}'`);
    }

    // Verify device has an active assignment before allowing patient configuration
    const activeAssignment = await DeviceAssignment.findOne({
      device: device._id,
      isActive: true,
    });

    if (!activeAssignment || device.status !== "ASSIGNED") {
      throw new AppError(
        400,
        "DEVICE_NOT_ASSIGNED",
        `Cannot create patient configuration for device '${deviceId}' because it is not currently assigned to any active patient`
      );
    }

    // Find latest version to increment safely
    const latestConfig = await DeviceConfig.findOne({ device: device._id })
      .sort({ version: -1 })
      .lean();

    const nextVersion = latestConfig ? latestConfig.version + 1 : 1;

    // Create new immutable desired configuration record
    const config = await DeviceConfig.create({
      device: device._id,
      version: nextVersion,
      mappings,
      status: "PENDING", // PENDING desired state; never claim ESP32 applied it yet
    });

    // Update device record with latest desired configuration version
    device.desiredConfigVersion = nextVersion;
    await device.save();

    return config;
  }

  async acknowledgeConfig(
    deviceId: string,
    version: number,
    dto: AcknowledgeConfigDto
  ): Promise<{ config: IDeviceConfig; isIdempotent: boolean }> {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    if (isNaN(version) || version < 1) {
      throw new AppError(400, "INVALID_VERSION", "Configuration version must be a positive integer");
    }

    const config = await DeviceConfig.findOne({ device: device._id, version });
    if (!config) {
      throw new AppError(
        404,
        "CONFIG_NOT_FOUND",
        `Configuration version ${version} not found for device '${deviceId}'`
      );
    }

    // If already APPLIED
    if (config.status === "APPLIED") {
      if (dto.status === "APPLIED") {
        // Idempotent duplicate ack
        return { config, isIdempotent: true };
      }
      if (dto.status === "FAILED") {
        throw new AppError(
          400,
          "INVALID_STATE_TRANSITION",
          `Cannot mark configuration v${version} as FAILED because it has already been confirmed as APPLIED`
        );
      }
    }

    if (dto.status === "APPLIED") {
      config.status = "APPLIED";
      config.appliedAt = new Date();
      config.failureReason = undefined;
      await config.save();

      // Only update device's appliedConfigVersion if this version is >= current appliedConfigVersion
      // (prevents an older delayed acknowledgement from downgrading the device's applied version if a newer one was applied)
      if (!device.appliedConfigVersion || version >= device.appliedConfigVersion) {
        device.appliedConfigVersion = version;
        await device.save();
      }
    } else if (dto.status === "FAILED") {
      config.status = "FAILED";
      config.failureReason = dto.failureReason || "Hardware application failed";
      await config.save();
      // Do not update device.appliedConfigVersion on failure
    }

    return { config, isIdempotent: false };
  }

  async getLatestConfig(deviceId: string): Promise<IDeviceConfig | null> {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    const latest = await DeviceConfig.findOne({ device: device._id })
      .sort({ version: -1 })
      .lean();

    return latest as unknown as IDeviceConfig | null;
  }

  async getDeviceConfigs(deviceId: string): Promise<IDeviceConfig[]> {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    const configs = await DeviceConfig.find({ device: device._id })
      .sort({ version: -1 })
      .lean();

    return configs as unknown as IDeviceConfig[];
  }
}

export const configService = new ConfigService();
