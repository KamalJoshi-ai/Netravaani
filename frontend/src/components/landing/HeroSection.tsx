"use client";

import React from "react";
import dynamic from "next/dynamic";

const Hero3DCanvas = dynamic(() => import("../3d/Hero3DCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[380px] flex items-center justify-center">
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white dark:bg-[#131B2E] border border-[#CBD5E1] dark:border-[#1E293B] shadow-xs text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-ping" />
        <span>Initializing 3D Telemetry Viewport...</span>
      </div>
    </div>
  ),
});

interface HeroSectionProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function HeroSection({ onOpenAuth }: HeroSectionProps) {
  return (
    <section className="relative pt-8 sm:pt-14 pb-12 sm:pb-20 overflow-hidden border-b border-[#E2E8F0] dark:border-[#1E293B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Text & CTA Column */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Clinical Stat Eyebrow Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] dark:bg-[#064E3B] text-[#047857] dark:text-[#A7F3D0] border border-[#A7F3D0] dark:border-[#059669] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              <span>NPG v2.4 Active &bull; Sub-45ms Ocular Event Latency</span>
            </div>

            {/* Main Marketing Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] leading-[1.12]">
              Restore the Bridge Between <span className="text-[#059669]">Mind</span> and Clinical Care.
            </h1>

            {/* Value Proposition Subheadline */}
            <p className="text-sm sm:text-base lg:text-lg text-[#475569] dark:text-[#94A3B8] leading-relaxed max-w-2xl mx-auto lg:mx-0">
              NetraVaani translates involuntary micro-blinks and muscular squeeze gestures into immediate, synthesized bedside voice broadcasts. Built for ICU, motor-impaired, and locked-in patients.
            </p>

            {/* Conversion CTA Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth("signup")}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-md flex items-center justify-center gap-2"
              >
                <span>Become a Member</span>
                <span>&rarr;</span>
              </button>

              <a
                href="#simulator"
                className="w-full sm:w-auto px-5 py-3.5 rounded-xl text-sm font-bold bg-white dark:bg-[#131B2E] border border-[#CBD5E1] dark:border-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#059669] transition shadow-xs text-center"
              >
                Test Bedside Simulator
              </a>
            </div>

            {/* Micro Trust Points */}
            <div className="pt-4 flex items-center justify-center lg:justify-start gap-5 text-xs text-[#64748B] dark:text-[#94A3B8] flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="text-[#059669] font-bold">&check;</span> Strictly 1-to-1 Device Allocation
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#059669] font-bold">&check;</span> Bedside Patient Approval Privacy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#059669] font-bold">&check;</span> Real-Time Clinical Ledger
              </span>
            </div>
          </div>

          {/* Right 3D Viewport Column */}
          <div className="lg:col-span-5 relative">
            <div className="bg-white dark:bg-[#131B2E] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl p-4 sm:p-6 shadow-card relative overflow-hidden">
              
              {/* 3D Model HUD Badge */}
              <div className="flex items-center justify-between text-xs pb-2 border-b border-[#E2E8F0] dark:border-[#1E293B] mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                  <span className="font-bold font-mono text-[#0F172A] dark:text-[#F8FAFC]">NPG SMART EYEWEAR</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8]">
                  CURSOR GAZE TRACKING
                </span>
              </div>

              {/* R3F WebGL Canvas */}
              <Hero3DCanvas />

              {/* Micro Interaction Prompt */}
              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                <span>Move your cursor to direct gaze orientation</span>
                <span className="font-semibold text-[#059669] dark:text-[#34D399]">Interactive 3D Engine</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

