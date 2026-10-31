import {
  COUNT_MAX,
  CommandRule,
  DEFAULT_RULES,
  MANDATORY_COMMAND_IDS,
  MAX_RULES,
  Range,
  isMandatoryRule,
  matchRule,
  validateRuleSetAll,
} from "@/lib/commandRules";
import type { CommandRuleItem } from "@/lib/api";

/** A rule row in the editor. `uid` is a stable React key; `idEdited` stops auto-generating the id. */
export interface EditorRule extends CommandRuleItem {
  uid: string;
  idEdited: boolean;
}

export type Channel = "eog" | "emgLeft" | "emgRight";
export type RangeMode = "exact" | "range" | "atLeast" | "off";

export interface CanonicalGesture {
  id: string;
  gestureNumber: number;
  title: string;
  description: string;
  sensorSummary: string;
  eog: Range;
  emgLeft: Range;
  emgRight: Range;
  simultaneous?: boolean;
  urgent?: boolean;
  alarm?: boolean;
  defaultLabel: string;
  defaultDisplayLabel: string;
  defaultSpeechTemplate: string;
}

export const CANONICAL_GESTURES: CanonicalGesture[] = [
  {
    id: "yes",
    gestureNumber: 1,
    title: "3–4 blinks",
    description: "Blink naturally 3 to 4 times (forehead EOG)",
    sensorSummary: "Blinks 3–4",
    eog: [3, 4],
    emgLeft: [0, 0],
    emgRight: [0, 0],
    defaultLabel: "YES",
    defaultDisplayLabel: "YES",
    defaultSpeechTemplate: "Patient confirmed yes",
  },
  {
    id: "no",
    gestureNumber: 2,
    title: "1–2 squeezes with both hands together",
    description: "Squeeze both wrists simultaneously 1 to 2 times",
    sensorSummary: "Both wrists ×1–2 together",
    eog: [0, 0],
    emgLeft: [1, 2],
    emgRight: [1, 2],
    simultaneous: true,
    defaultLabel: "NO",
    defaultDisplayLabel: "NO",
    defaultSpeechTemplate: "Patient indicated no",
  },
  {
    id: "water",
    gestureNumber: 3,
    title: "5+ blinks",
    description: "Blink rapidly 5 or more times (forehead EOG)",
    sensorSummary: "Blinks 5+",
    eog: [5, 20],
    emgLeft: [0, 0],
    emgRight: [0, 0],
    defaultLabel: "WATER",
    defaultDisplayLabel: "Water",
    defaultSpeechTemplate: "Patient requests water",
  },
  {
    id: "call_nurse",
    gestureNumber: 4,
    title: "3+ left squeezes",
    description: "Squeeze left wrist 3 or more times (within 5s)",
    sensorSummary: "Left wrist ×3+",
    eog: [0, 0],
    emgLeft: [3, 20],
    emgRight: [0, 0],
    urgent: true,
    defaultLabel: "CALL NURSE",
    defaultDisplayLabel: "Call Nurse",
    defaultSpeechTemplate: "Patient is calling the nurse",
  },
  {
    id: "adjustment",
    gestureNumber: 5,
    title: "3+ right squeezes",
    description: "Squeeze right wrist 3 or more times (within 5s)",
    sensorSummary: "Right wrist ×3+",
    eog: [0, 0],
    emgLeft: [0, 0],
    emgRight: [3, 20],
    defaultLabel: "ADJUSTMENT",
    defaultDisplayLabel: "Adjustment",
    defaultSpeechTemplate: "Patient needs position adjustment",
  },
  {
    id: "emergency",
    gestureNumber: 6,
    title: "3+ squeezes with both hands together",
    description: "Squeeze both wrists simultaneously 3 or more times (Raises alarm & flashes red)",
    sensorSummary: "Both wrists ×3+ together (Alarm)",
    eog: [0, 0],
    emgLeft: [3, 20],
    emgRight: [3, 20],
    simultaneous: true,
    urgent: true,
    alarm: true,
    defaultLabel: "EMERGENCY / SEVERE PAIN",
    defaultDisplayLabel: "EMERGENCY",
    defaultSpeechTemplate: "EMERGENCY: Patient needs immediate medical help!",
  },
];

