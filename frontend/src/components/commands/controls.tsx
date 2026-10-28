"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Range } from "@/lib/commandRules";
import type { RuleVersionItem } from "@/lib/api";
import { COUNT_MAX, RangeMode, applyMode, clampCount, formatRange, rangeMode } from "./ruleModel";

/* ------------------------------------------------------------------ */
/* Reduced motion                                                      */
/* ------------------------------------------------------------------ */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

/* ------------------------------------------------------------------ */
/* Layout animation (FLIP) for add / remove / reorder                  */
/* ------------------------------------------------------------------ */
/**
 * Animates list items from their previous position to the new one whenever
 * the key order changes. Positions are taken relative to the container so
 * page scrolling between renders does not cause jumps. With reduced motion,
 * new rows only fade in.
 */
export function useFlipList(keys: string[], container: React.RefObject<HTMLElement | null>) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());
  const reduce = usePrefersReducedMotion();
  const signature = keys.join("|");

  useLayoutEffect(() => {
    const host = container.current;
    if (!host) return;
    const hostTop = host.getBoundingClientRect().top;
    const next = new Map<string, number>();
    nodes.current.forEach((el, key) => next.set(key, el.getBoundingClientRect().top - hostTop));

    const first = prev.current.size === 0;
    next.forEach((top, key) => {
      const el = nodes.current.get(key);
      if (!el || first) return;
      const before = prev.current.get(key);
      if (before === undefined) {
        el.animate(
          reduce
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: "translateY(-10px) scale(0.98)" },
                { opacity: 1, transform: "none" },
              ],
          { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
        return;
      }
      const dy = before - top;
      if (!reduce && Math.abs(dy) > 1) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
          duration: 340,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    });
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduce]);

  return useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    []
  );
}

/* ------------------------------------------------------------------ */
/* Switch                                                              */
/* ------------------------------------------------------------------ */
export function Switch({
  checked,
  onChange,
  label,
  tone = "navy",
  disabled,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tone?: "navy" | "terracotta" | "emergency" | "green";
  disabled?: boolean;
  describedBy?: string;
}) {
  const on = { navy: "bg-[#183A4A]", terracotta: "bg-[#183A4A]", emergency: "bg-[#B54747]", green: "bg-[#287A59]" }[tone];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F2] dark:focus-visible:ring-offset-[#0E151E] disabled:opacity-40 ${
        checked ? `${on} border-transparent` : "bg-[#EDEFEA] dark:bg-[#1B2636] border-[#DFE3DF] dark:border-[#27374D]"
      }`}
    >
      <span
        aria-hidden
        className={`nv-switch-thumb inline-block h-[18px] w-[18px] rounded-full bg-white shadow-xs ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Number stepper (0–20)                                               */
/* ------------------------------------------------------------------ */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = COUNT_MAX,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const btn =
    "h-8 w-8 grid place-items-center rounded-lg border border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A] text-[#18212B] dark:text-[#F0F4F7] font-semibold hover:border-[#183A4A] hover:text-[#183A4A] dark:hover:border-[#B9D8D2] dark:hover:text-[#B9D8D2] disabled:opacity-30 disabled:hover:border-[#DFE3DF] disabled:hover:text-[#18212B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A]";
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(min, Math.min(max, clampCount(Number(e.target.value)))))}
        className="h-8 w-11 rounded-lg border border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A] text-center text-sm font-semibold tabular-nums text-[#18212B] dark:text-[#F0F4F7] focus:outline-none focus:border-[#183A4A] focus:ring-1 focus:ring-[#183A4A]/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={btn} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip (hover and keyboard focus)                                  */
