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
      className="rounded-2xl border border-[#DFE3DF] dark:border-[#27374D] bg-[#EDEFEA]/40 dark:bg-[#0E151E] p-4 shadow-xs space-y-3"
    >
      <div>
        <h3 id="try-gesture-title" className="font-semibold text-sm text-[#18212B] dark:text-[#F0F4F7]">
          Try a gesture
        </h3>
        <p className="text-[11px] text-[#68747C] dark:text-[#8FA1B0]">Enter what the patient does in one episode to see which command fires.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
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
