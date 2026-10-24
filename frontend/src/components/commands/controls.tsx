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
  tone = "terracotta",
  disabled,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tone?: "terracotta" | "emergency" | "green";
  disabled?: boolean;
  describedBy?: string;
}) {
  const on = { terracotta: "bg-[#AD5D3D]", emergency: "bg-[#B42318]", green: "bg-[#42765A]" }[tone];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCF7] disabled:opacity-40 ${
        checked ? `${on} border-transparent` : "bg-[#E5D9CA] border-[#D8CBBA]"
      }`}
    >
      <span
        aria-hidden
        className={`nv-switch-thumb inline-block h-[18px] w-[18px] rounded-full bg-white shadow-subtle ${
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
    "h-8 w-8 grid place-items-center rounded-lg border border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] font-bold hover:border-[#AD5D3D] hover:text-[#AD5D3D] disabled:opacity-30 disabled:hover:border-[#E5D9CA] disabled:hover:text-[#211C19] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D]";
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
        className="h-8 w-11 rounded-lg border border-[#E5D9CA] bg-[#FFFCF7] text-center text-sm font-bold tabular-nums text-[#211C19] focus:outline-none focus:border-[#AD5D3D] focus:ring-2 focus:ring-[#AD5D3D]/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
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
        className="h-4 w-4 rounded-full border border-[#C8BEB4] text-[9px] font-bold text-[#76685F] grid place-items-center hover:border-[#AD5D3D] hover:text-[#AD5D3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D]"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-lg bg-[#211C19] px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal leading-snug text-[#FFFCF7] opacity-0 shadow-hover transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
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
        className={`w-full min-w-[64px] h-10 rounded-xl border px-3 text-left flex items-center justify-between gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D] ${
          invalid
            ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
            : mode === "off"
            ? "border-[#E5D9CA] bg-[#F5F1E9]/60 text-[#9E9086] hover:border-[#C8BEB4]"
            : "border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] hover:border-[#AD5D3D]"
        }`}
      >
        <span className="font-heading text-base font-extrabold tabular-nums">{formatRange(value)}</span>
        <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={`${channelLabel} count for ${ruleName}`}
          className="nv-pop-in absolute left-0 top-full z-40 mt-2 w-[248px] rounded-xl border border-[#E5D9CA] bg-[#FFFCF7] p-3 shadow-hover space-y-3"
        >
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F0EAE1] p-1" role="radiogroup" aria-label="Count mode">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => onChange(applyMode(value, m.value))}
                className={`rounded-md px-2 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D] ${
                  mode === m.value ? "bg-[#FFFCF7] text-[#AD5D3D] shadow-subtle" : "text-[#76685F] hover:text-[#211C19]"
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
          {mode === "off" && <p className="text-[11px] text-[#76685F]">This channel is not part of the gesture.</p>}

          <div className="flex items-center justify-between border-t border-[#E5D9CA] pt-2 text-[11px] text-[#76685F]">
            <span>
              Shown as <strong className="font-heading text-[#211C19]">{formatRange(value)}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="rounded-md px-2 py-1 font-bold text-[#AD5D3D] hover:bg-[#F5ECE6]"
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
      <span className="text-[11px] font-semibold text-[#76685F]">{label}</span>
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
  appliedVersion,
  justApplied,
}: {
  version: RuleVersionItem;
  deviceSeenRecently: boolean;
  appliedVersion: number | null;
  justApplied: boolean;
}) {
  if (version.status === "PENDING") {
    if (deviceSeenRecently) {
      return (
        <div className="flex flex-col gap-1">
          <span className="nv-pending-pulse inline-flex w-fit items-center gap-2 rounded-full border border-[#E2C7B8] bg-[#FAF0E6] px-3 py-1 text-xs font-bold text-[#AD5D3D]">
            <span className="h-2 w-2 rounded-full bg-[#AD5D3D]" />
            Waiting for device… (v{version.version})
          </span>
          <span className="text-[11px] text-[#76685F]">
            The device picks it up within about 10 seconds.
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#E5D9CA] bg-[#F5ECE6] px-3 py-1 text-xs font-bold text-[#76685F]">
          <span className="h-2 w-2 rounded-full bg-[#9E8E81]" />
          Device offline (v{version.version} queued)
        </span>
        <span className="text-[11px] text-[#76685F]">
          Device offline: will apply when it reconnects.
        </span>
      </div>
    );
  }
  if (version.status === "APPLIED") {
    return (
      <span
        className={`inline-flex w-fit items-center gap-2 rounded-full border border-[#C5DDCF] bg-[#EDF5F0] px-3 py-1 text-xs font-bold text-[#42765A] ${
          justApplied ? "nv-applied-pop" : ""
        }`}
      >
        <span aria-hidden>✓</span>
        Active on device (v{version.version})
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FECDCA] bg-[#FEF3F2] px-3 py-1 text-xs font-bold text-[#B42318]">
        <span aria-hidden>!</span>
        Device rejected this version (v{version.version})
      </span>
      <span className="text-[11px] text-[#7A271A]">
        {version.error ? `Device said: "${version.error}". ` : ""}
        The device is still running {appliedVersion ? `version ${appliedVersion}` : "its previous version"}.
      </span>
    </div>
  );
}
