"use client";

import React from "react";
import { motion } from "framer-motion";
import AmbientBackdrop from "./AmbientBackdrop";
import BrandMark from "./BrandMark";

/** Full-screen loader shown while a session is being checked */
export function SessionLoader({ label }: { label: string }) {
  return (
    <div className="relative min-h-screen grid place-items-center">
      <AmbientBackdrop grid={false} />
      <div className="flex flex-col items-center gap-5">
        <div className="relative [perspective:600px]">
          <motion.div
            animate={{ rotateY: [0, 360] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <BrandMark size={56} />
          </motion.div>
          <motion.span
            aria-hidden
            className="absolute left-1/2 -bottom-4 h-2 w-12 -translate-x-1/2 rounded-full bg-[#30251F]/20 blur-[3px]"
            animate={{ scaleX: [1, 0.6, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="text-[#75665D] tracking-wide">{label}</p>
      </div>
    </div>
  );
}

export function SiteFooter({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <footer className="relative z-10 mt-auto border-t border-[#E7DFD4]/80 bg-[#FFFCF7]/70 backdrop-blur-md py-5 text-xs text-[#75665D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="">{left}</span>
        <span className="text-[11px] font-medium flex items-center gap-2">
          <span className="nv-live-dot !w-1.5 !h-1.5" />
          {right}
        </span>
      </div>
    </footer>
  );
}
