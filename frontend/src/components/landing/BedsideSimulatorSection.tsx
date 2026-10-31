"use client";

import React, { useState } from "react";
import Image from "next/image";
import { speak } from "@/lib/speech";

export default function BedsideSimulatorSection() {
  const [activeCommand, setActiveCommand] = useState<{
    id: string;
    label: string;
    gesture: string;
    speech: string;
    isAlarm?: boolean;
  } | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const commands = [
    {
      id: "YES",
      label: "Affirmative (Yes)",
      gesture: "3-4 Forehead Blinks",
      speech: "Affirmative. Yes.",
      isAlarm: false,
    },
    {
      id: "NO",
      label: "Negative (No)",
      gesture: "1-2 Squeezes Both Hands",
      speech: "Negative. No.",
      isAlarm: false,
    },
    {
      id: "WATER",
      label: "Drinking Water",
      gesture: "5+ Forehead Blinks",
      speech: "Water requested. Assisting patient.",
      isAlarm: false,
    },
    {
      id: "NURSE",
      label: "Call Nurse (Urgent)",
      gesture: "3+ Left Wrist Squeezes",
      speech: "Clinical nurse requested at bedside immediately.",
      isAlarm: false,
    },
    {
      id: "ADJUSTMENT",
      label: "Bedside Adjustment",
      gesture: "3+ Right Wrist Squeezes",
      speech: "Bedside posture and position adjustment requested.",
      isAlarm: false,
    },
    {
      id: "EMERGENCY",
      label: "Emergency / Severe Pain",
      gesture: "3+ Squeezes Both Hands",
      speech: "Medical emergency alarm at Bed ICU-04. Severe pain reported.",
      isAlarm: true,
    },
  ];

  const handleTrigger = (cmd: typeof commands[0]) => {
    setActiveCommand(cmd);
    setIsSpeaking(true);

    if (soundEnabled) {
      speak(cmd.speech, {
        interrupt: true,
        onEnd: () => setIsSpeaking(false),
      });
    } else {
      setTimeout(() => setIsSpeaking(false), 2200);
    }
  };

  return (
    <section id="simulator" className="py-14 sm:py-20 bg-white border-b border-slate-300 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            Interactive Bio-Acoustic Simulator
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Test Bedside Audio &amp; Voice Synthesis
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            Trigger firmware gestures below to test real-time patient speech synthesis and bedside terminal feedback.
          </p>
        </div>

        {/* Interactive Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Command Trigger Cards */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-300">
              <span className="text-xs font-semibold text-slate-700">nv-4.0.0 Firmware Gestures</span>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition ${
                  soundEnabled
                    ? "bg-teal-50 text-teal-800 border-teal-200"
                    : "bg-slate-100 text-slate-700 border-slate-300"
                }`}
              >
                {soundEnabled ? "🔊 Speech: Active" : "🔇 Speech: Muted"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {commands.map((cmd) => {
                const isActive = activeCommand?.id === cmd.id;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => handleTrigger(cmd)}
                    className={`p-3.5 rounded-xl border text-left transition shadow-xs flex flex-col justify-between gap-2 ${
                      isActive
                        ? cmd.isAlarm
                          ? "bg-rose-50 border-rose-500 ring-1 ring-rose-500/20"
                          : "bg-teal-50/60 border-teal-700 ring-1 ring-teal-700/20"
                        : "bg-[#EEF2F6]/70 border-slate-300 hover:border-slate-400"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700">
                          {cmd.gesture}
                        </span>
                        {cmd.isAlarm && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                            ALARM
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-xs sm:text-sm text-slate-900 mt-1.5">
                        {cmd.label}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium text-teal-700 flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span>Speak &rarr;</span>
                      <span className="text-[10px] text-slate-500 font-normal truncate max-w-[120px]">
                        {cmd.speech}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bedside Clinical Context Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-200 border border-slate-300 shrink-0">
                <Image
                  src="/images/bedside-icu-care.jpg"
                  alt="ICU Bedside Care"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-900">Hospital ICU Bedside Integration</div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  The bedside speaker terminal plays comforting voice prompts for patients, family members, and attending doctors.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Virtual Bedside Terminal Display */}
          <div className="lg:col-span-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-xs space-y-3.5">
              
              {/* Virtual Screen Bezel Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${activeCommand?.isAlarm ? "bg-rose-500 animate-ping" : "bg-teal-500 animate-pulse"}`} />
                  <span className="font-mono text-xs font-semibold text-slate-200">NetraVaani Bedside Audio &bull; Bed ICU-04</span>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-teal-400 border border-teal-500/30">
                  Online &bull; nv-4.0.0
                </span>
              </div>

              {/* Terminal Screen Body */}
              <div className="min-h-[200px] rounded-lg bg-slate-950 border border-slate-800/80 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                
                {/* 2D Animated Waveform Equalizer Bars */}
                <div className="flex items-center gap-1.5 h-12 mb-4">
                  {[24, 40, 16, 48, 32, 20, 44, 28, 36, 18, 42].map((height, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${
                        activeCommand?.isAlarm
                          ? "bg-rose-500"
                          : isSpeaking
                          ? "bg-teal-400"
                          : "bg-slate-700"
                      }`}
                      style={{
                        height: isSpeaking ? `${height}px` : "10px",
                        opacity: isSpeaking ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>

                <div className="space-y-1">
                  {activeCommand ? (
                    <>
                      <span className="text-[11px] font-mono text-teal-400 tracking-wider">
                        Gesture Detected: {activeCommand.gesture}
                      </span>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                        {activeCommand.label}
                      </h3>
                      <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-400">
                        <span className={`w-2 h-2 rounded-full ${isSpeaking ? "bg-emerald-400 animate-ping" : "bg-teal-400"}`} />
                        <span className="italic">&ldquo;{activeCommand.speech}&rdquo;</span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1 text-slate-400">
                      <div className="font-mono text-xs text-slate-300">
                        Awaiting Biometric Input &bull; Standby Mode
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        Click any gesture on the left to simulate a patient call.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Screen Bezel Telemetry Footer */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                <span>BLE Gateway: NPG-C6-7781</span>
                <span>Latency: 32ms</span>
                <span>Signal: -54 dBm</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
