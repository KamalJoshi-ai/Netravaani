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

export interface BedsideAudioEvent {
  type:
    | "PATIENT_CONFIRMATION_REQUESTED"
    | "PATIENT_CONFIRMATION_RESULT"
    | "DISPATCH_CONFIRMATION_REQUESTED"
    | "REQUEST_DISPATCHED"
    | "REQUEST_CANCELLED"
    | "HEARTBEAT"
    | "CONNECTED";
  mode?: "DISPATCH_CONFIRMATION" | "RESOLUTION_CONFIRMATION";
  requestId?: string;
  deviceId?: string;
  patientCode?: string;
  patientName?: string;
  bedLabel?: string;
  action?: string;
  actionLabel?: string;
  speechPrompt?: string;
  confirmGesture?: string;
  rejectGesture?: string;
  resolved?: boolean;
  expiresAt?: string;
  timestamp: string;
}

type BedsideAudioListener = (event: BedsideAudioEvent) => void;
const bedsideAudioListeners = new Set<{ filter: { deviceId?: string; patientCode?: string }; cb: BedsideAudioListener }>();

export function subscribeBedsideAudio(
  filter: { deviceId?: string; patientCode?: string },
  cb: BedsideAudioListener
): () => void {
  const item = { filter, cb };
  bedsideAudioListeners.add(item);
  return () => {
    bedsideAudioListeners.delete(item);
  };
}

