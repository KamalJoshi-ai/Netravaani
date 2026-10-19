/**
 * NetraVaani command rules: validation and matching.
 *
 * CANONICAL SOURCE. Do not edit the copies in backend/src/shared/ or
 * frontend/src/lib/. Edit this file, then run `node scripts/sync-shared.mjs`.
 * A backend test fails if the copies drift from this file.
 *
 * The section between PORT-START and PORT-END is a direct port of the firmware's
 * nv_rules.cpp (nv-4.0.0). Keep it identical, or the device will reject configs
 * the dashboard accepted.
 */

// ---- PORT-START (firmware nv_rules.cpp) ----
export const MAX_RULES = 10;
export const COUNT_MAX = 20;

export type Range = [number, number];
export interface CommandRule {
  id: string;              // ruleKey sent to the device
  label: string;           // sent to the device
  eog: Range;
  emgLeft: Range;
  emgRight: Range;
  simultaneous?: boolean;
  urgent?: boolean;
  alarm?: boolean;
}

const ID_RE = /^[a-z0-9_-]{1,24}$/;
const LABEL_RE = /^[\x20-\x7E]{1,40}$/; // printable ASCII only

export function validateRule(r: CommandRule): string | null {
  if (!ID_RE.test(r.id)) return "id must be 1-24 characters: a-z, 0-9, _ or -";
  if (!LABEL_RE.test(r.label)) return "label must be 1-40 printable characters";
  for (const [lo, hi] of [r.eog, r.emgLeft, r.emgRight]) {
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return "counts must be whole numbers";
    if (lo > hi) return "range minimum is above its maximum";
    if (lo < 0 || hi > COUNT_MAX) return "counts must be 0-20";
  }
  if (r.eog[0] === 0 && r.emgLeft[0] === 0 && r.emgRight[0] === 0)
    return "at least one channel needs a minimum of 1 or more";
  if (r.simultaneous) {
    if (r.emgLeft[0] < 1 || r.emgRight[0] < 1)
      return "'both hands together' needs at least 1 squeeze on each hand";
    if (r.emgLeft[1] < r.emgRight[0] || r.emgRight[1] < r.emgLeft[0])
      return "'both hands together' needs overlapping left and right ranges";
  }
  return null;
}

const overlap = (a: Range, b: Range) => a[0] <= b[1] && b[0] <= a[1];

// A squeeze rule whose blink range is 0-0 also accepts a few natural blinks.
function effectiveEog(r: CommandRule, incidentalBlinks: number): Range {
  if (r.eog[1] === 0 && r.emgLeft[0] + r.emgRight[0] >= 1) return [r.eog[0], incidentalBlinks];
  return r.eog;
}

export function rulesConflict(a: CommandRule, b: CommandRule, incidentalBlinks = 1): boolean {
  const box =
    overlap(effectiveEog(a, incidentalBlinks), effectiveEog(b, incidentalBlinks)) &&
    overlap(a.emgLeft, b.emgLeft) &&
    overlap(a.emgRight, b.emgRight);
  if (!box) return false;
  // a "together" rule and an ordinary rule may overlap: pairing decides between them
  return !!a.simultaneous === !!b.simultaneous;
}

export interface RuleSetError { message: string; rules: number[] } // 0-based indices

export function validateRuleSet(rules: CommandRule[], incidentalBlinks = 1): RuleSetError | null {
  if (rules.length < 1 || rules.length > MAX_RULES) return { message: "a rule set needs 1 to 10 rules", rules: [] };
  let anyAlarm = false;
  for (let i = 0; i < rules.length; i++) {
    const e = validateRule(rules[i]);
    if (e) return { message: e, rules: [i] };
    if (rules[i].alarm) anyAlarm = true;
    for (let j = 0; j < i; j++) {
      if (rules[i].id === rules[j].id) return { message: "two rules have the same id", rules: [j, i] };
      if (rulesConflict(rules[i], rules[j], incidentalBlinks))
        return { message: "two rules can match the same gesture", rules: [j, i] };
    }
  }
  if (!anyAlarm) return { message: "at least one rule must raise the alarm (emergency safety)", rules: [] };
  return null;
}

