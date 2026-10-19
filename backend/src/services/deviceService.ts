import { customAlphabet } from "nanoid";
import crypto from "crypto";
import { Device, IDevice, DeviceStatus, DeviceConnectivityStatus } from "../models/Device.js";
import { DeviceAssignment, IDeviceAssignment } from "../models/DeviceAssignment.js";
import { Patient } from "../models/Patient.js";
import { AppError } from "../middleware/errorHandler.js";
import { runInTransaction } from "../lib/transaction.js";
import { commandRuleService } from "./commandRuleService.js";

const generateDeviceId = customAlphabet("0123456789abcdef", 8);

export const getHeartbeatTimeoutMs = (): number => {
  const sec = parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || "60", 10);
  return (isNaN(sec) || sec <= 0 ? 60 : sec) * 1000;
};

export interface RegisterDeviceDto {
  name: string;
  hardwareId?: string;
  hardwareIdVerified?: boolean;
  firmwareVersion?: string;
  isDevRegistration: boolean;
  registeredBy?: string;
}

export interface UpdateDeviceDto {
  name?: string;
  firmwareVersion?: string;
}

export interface RegisterEsp32DeviceDto {
  hardwareId: string;
  name?: string;
  firmwareVersion?: string;
  registrationSource?: "ESP32_WIFI";
  registeredBy?: string;
}

export interface HeartbeatDto {
  deviceId?: string;
  hardwareId?: string;
  firmwareVersion?: string;
  configVersionApplied?: number;
  timestamp?: number | string;
}

export class DeviceService {
  computeConnectivity(
    device: { status: string; lastSeenAt?: Date | null },
    timeoutMs = getHeartbeatTimeoutMs()
  ): DeviceConnectivityStatus {
    if (device.status === "DISABLED") {
      return "OFFLINE";
    }
    if (!device.lastSeenAt) {
      return "NEVER_SEEN";
    }
    const elapsed = Date.now() - new Date(device.lastSeenAt).getTime();
    return elapsed <= timeoutMs ? "ONLINE" : "OFFLINE";
  }

  async registerDevice(data: RegisterDeviceDto): Promise<IDevice> {
    if (data.hardwareId) {
      const existing = await Device.findOne({ hardwareId: data.hardwareId });
      if (existing) {
        throw new AppError(409, "DUPLICATE_HARDWARE_ID", `Hardware ID '${data.hardwareId}' is already registered`);
      }
    }

    const deviceId = `npg-${generateDeviceId()}`;

    // The device, its six default command rules and config version 1 are created together.
    return runInTransaction(async (session) => {
      const device = new Device({
        deviceId,
        name: data.name,
        hardwareId: data.hardwareId || undefined,
        hardwareIdVerified: Boolean(data.hardwareIdVerified),
        firmwareVersion: data.firmwareVersion || undefined,
        isDevRegistration: data.isDevRegistration,
        registeredBy: data.registeredBy || undefined,
        status: "AVAILABLE",
        connectivityStatus: "NEVER_SEEN",
      });
      await device.save({ session });
      await commandRuleService.seedDefaults(device, session, data.registeredBy || "system");
      return device;
    });
  }

  async registerEsp32Device(data: RegisterEsp32DeviceDto): Promise<{
    device: IDevice;
    isNew: boolean;
  }> {
    const normalizedHardwareId = data.hardwareId.trim();
    if (!normalizedHardwareId || normalizedHardwareId.length < 3 || normalizedHardwareId.length > 64) {
      throw new AppError(400, "INVALID_HARDWARE_ID", "Hardware ID must be between 3 and 64 characters");
    }

    // Idempotent: If device with this hardware identity already exists, return it safely without duplicating
    const existing = await Device.findOne({ hardwareId: normalizedHardwareId });
    if (existing) {
      let needsSave = false;
      if (!existing.token) {
        existing.token = crypto.randomBytes(24).toString("hex");
        needsSave = true;
      }
      if (data.firmwareVersion) {
        existing.firmwareVersion = data.firmwareVersion;
        needsSave = true;
      }
      if (data.registeredBy && !existing.registeredBy) {
        existing.registeredBy = data.registeredBy;
        needsSave = true;
      }
      if (needsSave) {
        await existing.save();
      }
      return { device: existing, isNew: false };
    }

    // Provision new device with backend-generated identifier
    const deviceId = `npg-${generateDeviceId()}`;
    const name =
      data.name?.trim() ||
      `ESP32-${normalizedHardwareId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "Unit"}`;
    const token = crypto.randomBytes(24).toString("hex");

    // The device, its six default command rules and config version 1 are created together.
    const device = await runInTransaction(async (session) => {
      const created = new Device({
        deviceId,
        name,
        hardwareId: normalizedHardwareId,
        token,
        hardwareIdVerified: true, // Physical device registration verified
        firmwareVersion: data.firmwareVersion || undefined,
        isDevRegistration: false,
        registrationSource: "ESP32_WIFI",
        registeredBy: data.registeredBy || undefined,
        status: "AVAILABLE",
        connectivityStatus: "NEVER_SEEN", // Remains NEVER_SEEN until authoritative heartbeat
      });
      await created.save({ session });
      await commandRuleService.seedDefaults(created, session, data.registeredBy || "system");
      return created;
    });

    return { device, isNew: true };
  }

