"use client";

import React, { useEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  animate,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared easing                                                       */
/* ------------------------------------------------------------------ */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26, mass: 0.8 } as const;

/* ------------------------------------------------------------------ */
/* TiltCard: cursor-driven 3D tilt with a specular glare highlight     */
/* ------------------------------------------------------------------ */
type TiltCardProps = HTMLMotionProps<"div"> & {
  /** Max rotation in degrees. Keep it small for a premium, non-gimmicky feel. */
  intensity?: number;
  glare?: boolean;
  /** Lift on hover in px (translateZ) */
  lift?: number;
};

export function TiltCard({
  intensity = 6,
  glare = true,
  lift = 0,
  className,
  children,
  style,
  onMouseMove,
  onMouseLeave,
  ...rest
}: TiltCardProps) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);

  const rx = useSpring(useTransform(py, [0, 1], [intensity, -intensity]), { stiffness: 220, damping: 22 });
  const ry = useSpring(useTransform(px, [0, 1], [-intensity, intensity]), { stiffness: 220, damping: 22 });
  const hz = useSpring(hover, { stiffness: 200, damping: 24 });
  const z = useTransform(hz, [0, 1], [0, lift]);

  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glareOpacity = useTransform(hz, [0, 1], [0, 1]);
  const glareBg = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgba(255,252,247,0.55), rgba(255,252,247,0) 45%)`;

  return (
    <motion.div
      {...rest}
      className={cn("relative [transform-style:preserve-3d] will-change-transform", className)}
      style={
        reduce
          ? style
          : { ...style, rotateX: rx, rotateY: ry, z, transformPerspective: 1000 }
      }
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
        hover.set(1);
        onMouseMove?.(e);
      }}
      onMouseLeave={(e) => {
        px.set(0.5);
        py.set(0.5);
        hover.set(0);
        onMouseLeave?.(e);
      }}
    >
      {children as React.ReactNode}
      {glare && !reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light"
          style={{ background: glareBg, opacity: glareOpacity }}
        />
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal + Stagger                                                    */
/* ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "aside" | "header";
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </Comp>
  );
}

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const staggerChild = {
  hidden: { opacity: 0, y: 16, rotateX: -8, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    scale: 1,
    transition: { duration: 0.55, ease: EASE_OUT },
  },
  exit: { opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.25, ease: EASE_OUT } },
};

/* ------------------------------------------------------------------ */
/* Modal shell with a perspective entrance                             */
/* ------------------------------------------------------------------ */
export function MotionModal({
  open,
  onClose,
  children,
  className,
  overlayClassName,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nv-modal"
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 [perspective:1400px]",
            "bg-[#1C140F]/55 backdrop-blur-[6px]",
            overlayClassName
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn("nv-card rounded-3xl", className)}
            initial={{ opacity: 0, y: 28, rotateX: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, rotateX: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={{ transformOrigin: "50% 100%", boxShadow: "var(--shadow-3)" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control with a sliding 3D pill                            */
/* ------------------------------------------------------------------ */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  className,
  size = "md",
}: {
  items: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "relative inline-flex flex-wrap items-center gap-0.5 rounded-xl p-1 nv-well",
        className
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "relative rounded-lg font-medium transition-colors duration-200",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active ? "text-[#30251F]" : "text-[#75665D] hover:text-[#30251F]"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-[#FFFCF7] border border-[#E7DFD4]"
                style={{
                  boxShadow:
                    "0 1px 0 #fff inset, 0 1px 0 rgba(214,199,183,.9), 0 6px 14px -8px rgba(48,37,31,.35)",
                }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated counter                                                    */
/* ------------------------------------------------------------------ */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (v) => {
        node.textContent = Math.round(v).toString();
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Toast container (bottom-right, spring in)                           */
/* ------------------------------------------------------------------ */
export function Toast({
  message,
  isError,
  onClose,
}: {
  message: string | null;
  isError?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 24, scale: 0.94, rotateX: -20 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "pointer-events-auto max-w-sm rounded-2xl px-4 py-3 flex items-start gap-3 text-xs font-medium border [transform-perspective:800px]",
              isError
                ? "bg-[#FBEFE8] border-[#C56845]/50 text-[#7A361E]"
                : "bg-[#FFFCF7]/95 backdrop-blur border-[#D6C7B7] text-[#30251F]"
            )}
            style={{ boxShadow: "var(--shadow-3)" }}
          >
            <span
              className={cn(
                "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                isError ? "bg-[#C56845]" : "bg-[#30251F]"
              )}
              style={{ boxShadow: isError ? "0 0 0 4px rgba(197,104,69,.18)" : "0 0 0 4px rgba(48,37,31,.08)" }}
            />
            <span className="leading-relaxed">{message}</span>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 -mr-1 rounded-md px-1 text-[#75665D] hover:text-[#30251F]"
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { AnimatePresence, motion };
