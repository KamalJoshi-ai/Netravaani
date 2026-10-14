"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * NetraVaani mark: a bevelled espresso tile holding an abstract iris.
 * Rotates gently in 3D on hover.
 */
export default function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <motion.div
      className={cn("relative shrink-0 rounded-xl [transform-style:preserve-3d]", className)}
      style={{
        width: size,
        height: size,
        transformPerspective: 600,
        background: "linear-gradient(150deg, #3A2D26 0%, #1C140F 70%)",
        boxShadow:
          "0 1px 0 rgba(255,252,247,.18) inset, 0 -2px 0 rgba(0,0,0,.35) inset, 0 3px 0 #0D0806, 0 10px 20px -8px rgba(28,20,15,.6)",
      }}
      whileHover={{ rotateY: 18, rotateX: -10, scale: 1.04 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" style={{ transform: "translateZ(8px)" }}>
        <defs>
          <radialGradient id="nv-iris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1C140F" />
            <stop offset="38%" stopColor="#1C140F" />
            <stop offset="42%" stopColor="#E58A62" />
            <stop offset="80%" stopColor="#C56845" />
            <stop offset="100%" stopColor="#7A361E" />
          </radialGradient>
        </defs>
        <path
          d="M6 20c3.8-6 8.6-9 14-9s10.2 3 14 9c-3.8 6-8.6 9-14 9S9.8 26 6 20z"
          fill="none"
          stroke="#EED9CD"
          strokeOpacity=".85"
          strokeWidth="1.4"
        />
        <circle cx="20" cy="20" r="6.2" fill="url(#nv-iris)" />
        <circle cx="22.2" cy="17.8" r="1.3" fill="#FFFCF7" opacity=".9" />
      </svg>
    </motion.div>
  );
}
