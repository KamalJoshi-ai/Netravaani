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
      className="rounded-2xl border border-[#CDE2D5] bg-gradient-to-br from-[#FFFCF7] to-[#F2F8F4] p-4 shadow-subtle space-y-3"
    >
      <div>
        <h3 id="try-gesture-title" className="font-heading text-sm font-bold text-[#211C19]">
          Try a gesture
        </h3>
        <p className="text-[11px] text-[#76685F]">Enter what the patient does in one episode to see which command fires.</p>
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
          matched ? "border-[#C5DDCF] bg-[#EDF5F0]" : "border-[#E5D9CA] bg-[#F5F1E9]"
        }`}
      >
        {matched ? (
          <>
            <div className="font-bold text-[#42765A]">
              Fires: {matched.displayLabel?.trim() || matched.label}
              {matched.alarm ? " (raises alarm)" : matched.urgent ? " (urgent)" : ""}
            </div>
            <div className="text-[11px] text-[#76685F] mt-0.5">{describeRule(toCommandRule(matched))}</div>
          </>
        ) : (
          <div className="font-semibold text-[#76685F]">No command: nothing happens.</div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-[#4A4039]">{label}</span>
      {children}
    </div>
  );
}