export function broadcastBedsideAudio(event: BedsideAudioEvent): void {
  for (const listener of bedsideAudioListeners) {
    const { deviceId, patientCode } = listener.filter;
    if (deviceId && event.deviceId && deviceId.toLowerCase() !== event.deviceId.toLowerCase()) {
      continue;
    }
    if (patientCode && event.patientCode && patientCode.toUpperCase() !== event.patientCode.toUpperCase()) {
      continue;
    }
    try {
      listener.cb(event);
    } catch (e) {
      console.warn("[BedsideAudio] listener error", e);
    }
  }
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

    // 1. OUTGOING DISPATCH CONFIRMATION CHECK:
    // Check if patient was asked to confirm an outgoing request before sending to nurse
    const now = new Date();
    const gId = (gestureId || ruleId || "").toUpperCase();
    const isConfirmationEvent = !urgent && !alarm && ruleId !== "emergency" && (
      ruleId === "yes" || ruleId === "no" ||
      gId === "YES" || gId === "NO" ||
      gId.includes("CONFIRM") || gId.includes("CANCEL") ||
      eventType === "PATIENT_CONFIRMATION" || eventType === "DISPATCH_CONFIRMATION"
    );

    const pendingDispatch = isConfirmationEvent ? await CareRequest.findOne({
      device: device._id,
      status: "PENDING_DISPATCH_CONFIRMATION",
      confirmationExpiresAt: { $gt: now },
    })
      .sort({ confirmationRequestedAt: -1 })
      .populate("patient", "patientCode displayName bedLabel confirmationSettings") : null;

    if (pendingDispatch) {
      const patientDoc = pendingDispatch.patient as any;
      const confirmGesture = patientDoc?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
      const rejectGesture = patientDoc?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";

      const rCounts = counts || { eog: 0, emgLeft: 0, emgRight: 0, together: 0 };

      const isConfirm =
        (confirmGesture === "DOUBLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 2 || gId.includes("RIGHT_2") || gId === "YES")) ||
        (confirmGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        (confirmGesture === "SINGLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 1 || gId.includes("RIGHT_1"))) ||
        gId === "CONFIRM_DISPATCH" ||
        gId === "YES" ||
        ruleId === "yes";

      const isCancel =
        (rejectGesture === "SINGLE_SQUEEZE_LEFT" && (rCounts.emgLeft >= 1 || gId.includes("LEFT_1") || gId === "NO")) ||
        (rejectGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        gId === "CANCEL_DISPATCH" ||
        gId === "NO" ||
        ruleId === "no";

      if (isConfirm) {
        pendingDispatch.status = "NEW";
        pendingDispatch.confirmationRequestedAt = undefined;
        pendingDispatch.confirmationExpiresAt = undefined;
        await pendingDispatch.save();

        broadcastBedsideAudio({
          type: "REQUEST_DISPATCHED",
          requestId: String(pendingDispatch._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          speechPrompt: "Your request has been sent.",
          timestamp: new Date().toISOString(),
        });

        const updated = await CareRequest.findById(pendingDispatch._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return { isDuplicate: false, careRequest: updated || pendingDispatch, accepted: true };
      }

      if (isCancel) {
        pendingDispatch.status = "CANCELLED";
        await pendingDispatch.save();

        broadcastBedsideAudio({
          type: "REQUEST_CANCELLED",
          requestId: String(pendingDispatch._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          speechPrompt: "Request cancelled.",
          timestamp: new Date().toISOString(),
        });

        return { isDuplicate: false, accepted: true };
      }
    }

    // 2. CLOSED-LOOP RESOLUTION: Check if this device has an active CareRequest awaiting patient resolution confirmation
    const pendingConfirmation = isConfirmationEvent ? await CareRequest.findOne({
      device: device._id,
      status: "PENDING_PATIENT_CONFIRMATION",
      confirmationExpiresAt: { $gt: now },
    })
      .sort({ confirmationRequestedAt: -1 })
      .populate("patient", "patientCode displayName bedLabel confirmationSettings") : null;

    if (pendingConfirmation) {
      const patientDoc = pendingConfirmation.patient as any;
      const confirmGesture = patientDoc?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
      const rejectGesture = patientDoc?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";

      const rCounts = counts || { eog: 0, emgLeft: 0, emgRight: 0, together: 0 };
      const gId = (gestureId || ruleId || "").toUpperCase();

      // Check for Confirmation (YES) - Default: Right wrist double squeeze (counts.emgRight >= 2)
      const isConfirm =
        (confirmGesture === "DOUBLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 2 || gId.includes("RIGHT_2") || gId === "YES")) ||
        (confirmGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        (confirmGesture === "SINGLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 1 || gId.includes("RIGHT_1"))) ||
        gId === "CONFIRM_RESOLVED" ||
        gId === "YES" ||
        ruleId === "yes";

      // Check for Rejection (NO / Disputed) - Default: Left wrist single squeeze (counts.emgLeft >= 1)
      const isReject =
        (rejectGesture === "SINGLE_SQUEEZE_LEFT" && (rCounts.emgLeft >= 1 || gId.includes("LEFT_1") || gId === "NO")) ||
        (rejectGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        gId === "REJECT_RESOLVED" ||
        gId === "NO" ||
        ruleId === "no";

      if (isConfirm) {
        pendingConfirmation.status = "RESOLVED";
        pendingConfirmation.resolvedAt = new Date();
        pendingConfirmation.resolvedBy = "PATIENT_CONFIRMED";
        pendingConfirmation.patientConfirmedAt = new Date();
        await pendingConfirmation.save();

        broadcastBedsideAudio({
          type: "PATIENT_CONFIRMATION_RESULT",
          requestId: String(pendingConfirmation._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          resolved: true,
          speechPrompt: "Thank you. Call marked as resolved by patient.",
          timestamp: new Date().toISOString(),
        });

        const updated = await CareRequest.findById(pendingConfirmation._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return { isDuplicate: false, careRequest: updated || pendingConfirmation, accepted: true };
      }

      if (isReject) {
        pendingConfirmation.status = "IN_PROGRESS";
        pendingConfirmation.urgent = true; // Escalated
        pendingConfirmation.patientDisputedAt = new Date();
        await pendingConfirmation.save();

        broadcastBedsideAudio({
          type: "PATIENT_CONFIRMATION_RESULT",
          requestId: String(pendingConfirmation._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          resolved: false,
          speechPrompt: "Nurse re-alerted. Help is on the way.",
          timestamp: new Date().toISOString(),
        });

        const updated = await CareRequest.findById(pendingConfirmation._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return { isDuplicate: false, careRequest: updated || pendingConfirmation, accepted: true };
      }
    }

    // Firmware nv-4.0.0: the request names the command rule that fired.
    if (ruleId && (!eventType || eventType === "PATIENT_REQUEST")) {
      const assignment = await DeviceAssignment.findOne({ device: device._id, isActive: true });
      const deviceLabel = (label || "").trim() || ruleId;
      const legacyAction =
        RULE_ACTION[ruleId] ||
        (action && (RequestActionEnum as readonly string[]).includes(action.toUpperCase()) ? action.toUpperCase() : "REQUEST");
      const isAlarm = Boolean(alarm);
      const isUrgent = Boolean(urgent) || isAlarm || legacyAction === "EMERGENCY";

      const patientId = assignment?.patient;
      const patientDoc = patientId ? await Patient.findById(patientId) : null;
      const requireDispatchConfirm =
        Boolean(patientDoc?.confirmationSettings?.requireDispatchConfirmation) &&
        !isUrgent &&
        ruleId !== "yes" &&
        ruleId !== "no";

      if (requireDispatchConfirm) {
        const dispatchExpiresInSeconds = patientDoc?.confirmationSettings?.dispatchExpiresInSeconds || 15;
        const confirmGesture = patientDoc?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
        const rejectGesture = patientDoc?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";
        const spokenAction = (deviceLabel || legacyAction).replace(/[_]+/g, " ");

        const careRequest = await CareRequest.create({
          eventId,
          device: device._id,
          patient: patientId || undefined,
          gestureId: ruleId,
          gesture: deviceLabel,
          ruleId,
          label: deviceLabel,
          counts: counts || undefined,
          urgent: false,
          alarm: false,
          action: legacyAction,
          configVersion: configVersion || device.appliedConfigVersion || 1,
          status: "PENDING_DISPATCH_CONFIRMATION",
          confirmationRequestedAt: new Date(),
          confirmationExpiresAt: new Date(Date.now() + dispatchExpiresInSeconds * 1000),
        });

        const promptText = `You asked for ${spokenAction}. Squeeze your right wrist twice to send to the nurse, or squeeze your left wrist once to cancel.`;

        broadcastBedsideAudio({
          type: "DISPATCH_CONFIRMATION_REQUESTED",
          mode: "DISPATCH_CONFIRMATION",
          requestId: String(careRequest._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          action: legacyAction,
          actionLabel: deviceLabel,
          speechPrompt: promptText,
          confirmGesture,
          rejectGesture,
          expiresAt: careRequest.confirmationExpiresAt ? careRequest.confirmationExpiresAt.toISOString() : new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });

        const populated = await CareRequest.findById(careRequest._id)
          .populate("device", "deviceId name status")
          .populate("patient", "patientCode displayName bedLabel status");

        return { isDuplicate: false, careRequest: populated || careRequest };
      }

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

      broadcastBedsideAudio({
        type: "REQUEST_DISPATCHED",
        requestId: String(careRequest._id),
        deviceId: device.deviceId,
        patientCode: patientDoc?.patientCode,
        patientName: patientDoc?.displayName,
        bedLabel: patientDoc?.bedLabel,
        speechPrompt: isUrgent ? "Emergency request sent to nurse station." : "Your request has been sent.",
        timestamp: new Date().toISOString(),
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

      // Check configuration version against device config
      const config = await DeviceConfig.findOne({
        device: device._id,
        version: configVersion,
      });

      if (!config) {
        throw new AppError(
          400,
          "CONFIG_VERSION_NOT_FOUND",
          `Configuration version ${configVersion} not found for device '${deviceId}'`
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
    await this.checkPendingDispatchTimeouts();

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = { $nin: ["PENDING_DISPATCH_CONFIRMATION", "CANCELLED"] };
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
   * Closed-Loop: Request patient verification for an IN_PROGRESS or ACKNOWLEDGED request
   */
  async requestPatientConfirmation(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);

    if (request.status === "RESOLVED") {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        "Cannot request patient confirmation for an already resolved request"
      );
    }

    const patient = await Patient.findById(request.patient);
    const device = await Device.findById(request.device);

    const expiresInSeconds = patient?.confirmationSettings?.expiresInSeconds || 45;
    const confirmGesture = patient?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
    const rejectGesture = patient?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";

    let promptText = patient?.confirmationSettings?.confirmPromptText;
    if (!promptText) {
      const confirmLabel =
        confirmGesture === "DOUBLE_SQUEEZE_RIGHT"
          ? "squeeze your right wrist twice"
          : confirmGesture === "DOUBLE_BLINK"
          ? "blink twice"
          : "squeeze right wrist twice";
      const rejectLabel =
        rejectGesture === "SINGLE_SQUEEZE_LEFT"
          ? "squeeze your left wrist once"
          : "squeeze left wrist once";
      promptText = `Did you receive assistance? ${confirmLabel} for Yes, or ${rejectLabel} for No.`;
    }

    request.status = "PENDING_PATIENT_CONFIRMATION";
    request.confirmationRequestedAt = new Date();
    request.confirmationExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await request.save();

    broadcastBedsideAudio({
      type: "PATIENT_CONFIRMATION_REQUESTED",
      requestId: String(request._id),
      deviceId: device?.deviceId,
      patientCode: patient?.patientCode,
      patientName: patient?.displayName,
      bedLabel: patient?.bedLabel,
      speechPrompt: promptText,
      confirmGesture,
      rejectGesture,
      expiresAt: request.confirmationExpiresAt.toISOString(),
      timestamp: new Date().toISOString(),
    });

    return request;
  }

  /**
   * Lifecycle: Resolve a request (either via nurse override or patient confirmation)
   */
  async resolveRequest(
    id: string,
    resolvedBy: "NURSE_OVERRIDE" | "PATIENT_CONFIRMED" = "NURSE_OVERRIDE"
  ): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);

    if (
      request.status !== "IN_PROGRESS" &&
      request.status !== "PENDING_PATIENT_CONFIRMATION"
    ) {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot resolve care request: current status is '${request.status}', expected 'IN_PROGRESS' or 'PENDING_PATIENT_CONFIRMATION'`
      );
    }

    request.status = "RESOLVED";
    request.resolvedAt = new Date();
    request.resolvedBy = resolvedBy;
    await request.save();

    const device = await Device.findById(request.device);
    const patient = await Patient.findById(request.patient);

    broadcastBedsideAudio({
      type: "PATIENT_CONFIRMATION_RESULT",
      requestId: String(request._id),
      deviceId: device?.deviceId,
      patientCode: patient?.patientCode,
      patientName: patient?.displayName,
      bedLabel: patient?.bedLabel,
      resolved: true,
      speechPrompt: "Thank you. Call marked as resolved.",
      timestamp: new Date().toISOString(),
    });

    return request;
  }

  /**
   * Confirm an outgoing care request dispatch (promote to NEW)
   */
  async confirmDispatch(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);
    if (request.status !== "PENDING_DISPATCH_CONFIRMATION") {
      return request;
    }

    request.status = "NEW";
    request.confirmationRequestedAt = undefined;
    request.confirmationExpiresAt = undefined;
    await request.save();

    const device = await Device.findById(request.device);
    const patient = await Patient.findById(request.patient);

    broadcastBedsideAudio({
      type: "REQUEST_DISPATCHED",
      requestId: String(request._id),
      deviceId: device?.deviceId,
      patientCode: patient?.patientCode,
      patientName: patient?.displayName,
      bedLabel: patient?.bedLabel,
      action: request.action,
      speechPrompt: "Your request has been sent.",
      timestamp: new Date().toISOString(),
    });

    return request;
  }

  /**
   * Cancel an outgoing care request dispatch
   */
  async cancelDispatch(id: string): Promise<ICareRequest> {
    const request = await this.getCareRequestById(id);
    if (request.status !== "PENDING_DISPATCH_CONFIRMATION") {
      return request;
    }

    request.status = "CANCELLED";
    await request.save();

    const device = await Device.findById(request.device);
    const patient = await Patient.findById(request.patient);

    broadcastBedsideAudio({
      type: "REQUEST_CANCELLED",
      requestId: String(request._id),
      deviceId: device?.deviceId,
      patientCode: patient?.patientCode,
      patientName: patient?.displayName,
      bedLabel: patient?.bedLabel,
      action: request.action,
      speechPrompt: "Request cancelled.",
      timestamp: new Date().toISOString(),
    });

    return request;
  }

  /**
   * Check for expired dispatch confirmations and automatically dispatch them safely
   */
  async checkPendingDispatchTimeouts(): Promise<number> {
    const expired = await CareRequest.find({
      status: "PENDING_DISPATCH_CONFIRMATION",
      confirmationExpiresAt: { $lte: new Date() },
    })
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel");

    let count = 0;
    for (const req of expired) {
      req.status = "NEW";
      req.confirmationRequestedAt = undefined;
      req.confirmationExpiresAt = undefined;
      await req.save();
      count++;

      const dev = req.device as any;
      const pt = req.patient as any;
      broadcastBedsideAudio({
        type: "REQUEST_DISPATCHED",
        requestId: String(req._id),
        deviceId: dev?.deviceId,
        patientCode: pt?.patientCode,
        patientName: pt?.displayName,
        bedLabel: pt?.bedLabel,
        speechPrompt: "Your request has been sent.",
        timestamp: new Date().toISOString(),
      });
    }

    return count;
  }

  /**
   * Get current active patient confirmation status for phone speaker (dispatch OR resolution)
   */
  async getActiveConfirmation(filter: { deviceId?: string; patientCode?: string }) {
    await this.checkPendingDispatchTimeouts();

    let devIdObj: Types.ObjectId | undefined = undefined;
    let ptIdObj: Types.ObjectId | undefined = undefined;

    if (filter.deviceId) {
      const dev = await Device.findOne({ deviceId: filter.deviceId });
      if (dev) devIdObj = dev._id as Types.ObjectId;
    }
    if (filter.patientCode) {
      const pt = await Patient.findOne({ patientCode: filter.patientCode.toUpperCase() });
      if (pt) ptIdObj = pt._id as Types.ObjectId;
    }

    // 1. First check for active DISPATCH confirmation (outgoing from patient)
    const dispatchQuery: any = {
      status: "PENDING_DISPATCH_CONFIRMATION",
      confirmationExpiresAt: { $gt: new Date() },
    };
    if (devIdObj) dispatchQuery.device = devIdObj;
    if (ptIdObj) dispatchQuery.patient = ptIdObj;

    const activeDispatch = await CareRequest.findOne(dispatchQuery)
      .sort({ confirmationRequestedAt: -1 })
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel confirmationSettings");

    if (activeDispatch) {
      const pt = activeDispatch.patient as any;
      const dev = activeDispatch.device as any;
      const confirmGesture = pt?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
      const rejectGesture = pt?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";
      const actionLabel = (((activeDispatch as any).displayLabel as string) || activeDispatch.label || activeDispatch.action).replace(/_/g, " ");
      const promptText = `You asked for ${actionLabel}. Squeeze your right wrist twice to send to the nurse, or squeeze your left wrist once to cancel.`;

      const secondsRemaining = Math.max(
        0,
        Math.floor((new Date(activeDispatch.confirmationExpiresAt!).getTime() - Date.now()) / 1000)
      );

      return {
        mode: "DISPATCH_CONFIRMATION",
        requestId: String(activeDispatch._id),
        deviceId: dev?.deviceId,
        patientCode: pt?.patientCode,
        patientName: pt?.displayName,
        bedLabel: pt?.bedLabel,
        action: activeDispatch.action,
        actionLabel,
        speechPrompt: promptText,
        confirmGesture,
        rejectGesture,
        secondsRemaining,
        confirmationExpiresAt: activeDispatch.confirmationExpiresAt,
      };
    }

    // 2. Then check for active RESOLUTION confirmation (incoming from nurse)
    const resolutionQuery: any = {
      status: "PENDING_PATIENT_CONFIRMATION",
      confirmationExpiresAt: { $gt: new Date() },
    };
    if (devIdObj) resolutionQuery.device = devIdObj;
    if (ptIdObj) resolutionQuery.patient = ptIdObj;

    const activeResolution = await CareRequest.findOne(resolutionQuery)
      .sort({ confirmationRequestedAt: -1 })
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel confirmationSettings");

    if (activeResolution) {
      const pt = activeResolution.patient as any;
      const dev = activeResolution.device as any;
      const confirmGesture = pt?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
      const rejectGesture = pt?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";
      let promptText = pt?.confirmationSettings?.confirmPromptText;
      if (!promptText) {
        promptText = `Did you receive assistance? Squeeze your right wrist twice for Yes, or squeeze your left wrist once for No.`;
      }

      const secondsRemaining = Math.max(
        0,
        Math.floor((new Date(activeResolution.confirmationExpiresAt!).getTime() - Date.now()) / 1000)
      );

      return {
        mode: "RESOLUTION_CONFIRMATION",
        requestId: String(activeResolution._id),
        deviceId: dev?.deviceId,
        patientCode: pt?.patientCode,
        patientName: pt?.displayName,
        bedLabel: pt?.bedLabel,
        speechPrompt: promptText,
        confirmGesture,
        rejectGesture,
        secondsRemaining,
        confirmationExpiresAt: activeResolution.confirmationExpiresAt,
        confirmationRequestedAt: activeResolution.confirmationRequestedAt,
      };
    }

    return null;
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
   * Resolve all open care requests (NEW, ACKNOWLEDGED, IN_PROGRESS, PENDING_PATIENT_CONFIRMATION)
   */
  async resolveAllCareRequests(): Promise<number> {
    const now = new Date();
    const res = await CareRequest.updateMany(
      { status: { $in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "PENDING_PATIENT_CONFIRMATION"] } },
      { $set: { status: "RESOLVED", resolvedAt: now, resolvedBy: "NURSE_OVERRIDE" } }
    );
    // Reset any pending alarms on all devices
    await Device.updateMany({}, { $set: { silenceAlarmPending: true } });
    return res.modifiedCount;
  }
}

export const careRequestService = new CareRequestService();
