/**
 * NetraVaani per-device commands (firmware nv-5.0.0).
 *
 * CANONICAL SOURCE. Do not edit copies in backend/src/shared/ or frontend/src/lib/.
 * Edit this file, then run `node scripts/sync-shared.mjs`.
 */

export const GESTURES = [
  { id: "c01", text: "2–4 blinks, then 1 right squeeze",           eog: [2, 4], left: [0, 0], right: [1, 1], together: false },
  { id: "c02", text: "2–4 blinks, then 1 squeeze with both hands", eog: [2, 4], left: [1, 1], right: [1, 1], together: true },
  { id: "c03", text: "2 right squeezes",                            eog: [0, 0], left: [0, 0], right: [2, 2], together: false },
  { id: "c04", text: "2 left squeezes",                             eog: [0, 0], left: [2, 2], right: [0, 0], together: false },
  { id: "c05", text: "2 squeezes with both hands together",         eog: [0, 0], left: [2, 2], right: [2, 2], together: true },
  { id: "c06", text: "4 squeezes with both hands together",         eog: [0, 0], left: [4, 4], right: [4, 4], together: true },
  { id: "c07", text: "2 blinks, then 1 left squeeze",               eog: [2, 2], left: [1, 1], right: [0, 0], together: false },
] as const;

export type GestureId = (typeof GESTURES)[number]["id"];

export const DEFAULT_COMMANDS = [
  { id: "c01", label: "WATER" },
  { id: "c02", label: "PAIN", urgent: true },
  { id: "c03", label: "ADJUSTMENT" },
  { id: "c04", label: "CALL NURSE", urgent: true },
  { id: "c05", label: "NO" },
  { id: "c06", label: "EMERGENCY", urgent: true, alarm: true },
  { id: "c07", label: "YES" },
] as const;

export const DEFAULT_SPEECH_MAP: Record<string, string> = {
  c01: "Patient requests water",
  c02: "Patient is in pain and needs help",
  c03: "Patient needs position adjustment",
  c04: "Patient is calling the nurse",
  c05: "Patient indicated no",
  c06: "EMERGENCY: Patient needs immediate medical help!",
  c07: "Patient confirmed yes",
};

export interface DeviceCommandInput {
  id: string;
  label: string;
  displayLabel?: string;
  speechTemplate?: string;
  urgent?: boolean;
  alarm?: boolean;
}

export interface CommandError {
  message: string;
  id?: string;
}

const LABEL_RE = /^[\x20-\x7E]{1,40}$/;

export function validateCommands(cmds: DeviceCommandInput[]): CommandError[] {
  const errors: CommandError[] = [];
  const ids = GESTURES.map((g) => g.id) as string[];
  if (cmds.length !== 7) {
    errors.push({ message: "all 7 gestures (c01..c07) must be listed exactly once" });
  }
  const seen = new Set<string>();
  for (const c of cmds) {
    if (!ids.includes(c.id)) {
      errors.push({ message: `unknown gesture id "${c.id}" (use c01..c07)`, id: c.id });
    } else if (seen.has(c.id)) {
      errors.push({ message: `${c.id} listed more than once`, id: c.id });
    }
    seen.add(c.id);
    if (!LABEL_RE.test(c.label)) {
      errors.push({ message: `${c.id}: name must be 1-40 printable English (ASCII) characters`, id: c.id });
    }
  }
  if (!cmds.some((c) => c.alarm)) {
    errors.push({ message: "at least one command must raise the alarm (emergency safety)" });
  }
  return errors;
}

export interface DevicePayloadCommand {
  id: string;
  label: string;
  urgent?: boolean;
  alarm?: boolean;
}

export interface DevicePayload {
  version: number;
  commands: DevicePayloadCommand[];
  tuning?: Record<string, number>;
}

/**
 * The exact compact payload the device downloads for firmware nv-5.0.0.
 * Never includes a "rules" key.
 */
export function buildDevicePayload(
  version: number,
  cmds: DeviceCommandInput[],
  tuning?: Record<string, number>
): DevicePayload {
  const order = GESTURES.map((g) => g.id) as string[];
  const out: DevicePayload = {
    version,
    commands: [...cmds]
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map((c) => ({
        id: c.id,
        label: c.label,
        ...(c.urgent ? { urgent: true } : {}),
        ...(c.alarm ? { alarm: true } : {}),
      })),
  };
  if (tuning && Object.keys(tuning).length > 0) {
    out.tuning = tuning;
  }
  return out;
}

