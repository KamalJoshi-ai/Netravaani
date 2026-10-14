"use client";

import React, { useEffect } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

/**
 * Fixed page backdrop: warm light pools, a receding 3D grid plane and a soft
 * cursor-follow light. Purely decorative, pointer-events disabled.
 */
export default function AmbientBackdrop({ grid = true }: { grid?: boolean }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(70);
  const my = useMotionValue(10);
  const sx = useSpring(mx, { stiffness: 40, damping: 20 });
  const sy = useSpring(my, { stiffness: 40, damping: 20 });
  const spot = useMotionTemplate`radial-gradient(600px circle at ${sx}% ${sy}%, rgba(197,104,69,0.10), transparent 60%)`;

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth) * 100);
      my.set((e.clientY / window.innerHeight) * 100);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduce]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#F5F0E8]">
      {/* Light pools */}
      <motion.div
        className="absolute -top-[22%] -right-[12%] h-[70vh] w-[70vh] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(197,104,69,0.20) 0%, rgba(197,104,69,0) 65%)" }}
        animate={reduce ? undefined : { x: [0, -40, 0], y: [0, 30, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[30%] -left-[15%] h-[80vh] w-[80vh] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(238,217,205,0.95) 0%, rgba(238,217,205,0) 65%)" }}
        animate={reduce ? undefined : { x: [0, 50, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Cursor light */}
      <motion.div className="absolute inset-0" style={{ background: spot }} />

      {/* Receding grid plane */}
      {grid && (
        <div className="absolute inset-x-0 bottom-0 h-[55vh] [perspective:900px]">
          <div
            className="absolute inset-x-[-50%] bottom-[-10%] h-[160%] origin-bottom"
            style={{
              transform: "rotateX(72deg)",
              backgroundImage:
                "linear-gradient(rgba(117,102,93,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(117,102,93,0.16) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              animation: reduce ? undefined : "nv-grid-drift 6s linear infinite",
              maskImage: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0) 70%)",
              WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0) 70%)",
            }}
          />
        </div>
      )}

      {/* Top vignette for header legibility */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#F5F0E8] to-transparent" />
    </div>
  );
}
