import { Router } from "express";
import {
  registerDevice,
  registerEsp32,
  discoverDevices,
  connectWifiDevice,
  listDevices,
  getDevice,
  updateDevice,
  getDeviceAssignments,
  assignDevice,
  unassignDevice,
  createDeviceConfig,
  getLatestDeviceConfig,
  getDeviceConfigs,
  acknowledgeDeviceConfig,
  deviceHeartbeat,
} from "../controllers/deviceController.js";

export const deviceRouter = Router();

// Device Discovery & Wi-Fi Pairing
deviceRouter.get("/discover", discoverDevices);
deviceRouter.post("/wifi-connect", connectWifiDevice);

// Device CRUD & Registration
deviceRouter.post("/", registerDevice);
deviceRouter.post("/register", registerEsp32);
deviceRouter.post("/esp32/register", registerEsp32);
deviceRouter.get("/", listDevices);
deviceRouter.get("/:deviceId", getDevice);
deviceRouter.patch("/:deviceId", updateDevice);

// Assignments
deviceRouter.get("/:deviceId/assignments", getDeviceAssignments);
deviceRouter.post("/:deviceId/assign", assignDevice);
deviceRouter.post("/:deviceId/unassign", unassignDevice);

// Versioned Gesture Configurations & Acknowledgement
deviceRouter.get("/:deviceId/config", getLatestDeviceConfig);
deviceRouter.get("/:deviceId/configs/latest", getLatestDeviceConfig);
deviceRouter.get("/:deviceId/configs", getDeviceConfigs);
deviceRouter.post("/:deviceId/configs", createDeviceConfig);
deviceRouter.post("/:deviceId/configs/:version/ack", acknowledgeDeviceConfig);

// Telemetry & Device Heartbeat
deviceRouter.post("/:deviceId/heartbeat", deviceHeartbeat);
deviceRouter.post("/heartbeat", deviceHeartbeat);
deviceRouter.post("/esp32/heartbeat", deviceHeartbeat);

