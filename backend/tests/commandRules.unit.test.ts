import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CommandRule,
  DEFAULT_RULES,
  MAX_PAYLOAD_BYTES,
  buildDevicePayload,
  matchRule,
  payloadBytes,
  validateRuleSet,
  validateRuleSetAll,
} from "../src/shared/commandRules.js";

const defaults = (): CommandRule[] => DEFAULT_RULES.map((r) => ({ ...r }));
const zero: [number, number] = [0, 0];

describe("Shared command-rule module: one source for browser and server", () => {
  it("backend and frontend copies are identical to shared/commandRules.ts", () => {
    const root = resolve(__dirname, "../..");
    const canonical = readFileSync(resolve(root, "shared/commandRules.ts"), "utf8");
    expect(readFileSync(resolve(root, "backend/src/shared/commandRules.ts"), "utf8")).toBe(canonical);
    expect(readFileSync(resolve(root, "frontend/src/lib/commandRules.ts"), "utf8")).toBe(canonical);
  });
});

describe("validateRuleSet (firmware nv-4.0.0 cases)", () => {
  it("defaults are valid", () => {
    expect(validateRuleSet(defaults())).toBeNull();
  });

  it("defaults + TV + family is valid (8 rules)", () => {
    const rules = [
      ...defaults(),
      { id: "tv", label: "Turn on the TV", eog: [1, 1] as [number, number], emgLeft: [1, 1] as [number, number], emgRight: zero },
      { id: "family", label: "Call my family", eog: zero, emgLeft: zero, emgRight: [5, 6] as [number, number] },
    ];
    expect(rules).toHaveLength(8);
    expect(validateRuleSet(rules)).toBeNull();
  });

  it("a rule overlapping YES is a conflict between rules 1 and 7", () => {
    const rules = [...defaults(), { id: "x", label: "X", eog: [3, 4] as [number, number], emgLeft: zero, emgRight: zero }];
    expect(validateRuleSet(rules)).toEqual({ message: "two rules can match the same gesture", rules: [0, 6] });
  });

  it("only the YES rule has no alarm", () => {
    expect(validateRuleSet([defaults()[0]])?.message).toBe("at least one rule must raise the alarm (emergency safety)");
  });

  it("right [7,25] is out of range", () => {
    const rules = [...defaults(), { id: "x", label: "X", eog: zero, emgLeft: zero, emgRight: [7, 25] as [number, number] }];
    expect(validateRuleSet(rules)?.message).toBe("counts must be 0-20");
  });

  it("'both hands together' needs a squeeze on each hand", () => {
    const rules = [
      ...defaults(),
      { id: "x", label: "X", eog: zero, emgLeft: [5, 5] as [number, number], emgRight: zero, simultaneous: true },
    ];
    expect(validateRuleSet(rules)?.message).toBe("'both hands together' needs at least 1 squeeze on each hand");
  });

  it("a second rule with id 'yes' is a duplicate id", () => {
    const rules = [...defaults(), { id: "yes", label: "YES AGAIN", eog: [10, 10] as [number, number], emgLeft: zero, emgRight: zero }];
    expect(validateRuleSet(rules)?.message).toBe("two rules have the same id");
  });

  it("a rule with every range [0,0] needs at least one channel", () => {
    const rules = [...defaults(), { id: "x", label: "X", eog: zero, emgLeft: zero, emgRight: zero }];
    expect(validateRuleSet(rules)?.message).toBe("at least one channel needs a minimum of 1 or more");
  });
});

describe("matchRule with the defaults (incidentalBlinks = 1)", () => {
  // [blinks, left, right, together, expected rule id or null]
  const cases: [number, number, number, boolean, string | null][] = [
    [2, 0, 0, false, "yes"],
    [3, 0, 0, false, "yes"],
    [4, 0, 0, false, "water"],
    [9, 0, 0, false, "water"],
    [1, 0, 0, false, null],
    [0, 1, 1, true, "no"],
    [0, 1, 1, false, null],
    [0, 3, 0, false, "call_nurse"],
    [1, 3, 0, false, "call_nurse"],
    [2, 3, 0, false, null],
    [0, 0, 3, false, "adjustment"],
    [0, 3, 3, true, "emergency"],
    [0, 5, 5, true, "emergency"],
    [0, 2, 2, true, null],
    [0, 2, 0, false, null],
  ];

  it.each(cases)("blinks %i, left %i, right %i, together %s fires %s", (b, l, r, together, expected) => {
    const rules = defaults();
    const pairs = together ? Math.min(l, r) : 0;
    const i = matchRule(rules, b, l, r, pairs, 1);
    expect(i === -1 ? null : rules[i].id).toBe(expected);
  });
});

describe("device payload", () => {
  it("omits false flags and keeps the compact worst case well under the device limit", () => {
    const payload = buildDevicePayload(1, defaults());
    expect(payload.rules[0]).toEqual({ id: "yes", label: "YES", eog: [2, 3], emgLeft: [0, 0], emgRight: [0, 0] });
    expect("simultaneous" in payload.rules[0]).toBe(false);

    const worst: CommandRule[] = Array.from({ length: 10 }, (_, i) => ({
      id: `rule_${String(i).padStart(2, "0")}_xxxxxxxxxxxxxxx`.slice(0, 24),
      label: "W".repeat(40),
      eog: [10 + i, 20] as [number, number],
      emgLeft: [10, 20] as [number, number],
      emgRight: [10, 20] as [number, number],
      simultaneous: true,
      urgent: true,
      alarm: true,
    }));
    expect(payloadBytes(buildDevicePayload(99999, worst))).toBeLessThan(MAX_PAYLOAD_BYTES);
  });

  it("validateRuleSetAll reports every conflict at once", () => {
    const rules = [
      ...defaults(),
      { id: "a", label: "A", eog: [3, 4] as [number, number], emgLeft: zero, emgRight: zero },
      { id: "b", label: "B", eog: [5, 5] as [number, number], emgLeft: zero, emgRight: zero },
    ];
    const conflicts = validateRuleSetAll(rules).filter((e) => e.message === "two rules can match the same gesture");
    expect(conflicts.map((c) => c.rules)).toEqual(expect.arrayContaining([[0, 6], [2, 6], [2, 7]]));
  });
});