export function matchCanonicalGesture(rule: { eog: Range; emgLeft: Range; emgRight: Range; simultaneous?: boolean; id?: string }): CanonicalGesture | undefined {
  if (rule.id) {
    const byId = CANONICAL_GESTURES.find((g) => g.id === rule.id);
    if (byId) return byId;
  }
  return CANONICAL_GESTURES.find(
    (g) =>
      g.eog[0] === rule.eog[0] &&
      g.eog[1] === rule.eog[1] &&
      g.emgLeft[0] === rule.emgLeft[0] &&
      g.emgLeft[1] === rule.emgLeft[1] &&
      g.emgRight[0] === rule.emgRight[0] &&
      g.emgRight[1] === rule.emgRight[1] &&
      Boolean(g.simultaneous) === Boolean(rule.simultaneous)
  );
}

export const CHANNELS: { key: Channel; title: string; short: string; unit: string }[] = [
  { key: "eog", title: "Forehead EOG", short: "Blinks", unit: "blink" },
  { key: "emgLeft", title: "Left wrist EMG", short: "Left squeezes", unit: "left squeeze" },
  { key: "emgRight", title: "Right wrist EMG", short: "Right squeezes", unit: "right squeeze" },
];

let uidCounter = 0;
export const newUid = () => `r${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function toEditorRules(rules: CommandRuleItem[]): EditorRule[] {
  return rules.map((r) => ({ ...r, eog: [...r.eog], emgLeft: [...r.emgLeft], emgRight: [...r.emgRight], uid: newUid(), idEdited: true }) as EditorRule);
}

export const defaultEditorRules = () => toEditorRules(DEFAULT_RULES);

/** What the API and validator receive: no editor-only fields, optional flags only when true. */
export function toCommandRule(r: EditorRule): CommandRuleItem {
  const out: CommandRuleItem = {
    id: r.id,
    label: r.label,
    eog: [r.eog[0], r.eog[1]],
    emgLeft: [r.emgLeft[0], r.emgLeft[1]],
    emgRight: [r.emgRight[0], r.emgRight[1]],
  };
  if (r.simultaneous) out.simultaneous = true;
  if (r.urgent) out.urgent = true;
  if (r.alarm) out.alarm = true;
  if (r.displayLabel?.trim()) out.displayLabel = r.displayLabel.trim();
  if (r.speechTemplate?.trim()) out.speechTemplate = r.speechTemplate.trim();
  return out;
}

/* ---------------- ranges ---------------- */

export function rangeMode([lo, hi]: Range): RangeMode {
  if (lo === 0 && hi === 0) return "off";
  if (hi === COUNT_MAX && lo < COUNT_MAX) return "atLeast";
  if (lo === hi) return "exact";
  return "range";
}

/** Compact cell text: 2–3, 3, 4+ or — */
export function formatRange([lo, hi]: Range): string {
  const mode = rangeMode([lo, hi]);
  if (mode === "off") return "—";
  if (mode === "atLeast") return `${lo}+`;
  if (mode === "exact") return `${lo}`;
  return `${lo}–${hi}`;
}

/** Applies a mode while keeping the user's numbers where they still make sense. */
export function applyMode([lo, hi]: Range, mode: RangeMode): Range {
  const base = Math.max(1, lo || hi || 1);
  switch (mode) {
    case "off":
      return [0, 0];
    case "exact":
      return [base, base];
    case "atLeast":
      return [Math.min(base, COUNT_MAX - 1), COUNT_MAX];
    case "range":
      return [base, Math.min(COUNT_MAX, Math.max(base + 1, hi === COUNT_MAX ? base + 1 : hi))];
  }
}

export const clampCount = (n: number) => Math.max(0, Math.min(COUNT_MAX, Math.round(Number.isFinite(n) ? n : 0)));

/* ---------------- rule key ---------------- */

/** Lowercase, spaces to _, other characters stripped, max 24, de-duplicated. */
export function ruleKeyFromLabel(label: string, taken: Set<string>): string {
  let base = label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  if (!base) base = "command";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, 24 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

/* ---------------- plain-language summary ---------------- */

function countPhrase([lo, hi]: Range): string {
  const mode = rangeMode([lo, hi]);
  if (mode === "atLeast") return `${lo} or more times`;
  if (mode === "exact") return lo === 1 ? "once" : lo === 2 ? "twice" : `${lo} times`;
  return `${lo} to ${hi} times`;
}

/** e.g. "2–4 blinks, then 1 right squeeze (within 5s) → WATER" */
export function describeRule(r: CommandRuleItem): string {
  const name = r.displayLabel?.trim() || r.label || "this command";
  const g = CANONICAL_GESTURES.find((x) => x.id === r.id);
  const flags: string[] = [];
  if (r.alarm) flags.push("raises alarm");
  else if (r.urgent) flags.push("urgent");
  const flagStr = flags.length ? ` (${flags.join(", ")})` : "";

  if (g) {
    return `${g.description} → ${name}${flagStr}`;
  }

  const parts: string[] = [];
  const blink = rangeMode(r.eog) !== "off";
  const left = rangeMode(r.emgLeft) !== "off";
  const right = rangeMode(r.emgRight) !== "off";

  if (blink) parts.push(`Blink ${countPhrase(r.eog)}`);
  if (r.simultaneous && left && right) {
    const same = r.emgLeft[0] === r.emgRight[0] && r.emgLeft[1] === r.emgRight[1];
    parts.push(
      same
        ? `squeeze both hands together ${countPhrase(r.emgLeft)}`
        : `squeeze both hands together (left ${countPhrase(r.emgLeft)}, right ${countPhrase(r.emgRight)})`
    );
  } else {
    if (left) parts.push(`squeeze the left hand ${countPhrase(r.emgLeft)}`);
    if (right) parts.push(`squeeze the right hand ${countPhrase(r.emgRight)}`);
  }

  let sentence = parts.join(" and ");
  if (!sentence) return `No gesture set → ${name}`;
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (blink && !left && !right) sentence += " (no squeezes)";

  return `${sentence} → ${name}${flagStr}`;
}

/* ---------------- validation for the editor ---------------- */

export interface RowIssue {
  message: string;
  field: string;
  partner?: number; // other row in a conflict / duplicate id
  conflictId?: number; // shared number shown on both conflicting rows
}

export interface EditorValidation {
  rows: RowIssue[][];
  setErrors: string[];
  conflicts: { a: number; b: number; id: number; message: string }[];
  warnings: string[][];
  setWarnings: string[];
  errorCount: number;
}

function fieldFor(message: string): string {
  if (message.startsWith("id") || message.includes("same id")) return "id";
  if (message.startsWith("label")) return "label";
  if (message.includes("both hands together")) return "simultaneous";
  return "counts";
}

const FALSE_TRIGGER = "High false-trigger risk: a single blink/squeeze also happens naturally.";
const TIRING = "Tiring for the patient.";

export function validateEditor(rules: EditorRule[]): EditorValidation {
  const plain = rules.map(toCommandRule) as CommandRule[];
  const rows: RowIssue[][] = rules.map(() => []);
  const setErrors: string[] = [];
  const conflicts: EditorValidation["conflicts"] = [];

  for (const e of validateRuleSetAll(plain)) {
    if (e.rules.length === 0) setErrors.push(e.message);
    else if (e.rules.length === 1) rows[e.rules[0]].push({ message: e.message, field: fieldFor(e.message) });
    else {
      const [a, b] = e.rules;
      const id = conflicts.length + 1;
      conflicts.push({ a, b, id, message: e.message });
      rows[a].push({ message: e.message, field: fieldFor(e.message), partner: b, conflictId: id });
      rows[b].push({ message: e.message, field: fieldFor(e.message), partner: a, conflictId: id });
    }
  }

  const warnings = plain.map((r) => {
    const w: string[] = [];
    if (!validateRuleSetAll([r]).some((e) => e.rules.length > 0)) {
      const single = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ].some(([b, l, rt]) => matchRule([r], b, l, rt, 0) === 0);
      if (single) w.push(FALSE_TRIGGER);
      if (r.eog[0] + r.emgLeft[0] + r.emgRight[0] > 8) w.push(TIRING);
    }
    return w;
  });

  const setWarnings: string[] = [];
  if (plain.length > 0 && !plain.some((r) => r.urgent)) setWarnings.push("No command is marked urgent.");

  // A conflict is one problem even though it is shown on both rows
  const errorCount =
    setErrors.length + conflicts.length + rows.reduce((n, r) => n + r.filter((i) => i.partner === undefined).length, 0);
  return { rows, setErrors, conflicts, warnings, setWarnings, errorCount };
}

/** Index of the rule that would fire for a test gesture, or -1. */
export function tryGesture(rules: EditorRule[], blinks: number, left: number, right: number, together: boolean): number {
  const pairs = together ? Math.min(left, right) : 0;
  return matchRule(rules.map(toCommandRule) as CommandRule[], blinks, left, right, pairs);
}

export { MAX_RULES, COUNT_MAX, MANDATORY_COMMAND_IDS, isMandatoryRule };
