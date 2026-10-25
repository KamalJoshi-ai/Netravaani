import { z } from "zod";
import { DeviceStatusEnum, DeviceConnectivityStatusEnum } from "../models/Device.js";
import { PatientStatusEnum } from "../models/Patient.js";
import { RequestActionEnum } from "../models/DeviceConfig.js";
import { CareRequestStatusEnum } from "../models/CareRequest.js";

// Hardware Identity Validator & Regex
export const HARDWARE_ID_REGEX = /^[a-zA-Z0-9_\-:]+$/;

export const hardwareIdValidator = z
  .string({
    required_error: "hardwareId is required",
    invalid_type_error: "hardwareId must be a string",
  })
  .trim()
  .min(3, "hardwareId must be at least 3 characters")
  .max(64, "hardwareId cannot exceed 64 characters")
  .regex(HARDWARE_ID_REGEX, "hardwareId must contain only alphanumeric characters, colons, hyphens, or underscores");

// Device Schemas
export const devRegisterDeviceSchema = z.object({
  name: z.string().trim().min(2, "Device name must be at least 2 characters").max(60),
  hardwareId: z.string().trim().min(3).max(64).regex(HARDWARE_ID_REGEX, "hardwareId must contain only alphanumeric characters, colons, hyphens, or underscores").optional(),
  hardwareIdVerified: z.boolean().default(false).optional(),
  firmwareVersion: z.string().trim().max(30).optional(),
  registeredBy: z.string().trim().optional(),
  isDevRegistration: z.literal(true, {
    errorMap: () => ({
      message: "Direct registration endpoint is for development/test purposes only and requires isDevRegistration: true",
    }),
  }),
});

export const esp32RegisterDeviceSchema = z.object({
  hardwareId: hardwareIdValidator,
  name: z.string().trim().min(2, "Device name must be at least 2 characters").max(60).optional(),
  firmwareVersion: z.string().trim().max(30).optional(),
  registeredBy: z.string().trim().optional(),
  registrationSource: z.literal("ESP32_WIFI").optional(),
  isDevRegistration: z.literal(false).optional(),
});

export const registerDeviceSchema = devRegisterDeviceSchema;

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  firmwareVersion: z.string().trim().max(30).optional(),
});

export const listDevicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(DeviceStatusEnum).optional(),
  connectivityStatus: z.enum(DeviceConnectivityStatusEnum).optional(),
  registeredBy: z.string().trim().optional(),
});

// Device Configuration Acknowledgement Schema
export const acknowledgeConfigSchema = z
  .object({
    status: z.enum(["APPLIED", "FAILED"], {
      errorMap: () => ({ message: "Status must be either APPLIED or FAILED" }),
    }),
    failureReason: z.string().trim().max(300).optional(),
    isDevSimulated: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.status === "FAILED" && !data.failureReason) {
        return false;
      }
      return true;
    },
    {
      message: "failureReason is required when acknowledging configuration status as FAILED",
      path: ["failureReason"],
    }
  );

// Device Heartbeat Schema
export const deviceHeartbeatSchema = z.object({
  deviceId: z.string().trim().optional(),
  hardwareId: z.string().trim().optional(),
  firmwareVersion: z.string().trim().max(30).optional(),
  configVersionApplied: z.coerce.number().int().min(1).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

// Patient Schemas
export const createPatientSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(100),
  bedLabel: z.string().trim().max(30).optional(),
  status: z.enum(PatientStatusEnum).default("ACTIVE"),
  deviceId: z.string().trim().optional(),
});

export const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PatientStatusEnum).optional(),
});

// Assignment Schemas
export const assignDeviceSchema = z.object({
  patientCode: z.string().trim().min(1, "patientCode is required"),
  assignedBy: z.string().trim().max(60).optional(),
  reassign: z.boolean().optional(),
  requireOnline: z.boolean().optional(),
});

export const unassignDeviceSchema = z.object({
  notes: z.string().trim().max(200).optional(),
});

// Gesture Mapping Schemas
export const gestureMappingSchema = z
  .object({
    gestureId: z.string().trim().min(1, "Gesture identifier is required").max(64).optional(),
    gesture: z.string().trim().min(1).max(64).optional(),
    gestureName: z.string().trim().min(1).max(80).optional(),
    action: z.enum(RequestActionEnum, {
      errorMap: () => ({
        message: `Invalid action. Must be one of: ${RequestActionEnum.join(", ")}`,
      }),
    }),
    instruction: z.string().trim().max(250).optional(),
  })
  .refine((data) => Boolean(data.gestureId || data.gesture), {
    message: "Gesture identifier is required",
    path: ["gestureId"],
  })
  .transform((data) => {
    const gestureId = (data.gestureId || data.gesture || "").toUpperCase();
    return {
      gestureId,
      gestureName: data.gestureName?.trim() || gestureId,
      action: data.action,
      instruction: data.instruction?.trim() || undefined,
    };
  });

export const createConfigSchema = z
  .object({
    mappings: z.array(gestureMappingSchema).min(1, "At least one gesture mapping is required"),
  })
  .refine(
    (data) => {
      const ids = data.mappings.map((m) => m.gestureId.toLowerCase());
      return new Set(ids).size === ids.length;
    },
    {
      message: "Duplicate gesture identifiers are not allowed within the same configuration",
      path: ["mappings"],
    }
  );

// Phase 4: Device Event & Care Request Schemas
export const deviceEventSchema = z.object({
  eventId: z.string().trim().min(1, "eventId is required").max(100),
  deviceId: z.string().trim().min(1, "deviceId is required"),
  eventType: z.string().trim().optional(),
  gestureId: z.string().trim().max(64).optional(),
  gesture: z.string().trim().max(64).optional(),
  action: z.string().trim().optional(),
  urgent: z.boolean().optional(),
  configVersion: z.coerce.number().int().min(1, "configVersion must be a positive integer").optional(),
  occurredAt: z.union([z.string(), z.number()]).optional(),
  appliedVersion: z.coerce.number().int().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  // Firmware nv-4.0.0 command rules
  ruleId: z.string().trim().max(24).optional(),
  label: z.string().max(40).optional(),
  alarm: z.boolean().optional(),
  counts: z
    .object({
      eog: z.coerce.number().int().min(0).default(0),
      emgLeft: z.coerce.number().int().min(0).default(0),
      emgRight: z.coerce.number().int().min(0).default(0),
      together: z.coerce.number().int().min(0).default(0),
    })
    .optional(),
  rejectedVersion: z.coerce.number().int().optional(),
  error: z.string().max(200).optional(),
});

// Command rule editor (PUT /api/devices/:id/rules). Only the shape is checked
// here; the shared firmware validator decides what is allowed and returns 422.
const countRange = z.tuple([z.number(), z.number()]);
export const commandRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  displayLabel: z.string().max(80).optional().nullable().transform((v) => v ?? undefined),
  speechTemplate: z.string().max(120).optional().nullable().transform((v) => v ?? undefined),
  eog: countRange,
  emgLeft: countRange,
  emgRight: countRange,
  simultaneous: z.boolean().optional(),
  urgent: z.boolean().optional(),
  alarm: z.boolean().optional(),
});
export const saveCommandRulesSchema = z.object({
  rules: z.array(commandRuleSchema).max(50),
});

export const listCareRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(CareRequestStatusEnum).optional(),
  deviceId: z.string().trim().optional(),
  patientCode: z.string().trim().optional(),
});
