import { Types } from "mongoose";
import { Device } from "../models/Device.js";
import { DeviceAssignment } from "../models/DeviceAssignment.js";
import { DeviceConfig, RequestActionEnum } from "../models/DeviceConfig.js";
import { CareRequest, ICareRequest, CareRequestStatus } from "../models/CareRequest.js";
import { Patient } from "../models/Patient.js";
import { AppError } from "../middleware/errorHandler.js";
import { commandRuleService } from "./commandRuleService.js";
import { deviceCommandService } from "./deviceCommandService.js";
import { CommandRule } from "../models/CommandRule.js";
import { speechTemplateFor } from "../shared/speechDefaults.js";
import { patientCommunicationService } from "./patientCommunicationService.js";

export interface IngestDeviceEventDto {
  eventId?: string;
  deviceId?: string;
  eventType?: string;
  gestureId?: string;
  gesture?: string;
  action?: string;
  urgent?: boolean;
  configVersion?: number;
  occurredAt?: string | number;
  appliedVersion?: number;
  timestamp?: string | number;
  // Firmware nv-4.0.0 & nv-5.0.0 command rules
  ruleId?: string;
  label?: string;
  alarm?: boolean;
  counts?: { eog: number; emgLeft: number; emgRight: number; together: number };
  rejectedVersion?: number;
  error?: string;
}

/** Legacy action for default rule ids, so older views keep working. */
const RULE_ACTION: Record<string, string> = {
  c01: "WATER",
  c02: "PAIN",
  c03: "REPOSITION",
  c04: "CALL_NURSE",
  c05: "NO",
  c06: "EMERGENCY",
  c07: "YES",
  yes: "YES",
  no: "NO",
  water: "WATER",
  call_nurse: "CALL_NURSE",
  adjustment: "REPOSITION",
  emergency: "EMERGENCY",
  blink_right: "CALL_NURSE",
  blink_both: "WATER",
  right_2: "YES",
  left_2: "NO",
  both_2: "REPOSITION",
  blink_left: "CALL_NURSE",
};

export const MAX_ACTIVE_REQUESTS_PER_PATIENT = 1;

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
    | "REQUEST_LIMIT_REACHED"
    | "HANDSHAKE_UPDATED"
    | "HEARTBEAT"
    | "CONNECTED";
  mode?: "DISPATCH_CONFIRMATION" | "RESOLUTION_CONFIRMATION";
  handshakeStatus?: string;
  communicationMode?: string;
  yesSentAt?: string;
  noSentAt?: string;
  completedAt?: string;
  requestId?: string;
  deviceId?: string;
  patientCode?: string;
  patientName?: string;
  bedLabel?: string;
  action?: string;
  actionLabel?: string;
  ruleId?: string;
  gesture?: string;
  counts?: { eog: number; emgLeft: number; emgRight: number; together?: number };
  urgent?: boolean;
  alarm?: boolean;
  speechPrompt?: string;
  confirmGesture?: string;
  rejectGesture?: string;
  resolved?: boolean;
  expiresAt?: string;
  activeCount?: number;
  maxLimit?: number;
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