/* ------------------------------------------------------------------ */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="h-4 w-4 rounded-full border border-[#DFE3DF] text-[9px] font-semibold text-[#68747C] grid place-items-center hover:border-[#183A4A] hover:text-[#183A4A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A]"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-lg bg-[#18212B] px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Range cell: compact value + popover editor                          */
/* ------------------------------------------------------------------ */
const MODES: { value: RangeMode; label: string }[] = [
  { value: "exact", label: "Exactly N" },
  { value: "range", label: "Range" },
  { value: "atLeast", label: "N or more" },
  { value: "off", label: "Not used" },
];

export function RangeCell({
  value,
  onChange,
  channelLabel,
  ruleName,
  invalid,
}: {
  value: Range;
  onChange: (r: Range) => void;
  channelLabel: string;
  ruleName: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mode = rangeMode(value);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = (lo: number, hi: number) => onChange([clampCount(lo), clampCount(hi)]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${channelLabel} for ${ruleName}: ${formatRange(value) === "—" ? "not used" : formatRange(value)}. Edit`}
        onClick={() => setOpen((o) => !o)}
        className={`w-full min-w-[64px] h-10 rounded-xl border px-3 text-left flex items-center justify-between gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A] ${
          invalid
            ? "border-[#F2C4C4] bg-[#FDF1F1] text-[#B54747]"
            : mode === "off"
            ? "border-[#DFE3DF] dark:border-[#27374D] bg-[#EDEFEA]/40 dark:bg-[#0E151E] text-[#68747C] dark:text-[#8FA1B0]"
            : "border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A] text-[#18212B] dark:text-[#F0F4F7] hover:border-[#183A4A]"
        }`}
      >
        <span className="text-sm font-semibold tabular-nums">{formatRange(value)}</span>
        <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={`${channelLabel} count for ${ruleName}`}
          className="absolute left-0 top-full z-40 mt-2 w-[248px] rounded-xl border border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A] p-3 shadow-lg space-y-3"
        >
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#EDEFEA] dark:bg-[#0E151E] p-1" role="radiogroup" aria-label="Count mode">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => onChange(applyMode(value, m.value))}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A] ${
                  mode === m.value ? "bg-white dark:bg-[#1B2636] text-[#183A4A] dark:text-[#B9D8D2] shadow-xs" : "text-[#68747C] dark:text-[#8FA1B0] hover:text-[#18212B]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "exact" && (
            <Row label="N">
              <Stepper label={`${channelLabel}, exactly`} min={1} value={value[0]} onChange={(n) => set(n, n)} />
            </Row>
          )}
          {mode === "atLeast" && (
            <Row label="N or more">
              <Stepper label={`${channelLabel}, at least`} min={1} max={COUNT_MAX - 1} value={value[0]} onChange={(n) => set(n, COUNT_MAX)} />
            </Row>
          )}
          {mode === "range" && (
            <>
              <Row label="Min">
                <Stepper label={`${channelLabel}, minimum`} value={value[0]} onChange={(n) => set(n, Math.max(n, value[1]))} />
              </Row>
              <Row label="Max">
                <Stepper label={`${channelLabel}, maximum`} value={value[1]} onChange={(n) => set(Math.min(value[0], n), n)} />
              </Row>
            </>
          )}
          {mode === "off" && <p className="text-[11px] text-[#68747C] dark:text-[#8FA1B0]">This channel is not part of the gesture.</p>}

          <div className="flex items-center justify-between border-t border-[#DFE3DF] dark:border-[#27374D] pt-2 text-[11px] text-[#68747C] dark:text-[#8FA1B0]">
            <span>
              Shown as <strong className="text-[#18212B] dark:text-[#F0F4F7] font-semibold">{formatRange(value)}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="rounded-md px-2 py-1 font-semibold text-[#183A4A] dark:text-[#B9D8D2] hover:bg-[#EDEFEA] dark:hover:bg-[#1B2636]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium text-[#68747C] dark:text-[#8FA1B0]">{label}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Delivery status pill                                                */
/* ------------------------------------------------------------------ */
export function StatusPill({
  version,
  deviceSeenRecently,
  justApplied,
}: {
  version: RuleVersionItem;
  deviceSeenRecently: boolean;
  appliedVersion?: number | null;
  justApplied: boolean;
}) {
  if (version.status === "PENDING") {
    if (deviceSeenRecently) {
      return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#F0DCBE] bg-[#FBF5EC] px-3 py-1 text-xs font-semibold text-[#A86B24]">
            <span className="h-2 w-2 rounded-full bg-[#A86B24]" />
            Syncing to device…
          </span>
          <span className="text-[11px] text-[#68747C] dark:text-[#8FA1B0]">
            The device picks it up within about 10 seconds.
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#DFE3DF] bg-[#EDEFEA] px-3 py-1 text-xs font-semibold text-[#68747C]">
          <span className="h-2 w-2 rounded-full bg-[#68747C]" />
          Device offline (Configuration queued)
        </span>
        <span className="text-[11px] text-[#68747C] dark:text-[#8FA1B0]">
          Device offline: will apply when it reconnects.
        </span>
      </div>
    );
  }
  if (version.status === "APPLIED") {
    return (
      <span
        className={`inline-flex w-fit items-center gap-2 rounded-full border border-[#BEDECE] bg-[#EAF3EF] px-3 py-1 text-xs font-semibold text-[#287A59] ${
          justApplied ? "nv-applied-pop" : ""
        }`}
      >
        <span aria-hidden>✓</span>
        Active on device
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#F2C4C4] bg-[#FDF1F1] px-3 py-1 text-xs font-semibold text-[#B54747]">
        <span aria-hidden>!</span>
        Device rejected configuration
      </span>
      <span className="text-[11px] text-[#B54747]">
        {version.error ? `Device said: "${version.error}". ` : ""}
        The device is running its previous configuration.
      </span>
    </div>
  );
}
