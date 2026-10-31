"use client";

import React, { useState } from "react";
import Image from "next/image";

interface StepItem {
  id: string;
  step: string;
  title: string;
  badge: string;
  description: string;
  image: string;
  highlights: string[];
  specs: { label: string; value: string }[];
}

export default function ClinicalJourneySection() {
  const steps: StepItem[] = [
    {
      id: "ingestion",
      step: "01",
      title: "Non-Invasive Bio-Signal Capture",
      badge: "Dry Biopotential Sensors",
      image: "/images/smart-eyewear-hero.jpg",
      description:
        "Medical-grade dry electrodes connected via the NPG Lite bio-sensor detect micro-voltage deflections from involuntary corneal dipoles and minute muscle squeezes.",
      highlights: [
        "Forehead EOG blinks (3-4 blinks for YES)",
        "Wrist EMG squeezes (left, right, or bilateral)",
        "Zero motor or vocal exertion required",
      ],
      specs: [
        { label: "Sampling Rate", value: "1000 Hz" },
        { label: "Electrode Type", value: "Dry Ag/AgCl" },
        { label: "Impedance", value: "< 10 kΩ" },
      ],
    },
    {
      id: "wristband",
      step: "02",
      title: "Sub-Threshold Dual Wrist Squeeze",
      badge: "Bilateral EMG",
      image: "/images/emg-wristband-3d.jpg",
      description:
        "Ergonomic matte silicone bands with titanium housings detect micro muscle contractions even when eye gaze is fatigued, providing an essential secondary channel.",
      highlights: [
        "1-2 simultaneous squeezes trigger NO / Cancel",
        "3+ left squeezes dispatch Urgent Call Nurse",
        "3+ bilateral squeezes trigger Emergency Alarm",
      ],
      specs: [
        { label: "Filtering", value: "Bandpass 20-450Hz" },
        { label: "Sensitivity", value: "0.5 µV" },
        { label: "Weight", value: "28 grams" },
      ],
    },
    {
      id: "bedside",
      step: "03",
      title: "Bedside Voice Synthesis & Verification",
      badge: "Acoustic Feedback",
      image: "/images/bedside-icu-care.jpg",
      description:
        "A dedicated bedside speaker immediately announces patient requests with natural voice synthesis, offering a 5-second window to confirm or cancel via simple gesture.",
      highlights: [
        "Reassures locked-in patients immediately",
        "Speaks custom phrases configured by the nurse",
        "Reduces accidental nurse station dispatches",
      ],
      specs: [
        { label: "Confirmation Window", value: "5 Seconds" },
        { label: "Audio Output", value: "Natural TTS" },
        { label: "Wake Lock", value: "24/7 Bedside" },
      ],
    },
    {
      id: "nurse",
      step: "04",
      title: "Synchronized Nurse Command Hub",
      badge: "ICU Station Alert",
      image: "/images/nurse-station-hologram.jpg",
      description:
        "Prioritized dispatch directly to central nursing stations and mobile tablets, displaying live patient vitals, gesture counts, and resolution confirmation.",
      highlights: [
        "Instant visual and audio alert chimes",
        "Emergency red strobe priority handling",
        "End-to-end auditability and patient assignment",
      ],
      specs: [
        { label: "Alert Latency", value: "< 45 ms" },
        { label: "Protocol", value: "BLE 5.0 + WebSocket" },
        { label: "Security", value: "AES-128 Encryption" },
      ],
    },
  ];

  const [activeStep, setActiveStep] = useState<number>(0);
  const current = steps[activeStep];

  return (
    <section className="py-16 sm:py-24 bg-white border-b border-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            End-to-End Clinical Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
            From Micro-Twitch to Spoken Care
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Follow the sub-second journey of an involuntary bio-potential signal from patient sensor to bedside speaker and central nurse triage.
          </p>
        </div>

        {/* Step Selector Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {steps.map((s, idx) => {
            const isCurrent = idx === activeStep;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`p-3.5 rounded-xl border text-left transition shadow-xs flex flex-col justify-between gap-2 ${
                  isCurrent
                    ? "bg-teal-50/70 border-teal-700 ring-1 ring-teal-700/20"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-xs font-bold ${isCurrent ? "text-teal-800" : "text-slate-400"}`}>
                    STEP {s.step}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isCurrent ? "bg-teal-600 animate-pulse" : "bg-slate-300"}`} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {s.badge}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Step Feature Stage (Image + Details) */}
        <div className="bg-[#EEF2F6]/60 border border-slate-300 rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-xs">
          {/* Left: 3D High-Res Product & Clinical Image */}
          <div className="lg:col-span-7">
            <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-slate-900">
              <Image
                src={current.image}
                alt={current.title}
                fill
                priority
                className="object-cover transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent flex items-end p-5">
                <div className="text-white space-y-1">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-teal-600 text-white font-semibold">
                    {current.badge}
                  </span>
                  <div className="text-sm sm:text-base font-semibold">{current.title}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Technical Specs & Key Clinical Features */}
          <div className="lg:col-span-5 space-y-5">
            <div>
              <span className="text-xs font-mono font-bold text-teal-800">STAGE {current.step} OF 04</span>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                {current.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                {current.description}
              </p>
            </div>

            {/* Highlights List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Clinical Workflow
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {current.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-teal-700 font-bold shrink-0 mt-0.5">&check;</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Technical Specs Pill Grid */}
            <div className="pt-3 border-t border-slate-300/80">
              <div className="grid grid-cols-3 gap-2 text-center">
                {current.specs.map((sp, i) => (
                  <div key={i} className="p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-mono">{sp.label}</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">{sp.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