export function describeGestureFromRuleOrCounts(
  ruleId?: string,
  counts?: { eog?: number; emgLeft?: number; emgRight?: number; together?: number },
  fallback?: string
): string {
  if (counts) {
    const eog = counts.eog || 0;
    const l = counts.emgLeft || 0;
    const r = counts.emgRight || 0;
    const tog = counts.together || (l > 0 && r > 0 ? Math.min(l, r) : 0);

    if (tog > 0) {
      return `${tog} squeeze${tog > 1 ? "s" : ""} (Both hands together)`;
    }
    if (eog > 0 && l === 0 && r === 0) {
      return `${eog} blink${eog > 1 ? "s" : ""} (Forehead EOG)`;
    }
    if (l > 0 && r === 0) {
      return `${l} left wrist squeeze${l > 1 ? "s" : ""}`;
    }
    if (r > 0 && l === 0) {
      return `${r} right wrist squeeze${r > 1 ? "s" : ""}`;
    }
    if (l > 0 && r > 0) {
      return `${l} left, ${r} right wrist squeezes`;
    }
  }

  const key = (ruleId || fallback || "").toLowerCase();
  if (key === "yes" || key === "c07") return "3–4 blinks (Forehead EOG)";
  if (key === "no" || key === "c05") return "1–2 squeezes (Both hands together)";
  if (key === "water" || key === "c01") return "5+ blinks (Forehead EOG)";
  if (key === "call_nurse" || key === "call nurse" || key === "c04") return "3+ left wrist squeezes";
  if (key === "adjustment" || key === "reposition" || key === "c03") return "3+ right wrist squeezes";
  if (key === "emergency" || key === "c06") return "3+ squeezes (Both hands together, alarm)";

  return fallback || ruleId || "Unknown gesture";
}

const processedEventIds = new Set<string>();