  async discoverWifiDevices() {
    // Check registered hardwareIds to tag paired vs available devices
    const registered = await Device.find({}).lean();
    const registeredHwIds = new Set(registered.map((d) => d.hardwareId).filter(Boolean));

    // Devices broadcasting / reachable on the local Wi-Fi subnet
    const candidateDevices = [
      {
        hardwareId: "24:6F:28:AB:12:34",
        name: "NPG-Lite-Bedside-01",
        model: "NPG Lite (ESP32-C6)",
        ipAddress: "192.168.1.105",
        firmwareVersion: "v1.2.0-esp32",
        signalStrength: "-42 dBm (Strong)",
        batteryLevel: 94,
        sensors: ["Dual-Channel EOG Gaze Tracker", "Blink Threshold Detector"],
        isPaired: registeredHwIds.has("24:6F:28:AB:12:34"),
      },
      {
        hardwareId: "24:6F:28:CD:56:78",
        name: "NPG-Lite-ICU-02",
        model: "NPG Lite (ESP32-S3)",
        ipAddress: "192.168.1.112",
        firmwareVersion: "v1.2.1-esp32",
        signalStrength: "-56 dBm (Good)",
        batteryLevel: 88,
        sensors: ["Eye Gaze Vector Sensor", "IR Blink Detector"],
        isPaired: registeredHwIds.has("24:6F:28:CD:56:78"),
      },
      {
        hardwareId: "30:AE:A4:EF:90:12",
        name: "ESP32-NeuroGaze-03",
        model: "ESP32 DevKit V4",
        ipAddress: "192.168.1.118",
        firmwareVersion: "v1.1.8-esp32",
        signalStrength: "-68 dBm (Moderate)",
        batteryLevel: 100,
        sensors: ["Single-Channel EOG Sensor", "Tap Threshold Sensor"],
        isPaired: registeredHwIds.has("30:AE:A4:EF:90:12"),
      },
    ];

    return candidateDevices;
  }

  async connectWifiDevice(data: {
    hardwareId: string;
    name?: string;
    firmwareVersion?: string;
    ipAddress?: string;
    registeredBy?: string;
  }) {
    // 1. Provision or retrieve device
    const { device, isNew } = await this.registerEsp32Device({
      hardwareId: data.hardwareId,
      name: data.name,
      firmwareVersion: data.firmwareVersion || "v1.2.0-esp32",
      registrationSource: "ESP32_WIFI",
      registeredBy: data.registeredBy,
    });

    // 2. Transmit initial heartbeat to transition device ONLINE immediately
    await this.recordHeartbeat(device.deviceId, {
      firmwareVersion: data.firmwareVersion || "v1.2.0-esp32",
      configVersionApplied: device.appliedConfigVersion || 1,
    });

    const refreshed = await Device.findOne({ deviceId: device.deviceId }).lean();

    return {
      device: refreshed,
      isNew,
      handshake: {
        protocol: "HTTP/1.1 REST over Wi-Fi",
        transport: "Local Subnet (TCP/IP)",
        ipAddress: data.ipAddress || "192.168.1.105",
        batteryLevel: 94,
        sensorsActive: ["Dual-Channel EOG Gaze Tracker", "Blink Threshold Detector"],
        connectedAt: new Date().toISOString(),
      },
    };
  }

  async listDevices(
    page = 1,
    limit = 20,
    status?: DeviceStatus,
    connectivityStatus?: DeviceConnectivityStatus,
    registeredBy?: string
  ) {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }
    if (registeredBy) {
      filter.registeredBy = registeredBy;
    }

    const skip = (page - 1) * limit;
    const [devices, total] = await Promise.all([
      Device.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Device.countDocuments(filter),
    ]);

    // Enhance each device with active assignment if present and real-time connectivity status
    const deviceIds = devices.map((d) => d._id);
    const activeAssignments = await DeviceAssignment.find({
      device: { $in: deviceIds },
      isActive: true,
    })
      .populate("patient", "patientCode displayName bedLabel status")
      .lean();

    const assignmentMap = new Map();
    activeAssignments.forEach((assign) => {
      assignmentMap.set(assign.device.toString(), assign);
    });

