import { Types } from "mongoose";
import { Device } from "../models/Device.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { DeviceConfig, RequestActionEnum } from "../models/DeviceConfig.js";
import { CareRequest, ICareRequest, CareRequestStatus } from "../models/CareRequest.js";
import { Patient } from "../models/Patient.js";
import { AppError } from "../middleware/errorHandler.js";
import { commandRuleService } from "./commandRuleService.js";
import { CommandRule } from "../models/CommandRule.js";
import { speechTemplateFor } from "../shared/speechDefaults.js";

export interface IngestDeviceEventDto {
  eventId: string;
  deviceId: string;
  eventType?: string;
  gestureId?: string;
  gesture?: string;
  action?: string;
  urgent?: boolean;
  configVersion?: number;
  occurredAt?: string | number;
  appliedVersion?: number;
  timestamp?: string | number;
  // Firmware nv-4.0.0 command rules
  ruleId?: string;
  label?: string;
  alarm?: boolean;
  counts?: { eog: number; emgLeft: number; emgRight: number; together: number };
  rejectedVersion?: number;
  error?: string;
}

/** Legacy action for the default rule ids, so older dashboard views keep working. */
const RULE_ACTION: Record<string, string> = {
  yes: "YES",
  no: "NO",
  water: "WATER",
  call_nurse: "CALL_NURSE",
  adjustment: "REPOSITION",
  emergency: "EMERGENCY",
};

export interface ListCareRequestsQuery {
  page?: number;
  limit?: number;
  status?: CareRequestStatus;
  deviceId?: string;
  patientCode?: string;
}

export function normalizeHardwareSerialCommand(input: string): {
  action: any;
  gestureId: string;
  gestureName: string;
  urgent?: boolean;
} | null {
  if (!input) return null;
  const clean = input.replace(/^\[cmd\]\s*/i, "").trim().toUpperCase();
  if (clean === "YES" || clean.includes("BLINK_2") || clean.includes("2 BLINKS")) {
    return { action: "YES", gestureId: "BLINK_2", gestureName: "2 blinks, wait" };
  }
  if (clean === "WATER" || clean === "NEED_WATER" || clean.includes("BLINK_4") || clean.includes("4+ BLINKS")) {
    return { action: "WATER", gestureId: "BLINK_4_PLUS", gestureName: "4+ blinks" };
  }
  if (clean === "NO" || clean.includes("SQUEEZE_BOTH_1") || clean.includes("SQUEEZE BOTH HANDS TOGETHER, ONCE")) {
    return { action: "NO", gestureId: "SQUEEZE_BOTH_1", gestureName: "Squeeze both hands together, once" };
  }
  if (clean === "CALL NURSE" || clean === "CALL_NURSE" || clean.includes("SQUEEZE_LEFT_3") || clean.includes("SQUEEZE LEFT HAND 3 TIMES")) {
    return { action: "CALL_NURSE", gestureId: "SQUEEZE_LEFT_3", gestureName: "Squeeze left hand 3 times", urgent: true };
  }
  if (clean === "EMERGENCY" || clean.includes("EMERGENCY") || clean.includes("SEVERE PAIN") || clean.includes("SQUEEZE_BOTH_3")) {
    return { action: "EMERGENCY", gestureId: "SQUEEZE_BOTH_3", gestureName: "Squeeze both hands together, 3 times", urgent: true };
  }
  return null;
}