export class CareRequestService {
  /**
   * Ingest recognized gesture event from hardware identity
   * Validates device, handles hardware firmware directly or through configured assignments.
   * Handles event deduplication.
   */
  async ingestDeviceEvent(dto: IngestDeviceEventDto, bearerToken?: string): Promise<{
    isDuplicate: boolean;
    careRequest?: ICareRequest;
    accepted?: boolean;
    reason?: string;
    message?: string;
  }> {
    const effectiveEventId = dto.eventId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const { deviceId, eventType, gestureId, gesture, action, urgent, configVersion, appliedVersion } = dto;
    const { ruleId, label, alarm, counts, rejectedVersion, error } = dto;

    // Deduplication check: return existing if eventId was already processed
    if (dto.eventId && processedEventIds.has(dto.eventId)) {
      return {
        isDuplicate: true,
        accepted: true,
        message: "Event already processed (deduplicated)",
      };
    }

    const existing = await CareRequest.findOne({ eventId: effectiveEventId })
      .populate("device", "deviceId name status")
      .populate("patient", "patientCode displayName bedLabel status");

    if (existing) {
      if (dto.eventId) processedEventIds.add(dto.eventId);
      return {
        isDuplicate: true,
        careRequest: existing,
      };
    }

    // 1. Verify Device: check by deviceId, hardwareId, or bearerToken
    let device: any = null;
    if (deviceId) {
      device = await Device.findOne({ $or: [{ deviceId }, { hardwareId: deviceId }] });
    }
    if (!device && bearerToken) {
      device = await Device.findOne({ token: bearerToken });
    }
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId || "token"}' not found`);
    }

    if (device.status === "DISABLED") {
      throw new AppError(400, "DEVICE_DISABLED", `Cannot ingest events for disabled device '${device.deviceId}'`);
    }

    // Update lastSeen, connectivity status, and battery telemetry
    device.lastSeenAt = new Date();
    device.connectivityStatus = "ONLINE";

    const rawBattery =
      (dto as any).batteryLevel ??
      (dto as any).battery ??
      (dto as any).batteryLevelPct ??
      (dto as any).batteryPct ??
      (dto as any).batt ??
      (dto as any).battery_level;

    if (rawBattery !== undefined && rawBattery !== null && !isNaN(Number(rawBattery))) {
      const numBatt = Number(rawBattery);
      if (numBatt > 0 && numBatt <= 5.0) {
        device.batteryLevel = Math.max(0, Math.min(100, Math.round(((numBatt - 3.3) / 0.9) * 100)));
      } else {
        device.batteryLevel = Math.max(0, Math.min(100, Math.round(numBatt)));
      }
    }
    if (eventType === "CONFIG_APPLIED" && appliedVersion) {
      device.appliedConfigVersion = appliedVersion;
      await device.save();
      await commandRuleService.markApplied(device, appliedVersion);
      await deviceCommandService.markApplied(device, appliedVersion);
      return { isDuplicate: false, accepted: true };
    }
    if (eventType === "CONFIG_FAILED") {
      // The device keeps running appliedVersion; only rejectedVersion is marked FAILED.
      if (appliedVersion && appliedVersion >= 1) device.appliedConfigVersion = appliedVersion;
      await device.save();
      if (rejectedVersion && rejectedVersion >= 1) {
        await commandRuleService.markFailed(device, rejectedVersion, error);
        await deviceCommandService.markFailed(device, rejectedVersion, error);
      }
      return { isDuplicate: false, accepted: true };
    }
    await device.save();

    // 1. OUTGOING DISPATCH CONFIRMATION CHECK:
    // Check if patient was asked to confirm an outgoing request before sending to nurse
    const now = new Date();
    const gId = (gestureId || ruleId || "").toUpperCase();
    const rCounts = counts || { eog: 0, emgLeft: 0, emgRight: 0, together: 0 };

    const pendingDispatch = await CareRequest.findOne({
      device: device._id,
      status: "PENDING_DISPATCH_CONFIRMATION",
      confirmationExpiresAt: { $gt: now },
    })
      .sort({ confirmationRequestedAt: -1 })
      .populate("patient", "patientCode displayName bedLabel confirmationSettings");

    if (pendingDispatch) {
      const patientDoc = pendingDispatch.patient as any;
      const confirmGesture = patientDoc?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
      const rejectGesture = patientDoc?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";
      const { yesRule, noRule } = await commandRuleService.getYesNoRules(device);

      const isConfirm =
        ruleId === "yes" ||
        gId === "YES" ||
        gId === "CONFIRM_DISPATCH" ||
        gId.includes("SIM-YES") ||
        (yesRule && rCounts.eog >= yesRule.eogMin && rCounts.eog <= yesRule.eogMax && rCounts.emgLeft <= yesRule.leftMax && rCounts.emgRight <= yesRule.rightMax) ||
        (!yesRule && rCounts.eog >= 3 && rCounts.eog <= 4 && rCounts.emgLeft === 0 && rCounts.emgRight === 0) ||
        (confirmGesture === "DOUBLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 2 || gId.includes("RIGHT_2"))) ||
        (confirmGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        (confirmGesture === "SINGLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 1 || gId.includes("RIGHT_1"))) ||
        ruleId === "c07" ||
        ruleId === "right_2";

      const isCancel =
        ruleId === "no" ||
        gId === "NO" ||
        gId === "CANCEL_DISPATCH" ||
        gId.includes("SIM-NO") ||
        (noRule && (noRule.simultaneous ? (rCounts.together >= noRule.leftMin || (rCounts.emgLeft >= noRule.leftMin && rCounts.emgRight >= noRule.rightMin)) : rCounts.emgLeft >= noRule.leftMin) && rCounts.emgLeft <= noRule.leftMax && rCounts.emgRight <= noRule.rightMax) ||
        (!noRule && ((rCounts.together >= 1 || (rCounts.emgLeft >= 1 && rCounts.emgRight >= 1)) && rCounts.emgLeft <= 2 && rCounts.emgRight <= 2)) ||
        (rejectGesture === "SINGLE_SQUEEZE_LEFT" && (rCounts.emgLeft >= 1 || gId.includes("LEFT_1") || gId.includes("LEFT_2") || gId === "EMG_L_1")) ||
        (rejectGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        ruleId === "c05" ||
        ruleId === "left_2";

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
        await CareRequest.deleteOne({ _id: pendingDispatch._id });

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

        return { isDuplicate: false, accepted: true, message: "Request cancelled and rejected by patient. Not sent to nurse dashboard." };
      }
    }

    // 2. CLOSED-LOOP RESOLUTION: Check if this device has an active CareRequest awaiting patient resolution confirmation
    const pendingConfirmation = !pendingDispatch ? await CareRequest.findOne({
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
      const { yesRule, noRule } = await commandRuleService.getYesNoRules(device);

      // Check for Confirmation (YES) - Default: 3–4 blinks or Right wrist double squeeze
      const isConfirm =
        ruleId === "yes" ||
        gId === "YES" ||
        gId === "CONFIRM_RESOLVED" ||
        gId.includes("SIM-YES") ||
        (yesRule && rCounts.eog >= yesRule.eogMin && rCounts.eog <= yesRule.eogMax && rCounts.emgLeft <= yesRule.leftMax && rCounts.emgRight <= yesRule.rightMax) ||
        (!yesRule && rCounts.eog >= 3 && rCounts.eog <= 4 && rCounts.emgLeft === 0 && rCounts.emgRight === 0) ||
        (confirmGesture === "DOUBLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 2 || gId.includes("RIGHT_2"))) ||
        (confirmGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        (confirmGesture === "SINGLE_SQUEEZE_RIGHT" && (rCounts.emgRight >= 1 || gId.includes("RIGHT_1"))) ||
        ruleId === "c07" ||
        ruleId === "right_2";

      // Check for Rejection (NO / Disputed) - Default: 1–2 squeezes both hands or Left wrist squeeze
      const isReject =
        ruleId === "no" ||
        gId === "NO" ||
        gId === "REJECT_RESOLVED" ||
        gId.includes("SIM-NO") ||
        (noRule && (noRule.simultaneous ? (rCounts.together >= noRule.leftMin || (rCounts.emgLeft >= noRule.leftMin && rCounts.emgRight >= noRule.rightMin)) : rCounts.emgLeft >= noRule.leftMin) && rCounts.emgLeft <= noRule.leftMax && rCounts.emgRight <= noRule.rightMax) ||
        (!noRule && ((rCounts.together >= 1 || (rCounts.emgLeft >= 1 && rCounts.emgRight >= 1)) && rCounts.emgLeft <= 2 && rCounts.emgRight <= 2)) ||
        (rejectGesture === "SINGLE_SQUEEZE_LEFT" && (rCounts.emgLeft >= 1 || gId.includes("LEFT_1") || gId.includes("LEFT_2") || gId === "EMG_L_1")) ||
        (rejectGesture === "DOUBLE_BLINK" && (rCounts.eog >= 2 || gId.includes("BLINK_2"))) ||
        ruleId === "c05" ||
        ruleId === "left_2" ||
        ruleId === "reject_resolved";

      if (isConfirm) {
        pendingConfirmation.status = "RESOLVED";
        pendingConfirmation.resolvedAt = new Date();
        pendingConfirmation.resolvedBy = "PATIENT_CONFIRMED";
        pendingConfirmation.patientConfirmedAt = new Date();
        pendingConfirmation.patientDisputedAt = undefined;
        pendingConfirmation.confirmationNote = "Patient confirmed care received (Right Wrist Squeeze ×2)";
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
        pendingConfirmation.patientConfirmedAt = undefined;
        pendingConfirmation.resolvedBy = undefined;
        pendingConfirmation.confirmationNote = "Patient reported care was NOT received (Left Wrist Squeeze)";
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

    // 3. MANDATORY INITIAL COMMUNICATION HANDSHAKE & REQUEST GATING
    const ruleIdLower = (ruleId || "").toLowerCase();
    const actionUpper = (action || "").toUpperCase();

    const { yesRule, noRule } = await commandRuleService.getYesNoRules(device);

    const hasExplicitRule = Boolean(ruleId);
    const isYesGesture =
      ruleIdLower === "yes" ||
      ruleIdLower === "c07" ||
      ruleIdLower === "right_2" ||
      gId === "YES" ||
      actionUpper === "YES" ||
      gId.includes("SIM-YES") ||
      (!hasExplicitRule && yesRule && rCounts.eog >= yesRule.eogMin && rCounts.eog <= yesRule.eogMax && rCounts.emgLeft <= yesRule.leftMax && rCounts.emgRight <= yesRule.rightMax) ||
      (!hasExplicitRule && !yesRule && rCounts.eog >= 3 && rCounts.eog <= 4 && rCounts.emgLeft === 0 && rCounts.emgRight === 0);

    const isNoGesture =
      ruleIdLower === "no" ||
      ruleIdLower === "c05" ||
      ruleIdLower === "left_2" ||
      gId === "NO" ||
      actionUpper === "NO" ||
      gId.includes("SIM-NO") ||
      (!hasExplicitRule && noRule && (noRule.simultaneous ? (rCounts.together >= noRule.leftMin || (rCounts.emgLeft >= noRule.leftMin && rCounts.emgRight >= noRule.rightMin)) : rCounts.emgLeft >= noRule.leftMin) && rCounts.emgLeft <= noRule.leftMax && rCounts.emgRight <= noRule.rightMax) ||
      (!hasExplicitRule && !noRule && ((rCounts.together >= 1 || (rCounts.emgLeft >= 1 && rCounts.emgRight >= 1)) && rCounts.emgLeft <= 2 && rCounts.emgRight <= 2));

    const isEmergency =
      ruleIdLower === "emergency" ||
      ruleIdLower === "c06" ||
      Boolean(alarm) ||
      (Boolean(urgent) && actionUpper === "EMERGENCY") ||
      actionUpper === "EMERGENCY" ||
      gId.includes("EMERGENCY") ||
      (rCounts.together >= 3 && rCounts.emgLeft >= 3 && rCounts.emgRight >= 3);

    const assignment = await DeviceAssignment.findOne({ device: device._id, isActive: true });

    if (assignment) {
      const commState = await patientCommunicationService.getOrCreateForAssignment(assignment);
      if (commState && commState.communicationMode === "MANDATORY_HANDSHAKE") {
        if (isEmergency) {
          // Safety exception: Emergency alerts are NEVER suppressed during handshake!
        } else if (isYesGesture) {
          if (dto.eventId) processedEventIds.add(dto.eventId);
          const { state: updatedState, transitionedToNormal, isRepeated } =
            await patientCommunicationService.processHandshakeGesture(assignment._id, "YES");
          return {
            isDuplicate: isRepeated,
            accepted: true,
            message: isRepeated
              ? "YES already acknowledged for initial handshake"
              : transitionedToNormal
              ? "YES received. Initial handshake COMPLETED! Normal communication mode activated."
              : "YES received and validated for initial handshake. Waiting for NO.",
          };
        } else if (isNoGesture) {
          if (dto.eventId) processedEventIds.add(dto.eventId);
          const { state: updatedState, transitionedToNormal, isRepeated } =
            await patientCommunicationService.processHandshakeGesture(assignment._id, "NO");
          return {
            isDuplicate: isRepeated,
            accepted: true,
            message: isRepeated
              ? "NO already acknowledged for initial handshake"
              : transitionedToNormal
              ? "NO received. Initial handshake COMPLETED! Normal communication mode activated."
              : "NO received and validated for initial handshake. Waiting for YES.",
          };
        } else {
          // Reject additional assistance requests (WATER, CALL NURSE, ADJUSTMENT) during handshake
          return {
            isDuplicate: false,
            accepted: false,
            reason: "HANDSHAKE_INCOMPLETE",
            message: "Patient initial handshake is incomplete. Only YES, NO, and EMERGENCY gestures are permitted until initial communication is established.",
          };
        }
      } else {
        // Normal communication mode active: YES and NO must NEVER appear in the Live Calls Ledger
        if (isYesGesture) {
          if (dto.eventId) processedEventIds.add(dto.eventId);
          return {
            isDuplicate: false,
            accepted: true,
            message: "YES gesture received and acknowledged (not added to Live Calls Ledger)",
          };
        }
        if (isNoGesture) {
          if (dto.eventId) processedEventIds.add(dto.eventId);
          return {
            isDuplicate: false,
            accepted: true,
            message: "NO gesture received and acknowledged (not added to Live Calls Ledger)",
          };
        }
      }
    } else {
      // Unassigned device: YES and NO must NEVER appear in Live Calls Ledger
      if (isYesGesture) {
        if (dto.eventId) processedEventIds.add(dto.eventId);
        return {
          isDuplicate: false,
          accepted: true,
          message: "YES gesture received (not added to Live Calls Ledger)",
        };
      }
      if (isNoGesture) {
        if (dto.eventId) processedEventIds.add(dto.eventId);
        return {
          isDuplicate: false,
          accepted: true,
          message: "NO gesture received (not added to Live Calls Ledger)",
        };
      }
    }

    // Firmware nv-4.0.0 & nv-5.0.0: the request names the command rule that fired.
    if (ruleId && (!eventType || eventType === "PATIENT_REQUEST")) {
      const customDisplay = (await commandRuleService.displayLabelFor(device, ruleId)) || (await deviceCommandService.displayLabelFor(device, ruleId));
      const deviceLabel = (label || "").trim() || ruleId;
      const legacyAction =
        RULE_ACTION[ruleId] ||
        (action && (RequestActionEnum as readonly string[]).includes(action.toUpperCase()) ? action.toUpperCase() : "REQUEST");
      const isAlarm = Boolean(alarm);
      const isUrgent = Boolean(urgent) || isAlarm || legacyAction === "EMERGENCY";

      const patientId = assignment?.patient;
      const patientDoc = patientId ? await Patient.findById(patientId) : null;

      // Enforce active requests maximum per patient/bed (Emergency bypasses this limit)
      // Requirement: Don't allow any other command to enter dashboard until first problem or issue is solved.
      if (!isUrgent && !isAlarm && legacyAction !== "EMERGENCY" && ruleId !== "emergency" && ruleId !== "c06") {
        const activeCount = await CareRequest.countDocuments({
          $or: [
            ...(patientId ? [{ patient: patientId }] : []),
            { device: device._id },
          ],
          status: { $in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "PENDING_DISPATCH_CONFIRMATION", "PENDING_PATIENT_CONFIRMATION"] },
        });

        if (activeCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT) {
          broadcastBedsideAudio({
            type: "REQUEST_LIMIT_REACHED",
            deviceId: device.deviceId,
            patientCode: patientDoc?.patientCode,
            patientName: patientDoc?.displayName,
            bedLabel: patientDoc?.bedLabel,
            activeCount,
            maxLimit: MAX_ACTIVE_REQUESTS_PER_PATIENT,
            speechPrompt: "You already have an active call in progress. Please wait until nursing staff resolves your current request.",
            timestamp: new Date().toISOString(),
          });

          return {
            isDuplicate: false,
            accepted: false,
            reason: "ACTIVE_REQUEST_EXISTS",
            message: "An active request is currently open for this bed. No further requests can be placed until the first issue is solved.",
          };
        }
      }

      const requireDispatchConfirm =
        Boolean(patientDoc?.confirmationSettings?.requireDispatchConfirmation) &&
        !isUrgent &&
        ruleId !== "yes" &&
        ruleId !== "no" &&
        ruleId !== "c07" &&
        ruleId !== "c05";

      if (requireDispatchConfirm) {
        const dispatchExpiresInSeconds = patientDoc?.confirmationSettings?.dispatchExpiresInSeconds || 15;
        const confirmGesture = patientDoc?.confirmationSettings?.confirmGesture || "DOUBLE_SQUEEZE_RIGHT";
        const rejectGesture = patientDoc?.confirmationSettings?.rejectGesture || "SINGLE_SQUEEZE_LEFT";
        const spokenAction = (customDisplay || deviceLabel || legacyAction).replace(/[_]+/g, " ");

        const gestureDesc = describeGestureFromRuleOrCounts(ruleId, counts, customDisplay || deviceLabel || legacyAction);
        const careRequest = await CareRequest.create({
          eventId: effectiveEventId,
          device: device._id,
          patient: patientId || undefined,
          gestureId: ruleId,
          gesture: gestureDesc,
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

        const { yesRule, noRule } = await commandRuleService.getYesNoRules(device);
        const yesPhrase = yesRule
          ? (yesRule.eogMin > 0 ? `Blink ${yesRule.eogMin === yesRule.eogMax ? yesRule.eogMin : `${yesRule.eogMin} to ${yesRule.eogMax}`} times` : `Squeeze ${yesRule.leftMin > 0 ? "left wrist" : "right wrist"}`)
          : "Blink 3 to 4 times";
        const noPhrase = noRule
          ? (noRule.simultaneous ? `squeeze both hands together ${noRule.leftMin === noRule.leftMax ? noRule.leftMin : `${noRule.leftMin} to ${noRule.leftMax}`} times` : `squeeze left wrist`)
          : "squeeze both hands together";
        const promptText = `You asked for ${spokenAction}. ${yesPhrase} for YES to send to the nurse, or ${noPhrase} for NO to cancel.`;

        broadcastBedsideAudio({
          type: "DISPATCH_CONFIRMATION_REQUESTED",
          mode: "DISPATCH_CONFIRMATION",
          requestId: String(careRequest._id),
          deviceId: device.deviceId,
          patientCode: patientDoc?.patientCode,
          patientName: patientDoc?.displayName,
          bedLabel: patientDoc?.bedLabel,
          action: legacyAction,
          actionLabel: customDisplay || deviceLabel,
          ruleId,
          gesture: gestureDesc,
          counts: counts || undefined,
          urgent: false,
          alarm: false,
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

      const gestureDesc = describeGestureFromRuleOrCounts(ruleId, counts, customDisplay || deviceLabel || legacyAction);
      const careRequest = await CareRequest.create({
        eventId: effectiveEventId,
        device: device._id,
        patient: assignment?.patient || undefined,
        gestureId: ruleId,
        gesture: gestureDesc,
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

      const customSpeech = (await commandRuleService.speechTemplateFor(device, ruleId)) || speechTemplateFor(ruleId);
      const spokenActionDispatched = (customDisplay || deviceLabel || legacyAction).replace(/[_]+/g, " ");
      const speechPrompt = customSpeech
        ? (customSpeech.includes("{command}") ? customSpeech.replace("{command}", spokenActionDispatched) : customSpeech)
        : (isUrgent ? `Emergency alert: ${spokenActionDispatched} sent to nurse station.` : `Request for ${spokenActionDispatched} sent to nurse station.`);

      broadcastBedsideAudio({
        type: "REQUEST_DISPATCHED",
        requestId: String(careRequest._id),
        deviceId: device.deviceId,
        patientCode: patientDoc?.patientCode,
        patientName: patientDoc?.displayName,
        bedLabel: patientDoc?.bedLabel,
        action: legacyAction,
        actionLabel: customDisplay || deviceLabel,
        ruleId,
        gesture: gestureDesc,
        counts: counts || undefined,
        urgent: Boolean(urgent) || isAlarm,
        alarm: isAlarm,
        speechPrompt,
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
          `Gesture '${rawGesture}' is not configured in version ${configVersion} of device '${device.deviceId}'`
        );
      }

      const gestureDesc = describeGestureFromRuleOrCounts(dto.ruleId, dto.counts, gesture || normalizedGestureId);
      const careRequest = await CareRequest.create({
        eventId: effectiveEventId,
        device: device._id,
        patient: (patient as any)._id || activeAssignment.patient,
        gestureId: normalizedGestureId,
        gesture: gestureDesc,
        ruleId: dto.ruleId,
        label: dto.label || normalizedGestureId,
        counts: dto.counts || undefined,
        urgent: Boolean(urgent),
        alarm: Boolean(dto.alarm),
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

    if (!isUrgent && resolvedAction !== "EMERGENCY") {
      const activeCount = await CareRequest.countDocuments({
        $or: [
          ...(resolvedPatientId ? [{ patient: resolvedPatientId }] : []),
          { device: device._id },
        ],
        status: { $in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "PENDING_DISPATCH_CONFIRMATION", "PENDING_PATIENT_CONFIRMATION"] },
      });
      if (activeCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT) {
        broadcastBedsideAudio({
          type: "REQUEST_LIMIT_REACHED",
          deviceId: device.deviceId,
          activeCount,
          maxLimit: MAX_ACTIVE_REQUESTS_PER_PATIENT,
          speechPrompt: "You already have an active call in progress. Please wait until nursing staff resolves your current request.",
          timestamp: new Date().toISOString(),
        });
        return {
          isDuplicate: false,
          accepted: false,
          reason: "ACTIVE_REQUEST_EXISTS",
          message: "An active request is currently open for this bed. No further requests can be placed until the first issue is solved.",
        };
      }
    }

    // 4. Persist Care Request
    const gestureDesc = describeGestureFromRuleOrCounts(dto.ruleId, dto.counts, resolvedGestureName);
    const careRequest = await CareRequest.create({
      eventId: effectiveEventId,
      device: device._id,
      patient: resolvedPatientId,
      gestureId: normalizedGestureId,
      gesture: gestureDesc,
      ruleId: dto.ruleId,
      label: dto.label || normalizedGestureId,
      counts: dto.counts || undefined,
      urgent: isUrgent,
      alarm: Boolean(dto.alarm),
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

    // Live Calls Ledger requirement: YES and NO must NEVER appear in the Live Calls Ledger
    filter.action = { $nin: ["YES", "NO"] };
    filter.ruleId = { $nin: ["yes", "no", "c07", "c05"] };

    if (query.status && query.status !== ("ALL" as any)) {
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
      promptText = `Did you receive assistance? Blink 3 to 4 times for Yes, or squeeze both hands together for No.`;
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
    // Strict requirement: Immediately purge cancelled requests so they never reach nurse dashboard
    await CareRequest.deleteOne({ _id: request._id });

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
   * Check for expired dispatch confirmations and automatically cancel unconfirmed signals safely
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
      // Unconfirmed dispatch timeout: cancel and purge to avoid unverified signals reaching nurse
      req.status = "CANCELLED";
      await req.save();
      await CareRequest.deleteOne({ _id: req._id });
      count++;

      const dev = req.device as any;
      const pt = req.patient as any;
      broadcastBedsideAudio({
        type: "REQUEST_CANCELLED",
        requestId: String(req._id),
        deviceId: dev?.deviceId,
        patientCode: pt?.patientCode,
        patientName: pt?.displayName,
        bedLabel: pt?.bedLabel,
        action: req.action,
        speechPrompt: "Confirmation timed out. Request cancelled.",
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
      const devDoc = activeDispatch.device as any;
      const { yesRule, noRule } = devDoc ? await commandRuleService.getYesNoRules(devDoc) : { yesRule: undefined, noRule: undefined };
      const yesPhrase = yesRule
        ? (yesRule.eogMin > 0 ? `Blink ${yesRule.eogMin === yesRule.eogMax ? yesRule.eogMin : `${yesRule.eogMin} to ${yesRule.eogMax}`} times` : `Squeeze ${yesRule.leftMin > 0 ? "left wrist" : "right wrist"}`)
        : "Blink 3 to 4 times";
      const noPhrase = noRule
        ? (noRule.simultaneous ? `squeeze both hands together ${noRule.leftMin === noRule.leftMax ? noRule.leftMin : `${noRule.leftMin} to ${noRule.leftMax}`} times` : `squeeze left wrist`)
        : "squeeze both hands together";
      const promptText = `You asked for ${actionLabel}. ${yesPhrase} for YES to send to the nurse, or ${noPhrase} for NO to cancel.`;

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
        ruleId: activeDispatch.ruleId || activeDispatch.gestureId,
        gesture: activeDispatch.gesture || describeGestureFromRuleOrCounts(activeDispatch.ruleId, activeDispatch.counts, actionLabel),
        counts: activeDispatch.counts,
        urgent: activeDispatch.urgent,
        alarm: activeDispatch.alarm,
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
        promptText = `Did you receive assistance? Blink 3 to 4 times for Yes, or squeeze both hands together for No.`;
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
