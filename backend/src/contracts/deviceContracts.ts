/**
 * Netravaani Proposed Device Message Contracts (Software & Firmware Interface)
 *
 * NOTE: These contracts represent the proposed JSON transport schemas for
 * wireless/BLE/Wi-Fi telemetry between NPG Lite/ESP32 firmware and the Netravaani backend.
 * Real physical hardware protocol verification will be completed in collaboration
 * with the embedded engineering team.
 */

export interface GestureMappingPayload {
  gestureId: string;
  gestureName: string;
  action:
    | "NEED_WATER"
    | "NEED_ASSISTANCE"
    | "PAIN_DISCOMFORT"
    | "REPOSITION"
    | "EMERGENCY"
    | "YES"
    | "NO"
    | "CALL_NURSE"
    | "WATER";
  instruction?: string;
}

/**
 * 1. Configuration Delivery Contract (Cloud -> Device)
 * Sent when staff creates or updates a gesture configuration for an assigned bed.
 */
export interface ConfigUpdateMessage {
  type: "CONFIG_UPDATE";
  deviceId: string;
  configVersion: number;
  mappings: GestureMappingPayload[];
  issuedAt: string; // ISO 8601 UTC
}

/**
 * 2. Configuration Acknowledgement Contract (Device -> Cloud)
 * Sent by device after applying or rejecting a configuration update.
 */
export interface ConfigAppliedMessage {
  type: "CONFIG_APPLIED";
  deviceId: string;
  configVersion: number;
  appliedAt: string; // ISO 8601 UTC
}

export interface ConfigFailedMessage {
  type: "CONFIG_FAILED";
  deviceId: string;
  configVersion: number;
  failureReason: string;
  failedAt: string; // ISO 8601 UTC
}

export type ConfigAckMessage = ConfigAppliedMessage | ConfigFailedMessage;

/**
 * 3. Gesture Detection Event Contract (Device -> Cloud)
 * Sent when bedside sensor verifies a patient gaze/blink/head gesture.
 */
export interface GestureDetectedMessage {
  type: "GESTURE_DETECTED";
  eventId: string; // Globally unique deduplication UUID / nanoid
  deviceId: string;
  gestureId: string; // e.g. "BLINK_DOUBLE", "GAZE_LEFT_HOLD"
  configVersion: number;
  confidenceScore?: number; // Optional hardware sensor confidence [0.0 - 1.0]
  timestamp: string | number;
}

/**
 * 4. Device Heartbeat & Telemetry Contract (Device -> Cloud)
 * Periodic keepalive sent every 15-30 seconds.
 */
export interface HeartbeatMessage {
  type: "HEARTBEAT";
  deviceId: string;
  firmwareVersion?: string;
  configVersionApplied?: number;
  batteryLevelPct?: number; // Optional battery telemetry
  timestamp?: string | number;
}