export class CareRequestService {
  /**
   * Ingest recognized gesture event from hardware identity
   * Validates device, handles hardware firmware directly or through configured assignments.
   * Handles event deduplication.
   */
  async ingestDeviceEvent(dto: IngestDeviceEventDto): Promise<{ isDuplicate: boolean; careRequest?: ICareRequest; accepted?: boolean }> {
    const { eventId, deviceId, eventType, gestureId, gesture, action, urgent, configVersion, appliedVersion } = dto;
    const { ruleId, label, alarm, counts, rejectedVersion, error } = dto;

    // Deduplication check: return existing if eventId was already processed
    const existing = await CareRequest.findOne({ eventId })
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    if (existing) {
      return {
        isDuplicate: true,
        careRequest: existing,
      };
    }

    // 1. Verify Device
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    if (device.status === "DISABLED") {
      throw new AppError(400, "DEVICE_DISABLED", `Cannot ingest events for disabled device '${deviceId}'`);
    }

    // Update lastSeen and appliedConfigVersion if event indicates config applied
    device.lastSeenAt = new Date();
    device.connectivityStatus = "ONLINE";
    if (eventType === "CONFIG_APPLIED" && appliedVersion) {
      device.appliedConfigVersion = appliedVersion;
      await device.save();
      await commandRuleService.markApplied(device, appliedVersion);
      return { isDuplicate: false, accepted: true };
    }
    if (eventType === "CONFIG_FAILED") {
      // The device keeps running appliedVersion; only rejectedVersion is marked FAILED.
      if (appliedVersion && appliedVersion >= 1) device.appliedConfigVersion = appliedVersion;
      await device.save();
      if (rejectedVersion && rejectedVersion >= 1) {
        await commandRuleService.markFailed(device, rejectedVersion, error);
      }
      return { isDuplicate: false, accepted: true };
    }
    await device.save();

    // Firmware nv-4.0.0: the request names the command rule that fired.
    if (ruleId && (!eventType || eventType === "PATIENT_REQUEST")) {
      const assignment = await DeviceAssignment.findOne({ device: device._id, isActive: true });
      const deviceLabel = (label || "").trim() || ruleId;
      const legacyAction =
        RULE_ACTION[ruleId] ||
        (action && (RequestActionEnum as readonly string[]).includes(action.toUpperCase()) ? action.toUpperCase() : "REQUEST");
      const isAlarm = Boolean(alarm);

      const careRequest = await CareRequest.create({
        eventId,
        device: device._id,
        patient: assignment?.patient || undefined,
        gestureId: ruleId,
        gesture: deviceLabel,
        ruleId,
        label: deviceLabel,
        counts: counts || undefined,
        // An alarm is always urgent, so acknowledging it also silences the board.
        urgent: Boolean(urgent) || isAlarm,
        alarm: isAlarm,
        action: legacyAction,
        configVersion: configVersion || device.appliedConfigVersion || 1,
        status: "NEW",
      });

      const populated = await CareRequest.findById(careRequest._id)
        .populate("device", "deviceId name status")
        .populate("patient", "patientCode displayName bedLabel status");

      return { isDuplicate: false, careRequest: populated || careRequest };
    }

    // If event is not a PATIENT_REQUEST and has no gesture/action, acknowledge it
    if (eventType && eventType !== "PATIENT_REQUEST" && !action && !gestureId && !gesture) {
      return { isDuplicate: false, accepted: true };
    }

    // 2. Patient Assignment & Configuration checks
    const activeAssignment = await DeviceAssignment.findOne({
      device: device._id,
      isActive: true,
    }).populate("patient");

    // If configVersion is explicitly provided, enforce strict production contract
    if (configVersion) {
      if (!activeAssignment || device.status !== "ASSIGNED") {
        throw new AppError(
          400,
          "DEVICE_NOT_ASSIGNED",
          `Device '${deviceId}' is not currently assigned to an active patient`
        );
      }

      const patient = activeAssignment.patient;
      if (!patient) {
        throw new AppError(400, "PATIENT_NOT_FOUND", `Active patient for device '${deviceId}' could not be resolved`);
      }

      const config = await DeviceConfig.findOne({
        device: device._id,
        version: configVersion,
      });

      if (!config) {
        throw new AppError(
          400,
          "CONFIG_VERSION_NOT_FOUND",
          `Configuration version ${configVersion} does not exist for device '${deviceId}'`
        );
      }

      if (config.status === "FAILED") {
        throw new AppError(
          400,
          "CONFIG_INELIGIBLE",
          `Configuration version ${configVersion} is marked as FAILED and is ineligible for events`
        );
      }

      const rawGesture = gesture || gestureId || "";
      const normalizedGestureId = rawGesture.trim().toUpperCase();
      let mapping = config.mappings.find((m) => {
        const id = (m.gestureId || (m as any).gesture || "").toString().trim().toUpperCase();
        return id === normalizedGestureId;
      });

      const serialMatch = normalizeHardwareSerialCommand(rawGesture) || normalizeHardwareSerialCommand(action || "");
      if (!mapping && serialMatch) {
        mapping = {
          gestureId: serialMatch.gestureId,
          gestureName: serialMatch.gestureName,
          action: serialMatch.action,
        } as any;
      }

      if (!mapping) {
        throw new AppError(
          400,
          "GESTURE_NOT_CONFIGURED",
          `Gesture '${rawGesture}' is not configured in version ${configVersion} of device '${deviceId}'`
        );
      }

      const careRequest = await CareRequest.create({
        eventId,
        device: device._id,
        patient: (patient as any)._id || activeAssignment.patient,
        gestureId: normalizedGestureId,
        gesture: gesture || normalizedGestureId,
        urgent: Boolean(urgent),
        action: mapping.action,
        configVersion,
        status: "NEW",
      });

      const populated = await CareRequest.findById(careRequest._id)
        .populate("device", "deviceId name status")
        .populate("patient", "patientCode displayName bedLabel status");

      return {
        isDuplicate: false,
        careRequest: populated || careRequest,
      };
    }

    // Direct firmware mode (e.g. nv-2.0.0 hardware serial tools without pre-created assignment)
    let resolvedPatientId: Types.ObjectId | undefined = undefined;
    if (activeAssignment?.patient) {
      resolvedPatientId = (activeAssignment.patient as any)._id || activeAssignment.patient;
    }

    const rawGesture = gesture || gestureId || action || "UNKNOWN_GESTURE";
    const serialMatch = normalizeHardwareSerialCommand(rawGesture) || normalizeHardwareSerialCommand(action || "");

    let resolvedAction: any = serialMatch ? serialMatch.action : (action || "NEED_ASSISTANCE");
    const normalizedGestureId = serialMatch ? serialMatch.gestureId : rawGesture.trim().toUpperCase();
    const resolvedGestureName = serialMatch ? serialMatch.gestureName : (gesture || normalizedGestureId);
    const isUrgent = Boolean(urgent || serialMatch?.urgent);

    // 4. Persist Care Request
    const careRequest = await CareRequest.create({
      eventId,
      device: device._id,
      patient: resolvedPatientId,
      gestureId: normalizedGestureId,
      gesture: resolvedGestureName,
      urgent: isUrgent,
      action: resolvedAction,
      configVersion: device.appliedConfigVersion || 1,
      status: "NEW",
    });

    const populated = await CareRequest.findById(careRequest._id)
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    return {
      isDuplicate: false,
      careRequest: populated || careRequest,
    };
  }