// Which rule fires for an episode. pairs = how many left squeezes had a right squeeze
// at the same time. Returns the rule index or -1.
export function matchRule(rules: CommandRule[], blinks: number, left: number, right: number,
                          pairs: number, incidentalBlinks = 1): number {
  const c = (n: number) => Math.min(n, COUNT_MAX);
  blinks = c(blinks); left = c(left); right = c(right);
  const allPaired = pairs === left && pairs === right && left > 0;
  const inR = (v: number, r: Range) => v >= r[0] && v <= r[1];
  let plain = -1, together = -1;
  rules.forEach((r, i) => {
    if (!inR(blinks, effectiveEog(r, incidentalBlinks)) || !inR(left, r.emgLeft) || !inR(right, r.emgRight)) return;
    if (r.simultaneous) { if (allPaired && together < 0) together = i; }
    else if (plain < 0) plain = i;
  });
  return together >= 0 ? together : plain;
}
// ---- PORT-END ----

/* ------------------------------------------------------------------------ */
/* Dashboard additions (not part of the firmware port)                      */
/* ------------------------------------------------------------------------ */

/** Largest config response the device accepts (it stores it in a ~3,900-byte slot). */
export const MAX_PAYLOAD_BYTES = 3500;

/** The six rules every newly registered device starts with. */
export const DEFAULT_RULES: CommandRule[] = [
  { id: "yes", label: "YES", eog: [2, 3], emgLeft: [0, 0], emgRight: [0, 0] },
  { id: "no", label: "NO", eog: [0, 0], emgLeft: [1, 1], emgRight: [1, 1], simultaneous: true },
  { id: "water", label: "WATER", eog: [4, 20], emgLeft: [0, 0], emgRight: [0, 0] },
  { id: "call_nurse", label: "CALL NURSE", eog: [0, 0], emgLeft: [3, 3], emgRight: [0, 0], urgent: true },
  { id: "adjustment", label: "ADJUSTMENT", eog: [0, 0], emgLeft: [0, 0], emgRight: [3, 3] },
  {
    id: "emergency",
    label: "EMERGENCY / SEVERE PAIN",
    eog: [0, 0],
    emgLeft: [3, 20],
    emgRight: [3, 20],
    simultaneous: true,
    urgent: true,
    alarm: true,
  },
];

export interface DeviceConfigPayload {
  version: number;
  rules: CommandRule[];
}

/**
 * Builds exactly what GET /api/devices/:id/config returns. Optional flags are
 * omitted when false, key order is fixed, and tuning is left out so the
 * device keeps its built-in defaults.
 */
export function buildDevicePayload(version: number, rules: CommandRule[]): DeviceConfigPayload {
  return {
    version,
    rules: rules.map((r) => {
      const out: CommandRule = {
        id: r.id,
        label: r.label,
        eog: [r.eog[0], r.eog[1]],
        emgLeft: [r.emgLeft[0], r.emgLeft[1]],
        emgRight: [r.emgRight[0], r.emgRight[1]],
      };
      if (r.simultaneous) out.simultaneous = true;
      if (r.urgent) out.urgent = true;
      if (r.alarm) out.alarm = true;
      return out;
    }),
  };
}

/** Compact JSON size in bytes, as the device receives it. */
export function payloadBytes(payload: DeviceConfigPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/**
 * Every problem in a rule set at once, for the editor. The server still makes
 * its yes/no decision with validateRuleSet above.
 */
export function validateRuleSetAll(rules: CommandRule[], incidentalBlinks = 1): RuleSetError[] {
  const errors: RuleSetError[] = [];
  if (rules.length < 1 || rules.length > MAX_RULES) errors.push({ message: "a rule set needs 1 to 10 rules", rules: [] });
  rules.forEach((r, i) => {
    const e = validateRule(r);
    if (e) errors.push({ message: e, rules: [i] });
  });
  for (let i = 0; i < rules.length; i++) {
    for (let j = 0; j < i; j++) {
      if (rules[i].id === rules[j].id) errors.push({ message: "two rules have the same id", rules: [j, i] });
      else if (!validateRule(rules[i]) && !validateRule(rules[j]) && rulesConflict(rules[i], rules[j], incidentalBlinks))
        errors.push({ message: "two rules can match the same gesture", rules: [j, i] });
    }
  }
  if (rules.length > 0 && !rules.some((r) => r.alarm))
    errors.push({ message: "at least one rule must raise the alarm (emergency safety)", rules: [] });
  return errors;
}
