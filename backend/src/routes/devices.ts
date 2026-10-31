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
  getDeviceCommunicationState,
} from "../controllers/deviceController.js";
import {
  getDeviceCommands,
  saveDeviceCommands,
  resetDeviceCommands,
  revertDeviceCommands,
} from "../controllers/deviceCommandController.js";
import {
  getDeviceConfigPayload,
  getCommandRules,
  saveCommandRules,
  resetCommandRules,
  revertCommandRules,
} from "../controllers/commandRuleController.js";
import { requireRole, DEVICE_CONFIG_ROLES } from "../middleware/requireRole.js";

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
deviceRouter.get("/:deviceId/communication-state", getDeviceCommunicationState);
deviceRouter.patch("/:deviceId", updateDevice);

// Assignments
deviceRouter.get("/:deviceId/assignments", getDeviceAssignments);
deviceRouter.post("/:deviceId/assign", assignDevice);
deviceRouter.post("/:deviceId/unassign", unassignDevice);

// Device-facing config download (firmware nv-5.0.0 commands, compact JSON)
deviceRouter.get("/:deviceId/config", getDeviceConfigPayload);
deviceRouter.get("/config", getDeviceConfigPayload);

// Per-device commands editor (firmware nv-5.0.0, staff roles only)
const canConfigure = requireRole(DEVICE_CONFIG_ROLES);
deviceRouter.get("/:deviceId/commands", canConfigure, getDeviceCommands);
deviceRouter.put("/:deviceId/commands", canConfigure, saveDeviceCommands);
deviceRouter.post("/:deviceId/commands/reset", canConfigure, resetDeviceCommands);
deviceRouter.post("/:deviceId/commands/revert/:version", canConfigure, revertDeviceCommands);

// Command rule editor (legacy firmware nv-4.0.0, staff roles only)
deviceRouter.get("/:deviceId/rules", canConfigure, getCommandRules);
deviceRouter.put("/:deviceId/rules", canConfigure, saveCommandRules);
deviceRouter.post("/:deviceId/rules/reset", canConfigure, resetCommandRules);
deviceRouter.post("/:deviceId/rules/revert/:version", canConfigure, revertCommandRules);

// Versioned Gesture Configurations & Acknowledgement (legacy dashboard)
deviceRouter.get("/:deviceId/configs/latest", getLatestDeviceConfig);
deviceRouter.get("/:deviceId/configs", getDeviceConfigs);
deviceRouter.post("/:deviceId/configs", createDeviceConfig);
deviceRouter.post("/:deviceId/configs/:version/ack", acknowledgeDeviceConfig);

// Telemetry & Device Heartbeat
deviceRouter.post("/:deviceId/heartbeat", deviceHeartbeat);
deviceRouter.post("/heartbeat", deviceHeartbeat);
deviceRouter.post("/esp32/heartbeat", deviceHeartbeat);