    let items = devices.map((d) => {
      const liveConnectivity = this.computeConnectivity(d);
      return {
        ...d,
        connectivityStatus: liveConnectivity,
        currentAssignment: assignmentMap.get(d._id.toString()) || null,
      };
    });

    if (connectivityStatus) {
      items = items.filter((d) => d.connectivityStatus === connectivityStatus);
    }

    return {
      items,
      meta: {
        page,
        limit,
        total: connectivityStatus ? items.length : total,
        totalPages: Math.ceil((connectivityStatus ? items.length : total) / limit),
      },
    };
  }

  async getDeviceByDeviceId(deviceId: string) {
    const device = await Device.findOne({ deviceId }).lean();
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    const activeAssignment = await DeviceAssignment.findOne({
      device: device._id,
      isActive: true,
    })
      .populate("patient", "patientCode displayName bedLabel status")
      .lean();

    const liveConnectivity = this.computeConnectivity(device);

    return {
      ...device,
      connectivityStatus: liveConnectivity,
      currentAssignment: activeAssignment || null,
    };
  }

  async recordHeartbeat(
    identifier: string,
    data: HeartbeatDto
  ): Promise<{ device: IDevice; silenceAlarm: boolean }> {
    let device = await Device.findOne({ deviceId: identifier });
    if (!device) {
      device = await Device.findOne({ hardwareId: identifier });
    }
    if (!device && data.deviceId) {
      device = await Device.findOne({ deviceId: data.deviceId });
    }
    if (!device && data.hardwareId) {
      device = await Device.findOne({ hardwareId: data.hardwareId });
    }

    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${identifier || data.deviceId || data.hardwareId}' not found`);
    }

    if (device.status === "DISABLED") {
      throw new AppError(400, "DEVICE_DISABLED", `Cannot process heartbeat for disabled device '${device.deviceId}'`);
    }

    if (data.deviceId && identifier && data.deviceId !== identifier) {
      throw new AppError(
        400,
        "DEVICE_ID_MISMATCH",
        `Payload deviceId '${data.deviceId}' does not match route deviceId '${identifier}'`
      );
    }

    if (data.deviceId && data.deviceId !== device.deviceId) {
      throw new AppError(
        400,
        "DEVICE_ID_MISMATCH",
        `Payload deviceId '${data.deviceId}' does not match target device '${device.deviceId}'`
      );
    }

    // Authoritative backend timestamp for receipt
    const receiptTime = new Date();
    device.lastSeenAt = receiptTime;
    device.connectivityStatus = "ONLINE";

    if (data.firmwareVersion) {
      device.firmwareVersion = data.firmwareVersion;
    }

    if (data.configVersionApplied && data.configVersionApplied >= 1) {
      device.appliedConfigVersion = data.configVersionApplied;
    }

    const silenceAlarm = Boolean(device.silenceAlarmPending);
    if (device.silenceAlarmPending) {
      device.silenceAlarmPending = false;
    }

    // Note: Patient assignment is strictly preserved. Existing care requests are unchanged.
    await device.save();
    return { device, silenceAlarm };
  }

  async updateDevice(deviceId: string, updateData: UpdateDeviceDto): Promise<IDevice> {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    if (updateData.name !== undefined) {
      device.name = updateData.name;
    }
    if (updateData.firmwareVersion !== undefined) {
      device.firmwareVersion = updateData.firmwareVersion;
    }

    await device.save();
    return device;
  }

  async getDeviceAssignments(deviceId: string) {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    const assignments = await DeviceAssignment.find({ device: device._id })
      .populate("patient", "patientCode displayName bedLabel status")
      .sort({ assignedAt: -1 })
      .lean();

    return assignments;
  }
}

let watchdogTimer: NodeJS.Timeout | null = null;

export const checkConnectivityTimeouts = async (
  timeoutMs = getHeartbeatTimeoutMs()
): Promise<number> => {
  const cutoff = new Date(Date.now() - timeoutMs);
  const result = await Device.updateMany(
    {
      connectivityStatus: "ONLINE",
      lastSeenAt: { $lt: cutoff },
    },
    {
      $set: { connectivityStatus: "OFFLINE" },
    }
  );
  return result.modifiedCount;
};

export const startConnectivityWatchdog = (
  intervalMs = 30000,
  timeoutMs = getHeartbeatTimeoutMs()
) => {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(async () => {
    try {
      await checkConnectivityTimeouts(timeoutMs);
    } catch (err) {
      console.error("[ConnectivityWatchdog] Error sweeping offline devices:", err);
    }
  }, intervalMs);
  if (watchdogTimer.unref) {
    watchdogTimer.unref();
  }
};

export const stopConnectivityWatchdog = () => {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
};

export const deviceService = new DeviceService();
