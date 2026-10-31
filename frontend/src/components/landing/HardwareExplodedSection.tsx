"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function HardwareExplodedSection() {
  const [activeSensor, setActiveSensor] = useState<"eog" | "emg" | "ble">("eog");

  const components = [
    {
      id: "eog" as const,
      name: "NPG Lite Forehead EOG Sensor",
      tag: "Forehead / Ocular Biopotential",
      image: "/images/smart-eyewear-hero.jpg",
      heroCaption: "Non-invasive Ag/AgCl dry electrode array capturing corneal-retinal dipole movements and blinks.",
      desc: "Non-invasive bio-potential electrode array resting across the forehead to capture micro-voltage deflections from involuntary blinks and ocular movements.",
      specs: ["1000Hz sampling", "Upside Down Labs NPG Lite", "Sub-microvolt tracking", "3-4 Blinks = YES", "5+ Blinks = WATER"],
      details: [
        { label: "Placement", value: "Forehead & Supraorbital" },
        { label: "Signal Type", value: "Electrooculography (EOG)" },
        { label: "Input Impedance", value: "> 10 GΩ Dry Contact" },
        { label: "Sampling Rate", value: "1000 Hz continuous" },
      ],
    },
    {
      id: "emg" as const,
      name: "NPG Lite Dual EMG Squeeze Wristbands",
      tag: "Muscle Twitch / Squeeze",
      image: "/images/emg-wristband-3d.jpg",
      heroCaption: "Bilateral forearm surface sensors detecting micro muscle squeezes with anti-tremor adaptive filtering.",
      desc: "Dual wrist and forearm biopotential sensors detect micro-squeezes even when eye gaze is fatigued. Tolerates involuntary tremors.",
      specs: ["Bilateral Left/Right tuning", "Anti-tremor adaptive filter", "Simultaneous squeeze = NO / ALARM"],
      details: [
        { label: "Placement", value: "Bilateral Radial Flexor" },
        { label: "Signal Type", value: "Electromyography (EMG)" },
        { label: "Twitch Sensitivity", value: "0.5 µV threshold" },
        { label: "Filter Bandwidth", value: "20 Hz – 450 Hz" },
      ],
    },
    {
      id: "ble" as const,
      name: "ICU Bedside Hub & Edge Gateway",
      tag: "Audio Synthesis & Gateway",
      image: "/images/bedside-icu-care.jpg",
      heroCaption: "ESP32-C6 edge controller executing firmware rules locally, powering bedside voice and nurse dispatch.",
      desc: "ESP32-C6 edge controller evaluates firmware rules locally, powers bedside voice synthesis, and syncs alerts to nurse stations.",
      specs: ["AES-128 BLE 5.0 security", "< 45ms latency", "Wi-Fi & BLE Mesh", "18h continuous life"],
      details: [
        { label: "Microcontroller", value: "ESP32-C6 (160MHz)" },
        { label: "Processing Latency", value: "< 45 ms deterministic" },
        { label: "Wireless Protocol", value: "BLE 5.0 Mesh & Wi-Fi 6" },
        { label: "Audio Output", value: "Bedside TTS Speaker" },
      ],
    },
  ];

  const current = components.find((c) => c.id === activeSensor) || components[0];

  return (
    <section id="hardware" className="py-14 sm:py-20 bg-[#EEF2F6]/70 border-b border-slate-300 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            Hardware Architecture &amp; Biosensor Suite
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Anatomy of the NetraVaani Bio-Signal System
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            Engineered for continuous ICU bedside use with medical-grade biopotential dry sensors, dual-wrist EMG, and intelligent audio gateways.
          </p>
        </div>

        {/* Hardware Interactive Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Layer Switcher & Specs */}
          <div className="lg:col-span-5 space-y-3 order-2 lg:order-1">
            <div className="flex items-center justify-between pb-2 border-b border-slate-300">
              <span className="text-xs font-semibold text-slate-700">Hardware Components</span>
              <span className="text-xs text-slate-500 font-mono">nv-4.0.0 Architecture</span>
            </div>

            {components.map((c) => {
              const isSelected = activeSensor === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveSensor(c.id)}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition shadow-xs flex flex-col gap-2.5 ${
                    isSelected
                      ? "bg-white border-teal-700 ring-1 ring-teal-700/20"
                      : "bg-white/80 border-slate-300 hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <Image
                        src={c.image}
                        alt={c.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h3 className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                          {c.name}
                        </h3>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-teal-800 border border-slate-200">
                        {c.tag}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {c.desc}
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.specs.map((sp) => (
                      <span
                        key={sp}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {sp}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Product & Specification Stage */}
          <div className="lg:col-span-7 order-1 lg:order-2 space-y-3">
            <div className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
              
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
                  <span className="text-xs font-bold text-slate-900">
                    {current.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                  {current.tag}
                </span>
              </div>

              {/* Showcase Image */}
              <div className="relative w-full h-[280px] sm:h-[320px] rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                <Image
                  src={current.image}
                  alt={current.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent flex items-end p-4">
                  <p className="text-white text-xs leading-relaxed max-w-lg">
                    {current.heroCaption}
                  </p>
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                  Sensor Specifications &amp; Parameters
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {current.details.map((d, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-500 font-mono uppercase">{d.label}</div>
                      <div className="text-xs font-bold text-slate-900 mt-0.5">{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                <span>Select any module on the left to inspect specifications</span>
                <span className="font-mono text-teal-800 font-medium">Upside Down Labs</span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
