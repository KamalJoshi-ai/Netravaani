"use client";

import React from "react";
import Image from "next/image";

interface HeroSectionProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function HeroSection({ onOpenAuth }: HeroSectionProps) {
  return (
    <section className="relative pt-10 sm:pt-16 pb-12 sm:pb-20 border-b border-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Text & CTA Column */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Clinical Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
              <span>NPG Lite Bio-Signal Assistive Communication</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              Giving voice to paralyzed and locked-in patients through involuntary bio-gestures.
            </h1>

            {/* Value Proposition */}
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              NetraVaani uses the NPG Lite bio-potential sensor array to translate micro-blinks and minute muscle twitches into instant bedside voice announcements and synchronized nurse station alerts — requiring zero vocal effort or motor control.
            </p>

            {/* Conversion CTA Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-1">
              <button
                type="button"
                onClick={() => onOpenAuth("signup")}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition shadow-xs flex items-center justify-center gap-2"
              >
                <span>Become a Member</span>
                <span>&rarr;</span>
              </button>

              <a
                href="#simulator"
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-800 hover:bg-[#EEF2F6] transition shadow-xs text-center"
              >
                Test Bedside Simulator
              </a>
            </div>

            {/* Trust Points */}
            <div className="pt-2 flex items-center justify-center lg:justify-start gap-6 text-xs text-slate-700 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="text-teal-700 font-bold">&check;</span> Strictly 1-to-1 NPG Lite Device Allocation
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-teal-700 font-bold">&check;</span> Bedside Patient Privacy &amp; Verification
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-teal-700 font-bold">&check;</span> Real-Time Nurse Desk Queue
              </span>
            </div>

            {/* Dual Hardware Quick Showcase Bar */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-center lg:justify-start gap-4 flex-wrap">
              <div className="flex items-center gap-2.5 p-2 bg-white border border-slate-300 rounded-lg shadow-2xs">
                <div className="relative w-10 h-10 rounded-md overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  <Image
                    src="/images/smart-eyewear-hero.jpg"
                    alt="NPG Lite Bio-Sensor"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="text-left text-[11px]">
                  <div className="font-semibold text-slate-900">NPG Lite Sensor</div>
                  <div className="text-slate-500 font-mono text-[10px]">Forehead EOG Blinks</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 bg-white border border-slate-300 rounded-lg shadow-2xs">
                <div className="relative w-10 h-10 rounded-md overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  <Image
                    src="/images/emg-wristband-3d.jpg"
                    alt="NPG Lite EMG Squeeze Wristbands"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="text-left text-[11px]">
                  <div className="font-semibold text-slate-900">Dual EMG Bands</div>
                  <div className="text-slate-500 font-mono text-[10px]">Left / Right Squeezes</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Product & Telemetry Showcase Column */}
          <div className="lg:col-span-5 relative">
            <div className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 shadow-xs relative overflow-hidden flex flex-col gap-3">
              
              {/* Header */}
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
                  <span className="font-semibold text-slate-900">NPG Lite Bedside Telemetry</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                  ACTIVE FEED
                </span>
              </div>

              {/* Main Clinical Photography Showcase */}
              <div className="relative w-full h-[320px] sm:h-[360px] rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                <Image
                  src="/images/bedside-icu-care.jpg"
                  alt="NetraVaani ICU Healthcare Bedside Setting"
                  fill
                  priority
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-4">
                  <div className="text-white text-xs space-y-1">
                    <div className="font-semibold text-teal-300 text-sm">Clinical ICU Bedside Environment</div>
                    <p className="text-[11px] text-slate-200">
                      Non-invasive NPG Lite bio-sensor with real-time speaker terminal and nurse call dispatch.
                    </p>
                  </div>
                </div>

                {/* Floating Telemetry Callout Pill 1 */}
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs text-[11px] space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-slate-800">Forehead EOG Channel</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">1000 Hz Sub-Microvolt</div>
                </div>

                {/* Floating Telemetry Callout Pill 2 */}
                <div className="absolute bottom-16 right-3 bg-white/95 backdrop-blur-xs border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs text-[11px] space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    <span className="font-semibold text-slate-800">Edge Gateway</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">&lt; 45ms Local Latency</div>
                </div>
              </div>

              {/* Telemetry Metric Bar */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-mono uppercase">Sensor</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">NPG Lite</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-mono uppercase">Sampling</div>
                  <div className="text-xs font-bold text-teal-800 mt-0.5">1000 Hz</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-mono uppercase">Encryption</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">AES-128</div>
                </div>
              </div>

              {/* Footer caption */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                <span>Non-Invasive Biopotential Array</span>
                <span className="font-medium text-slate-800">Upside Down Labs Sensor</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
