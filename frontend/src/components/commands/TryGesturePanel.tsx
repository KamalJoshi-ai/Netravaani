"use client";

import React from "react";
import { Stepper, Switch } from "./controls";
import { EditorRule, describeRule, toCommandRule } from "./ruleModel";

export interface GestureInput {
  blinks: number;
  left: number;
  right: number;
  together: boolean;
}

export const DEFAULT_GESTURE_PRESETS = [
  {
    id: "yes",
    name: "YES",
    description: "3–4 blinks naturally (forehead EOG).",
    input: { blinks: 3, left: 0, right: 0, together: false },
  },
  {
    id: "no",
    name: "NO",
    description: "1–2 squeezes with both hands together.",
    input: { blinks: 0, left: 1, right: 1, together: true },
  },
  {
    id: "water",
    name: "WATER",
    description: "5+ rapid blinks (forehead EOG).",
    input: { blinks: 5, left: 0, right: 0, together: false },
  },
  {
    id: "call_nurse",
    name: "CALL NURSE",
    description: "3+ left wrist squeezes (urgent request).",
    input: { blinks: 0, left: 3, right: 0, together: false },
  },
  {
    id: "adjustment",
    name: "ADJUSTMENT",
    description: "3+ right wrist squeezes.",
    input: { blinks: 0, left: 0, right: 3, together: false },
  },
  {
    id: "emergency",
    name: "EMERGENCY",
    description: "3+ squeezes with both hands together (alarm + RGB red flash!).",
    input: { blinks: 0, left: 3, right: 3, together: true },
  },
];

export const SEVEN_GESTURE_PRESETS = DEFAULT_GESTURE_PRESETS;

/** "Try a gesture": shows which rule the device would fire, using the shared matcher. */
export default function TryGesturePanel({
  rules,
  input,
  onChange,
  matchIndex,
}: {
  rules: EditorRule[];
  input: GestureInput;
  onChange: (g: GestureInput) => void;
  matchIndex: number;
}) {
  const matched = matchIndex >= 0 ? rules[matchIndex] : null;
  const canTogether = input.left > 0 && input.right > 0;

  return (
    <section
      aria-labelledby="try-gesture-title"
      className="rounded-2xl border border-[#DFE3DF] dark:border-[#27374D] bg-[#EDEFEA]/40 dark:bg-[#0E151E] p-4 shadow-xs space-y-3.5"
    >
      <div>
        <h3 id="try-gesture-title" className="font-semibold text-sm text-[#18212B] dark:text-[#F0F4F7]">
          Testing Active Commands (nv-4.0.0 Firmware)
        </h3>
        <p className="text-[11px] text-[#68747C] dark:text-[#8FA1B0]">
          Try each standard gesture trigger below to see which rule matches, or adjust sensor counts manually.
        </p>
      </div>

      {/* The 6 Active Gestures Interactive Testing Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {DEFAULT_GESTURE_PRESETS.map((p, idx) => {
          const isActive =
            input.blinks === p.input.blinks &&
            input.left === p.input.left &&
            input.right === p.input.right &&
            input.together === p.input.together;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.input)}
              className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                isActive
                  ? "border-[#287A59] bg-[#EAF3EF] dark:bg-[#287A59]/20 shadow-xs ring-2 ring-[#287A59]"
                  : "border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A] hover:border-[#183A4A] dark:hover:border-[#B9D8D2]"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono text-[10px] font-bold text-teal-700 dark:text-teal-400">
                  #{idx + 1}
                </span>
                <span className="font-serif font-bold text-xs text-[#18212B] dark:text-[#F0F4F7] truncate">
                  {p.name}
                </span>
              </div>
              <p className="text-[10px] text-[#68747C] dark:text-[#8FA1B0] mt-1 leading-snug">
                {p.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-2 border-t border-[#DFE3DF] dark:border-[#27374D]">
        <Field label="Blinks">
          <Stepper label="Test blinks" value={input.blinks} onChange={(blinks) => onChange({ ...input, blinks })} />
        </Field>
        <Field label="Left squeezes">
          <Stepper label="Test left squeezes" value={input.left} onChange={(left) => onChange({ ...input, left })} />
        </Field>
        <Field label="Right squeezes">
          <Stepper label="Test right squeezes" value={input.right} onChange={(right) => onChange({ ...input, right })} />
        </Field>
        <Field label="Both hands together">
          <Switch
            label="Test squeezes made with both hands together"
            tone="green"
            checked={input.together && canTogether}
            disabled={!canTogether}
            onChange={(together) => onChange({ ...input, together })}
          />
        </Field>
      </div>

      <div
        aria-live="polite"
        className={`rounded-xl border px-3 py-2.5 text-xs transition-colors ${
          matched
            ? "border-[#BEDECE] bg-[#EAF3EF] dark:bg-[#287A59]/15 dark:border-[#287A59]/30"
            : "border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A]"
        }`}
      >
        {matched ? (
          <>
            <div className="font-semibold text-[#287A59] dark:text-[#4ADE80]">
              Fires: {matched.displayLabel?.trim() || matched.label}
              {matched.alarm ? " (raises alarm)" : matched.urgent ? " (urgent)" : ""}
            </div>
            <div className="text-[11px] text-[#68747C] dark:text-[#8FA1B0] mt-0.5">{describeRule(toCommandRule(matched))}</div>
          </>
        ) : (
          <div className="font-medium text-[#68747C] dark:text-[#8FA1B0]">No command: nothing happens.</div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-[#18212B] dark:text-[#F0F4F7]">{label}</span>
      {children}
    </div>
  );
}