  /**
   * List care requests with optional filtering and pagination
   */
  async listCareRequests(query: ListCareRequestsQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.deviceId) {
      const dev = await Device.findOne({ deviceId: query.deviceId });
      if (dev) {
        filter.device = dev._id;
      } else {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    if (query.patientCode) {
      const trimmed = query.patientCode.trim();
      const pt = await Patient.findOne({
        $or: [
          { patientCode: trimmed },
          { patientCode: trimmed.toUpperCase() },
          { email: trimmed.toLowerCase() },
        ],
      });
      if (pt) {
        const assignments = await DeviceAssignment.find({ patient: pt._id });
        const deviceIds = assignments.map((a) => a.device);
        if (deviceIds.length > 0) {
          filter.$or = [{ patient: pt._id }, { device: { $in: deviceIds } }];
        } else {
          filter.patient = pt._id;
        }
      } else {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    const [rawItems, total] = await Promise.all([
      CareRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("device", "deviceId name status")
        .populate("patient", "patientCode displayName bedLabel status"),
      CareRequest.countDocuments(filter),
    ]);

    // Dashboard display names for rule-based requests (never shown: the raw rule id)
    const ruleKeys = [...new Set(rawItems.map((r) => r.ruleId).filter(Boolean) as string[])];
    const displayNames = new Map<string, string>();
    const speechTemplates = new Map<string, string>();
    if (ruleKeys.length > 0) {
      const deviceIds = rawItems.map((r) => ((r.device as any)?._id || r.device) as Types.ObjectId);
      const rules = await CommandRule.find({ device: { $in: deviceIds }, ruleKey: { $in: ruleKeys } })
        .select("device ruleKey displayLabel speechTemplate")
        .lean();
      for (const rule of rules) {
        if (rule.displayLabel) displayNames.set(`${rule.device}:${rule.ruleKey}`, rule.displayLabel);
        if (rule.speechTemplate) speechTemplates.set(`${rule.device}:${rule.ruleKey}`, rule.speechTemplate);
      }
    }

    // Open alarms first, then NEW requests, then most recent
    const isOpenAlarm = (r: ICareRequest) => Boolean(r.alarm) && r.status !== "RESOLVED";
    const items = [...rawItems]
      .sort((a, b) => {
        if (isOpenAlarm(a) !== isOpenAlarm(b)) return isOpenAlarm(a) ? -1 : 1;
        if (a.status === "NEW" && b.status !== "NEW") return -1;
        if (a.status !== "NEW" && b.status === "NEW") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .map((r) => {
        const plain = r.toObject() as unknown as Record<string, unknown>;
        if (r.ruleId) {
          const devKey = String((r.device as any)?._id || r.device);
          plain.displayLabel = displayNames.get(`${devKey}:${r.ruleId}`) || r.label || r.ruleId;
          plain.speechTemplate = speechTemplateFor(r.ruleId, speechTemplates.get(`${devKey}:${r.ruleId}`));
        }
        return plain;
      });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single care request by ID (ObjectId or eventId)
   */
  async getCareRequestById(id: string): Promise<ICareRequest> {
    const isObjectId = Types.ObjectId.isValid(id);
    const query = isObjectId ? { _id: id } : { eventId: id };

    const request = await CareRequest.findOne(query)
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    if (!request) {
      throw new AppError(404, "CARE_REQUEST_NOT_FOUND", `Care request '${id}' not found`);
    }

    return request;
  }

  /**
   * Lifecycle: Acknowledge a NEW request
   */
  async acknowledgeRequest(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);

    if (request.status !== "NEW") {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot acknowledge care request: current status is '${request.status}', expected 'NEW'`
      );
    }

    request.status = "ACKNOWLEDGED";
    request.acknowledgedAt = new Date();
    await request.save();

    if (request.urgent && request.device) {
      await Device.findByIdAndUpdate(request.device, { $set: { silenceAlarmPending: true } });
    }

    return request;
  }

  /**
   * Lifecycle: Move an ACKNOWLEDGED request to IN_PROGRESS
   */
  async startHandlingRequest(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);

    if (request.status !== "ACKNOWLEDGED") {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot move care request to IN_PROGRESS: current status is '${request.status}', expected 'ACKNOWLEDGED'`
      );
    }

    request.status = "IN_PROGRESS";
    request.inProgressAt = new Date();
    await request.save();

    return request;
  }

  /**
   * Lifecycle: Resolve an IN_PROGRESS request
   */
  async resolveRequest(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);

    if (request.status !== "IN_PROGRESS") {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot resolve care request: current status is '${request.status}', expected 'IN_PROGRESS'`
      );
    }

    request.status = "RESOLVED";
    request.resolvedAt = new Date();
    await request.save();

    return request;
  }

  /**
   * Delete / Clear all care requests
   */
  async clearAllCareRequests(): Promise<number> {
    const res = await CareRequest.deleteMany({});
    // Reset any pending alarms on all devices
    await Device.updateMany({}, { $set: { silenceAlarmPending: true } });
    return res.deletedCount;
  }

  /**
   * Resolve all open care requests (NEW, ACKNOWLEDGED, IN_PROGRESS)
   */
  async resolveAllCareRequests(): Promise<number> {
    const now = new Date();
    const res = await CareRequest.updateMany(
      { status: { $in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS"] } },
      { $set: { status: "RESOLVED", resolvedAt: now } }
    );
    // Reset any pending alarms on all devices
    await Device.updateMany({}, { $set: { silenceAlarmPending: true } });
    return res.modifiedCount;
  }
}

export const careRequestService = new CareRequestService();
