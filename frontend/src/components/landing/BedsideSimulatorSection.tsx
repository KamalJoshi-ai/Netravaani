"use client";

import React, { useState } from "react";

export default function BedsideSimulatorSection() {
  const [activeCommand, setActiveCommand] = useState<{
    id: string;
    label: string;
    gesture: string;
    color: string;
    textColor: string;
    borderColor: string;
    bgPill: string;
    speech: string;
  } | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);

  const commands = [
    {
      id: "YES",
      label: "YES / AFFIRMATIVE",
      gesture: "2 Rapid Blinks",
      color: "bg-[#ECFDF5] dark:bg-[#064E3B]",
      textColor: "text-[#047857] dark:text-[#A7F3D0]",
      borderColor: "border-[#10B981]",
      bgPill: "bg-[#A7F3D0] dark:bg-[#059669]",
      speech: "Affirmative. Yes.",
    },
    {
      id: "WATER",
      label: "NEED DRINKING WATER",
      gesture: "4 Rapid Blinks",
      color: "bg-[#EFF6FF] dark:bg-[#1E3A8A]",
      textColor: "text-[#1D4ED8] dark:text-[#93C5FD]",
      borderColor: "border-[#3B82F6]",
      bgPill: "bg-[#BFDBFE] dark:bg-[#2563EB]",
      speech: "Drinking water requested.",
    },
    {
      id: "NURSE",
      label: "CALL CLINICAL NURSE",
      gesture: "3-Second Gaze Hold",
      color: "bg-[#FFFBEB] dark:bg-[#78350F]",
      textColor: "text-[#B45309] dark:text-[#FDE68A]",
      borderColor: "border-[#F59E0B]",
      bgPill: "bg-[#FDE68A] dark:bg-[#D97706]",
      speech: "Clinical nurse requested at bedside.",
    },
    {
      id: "EMERGENCY",
      label: "URGENT CODE CALL",
      gesture: "Sustained Jaw/Hand Squeeze",
      color: "bg-[#FEF2F2] dark:bg-[#450A0A]",
      textColor: "text-[#B91C1C] dark:text-[#FCA5A5]",
      borderColor: "border-[#EF4444]",
      bgPill: "bg-[#FECACA] dark:bg-[#DC2626]",
      speech: "Urgent medical emergency alert.",
    },
  ];

  const handleTrigger = (cmd: typeof commands[0]) => {
    setActiveCommand(cmd);

    // In-browser speech synthesis for live interactive audio feedback
    if (soundEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cmd.speech);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <section id="simulator" className="py-16 sm:py-24 bg-white dark:bg-[#131B2E] border-b border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#ECFDF5] dark:bg-[#064E3B] text-[#047857] dark:text-[#A7F3D0] border border-[#A7F3D0] dark:border-[#059669]">
            LIVE INTERACTIVE PLAYGROUND
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
            Test the Bedside Translation Engine
          </h2>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            Click any biometric gesture trigger below to simulate the bedside screen and hear the instant clinical voice broadcast.
          </p>
        </div>

        {/* Interactive Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Command Trigger Cards */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] dark:border-[#1E293B]">
              <span className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">TRIGGER A BIOMETRIC GESTURE</span>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`text-xs font-semibold px-2.5 py-1 rounded border transition ${
                  soundEnabled
                    ? "bg-[#ECFDF5] text-[#047857] border-[#10B981]"
                    : "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]"
                }`}
              >
                {soundEnabled ? "Audio: Active" : "Audio: Muted"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {commands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => handleTrigger(cmd)}
                  className={`p-4 rounded-xl border text-left transition shadow-xs flex flex-col justify-between gap-3 hover:-translate-y-0.5 active:translate-y-0 ${
                    activeCommand?.id === cmd.id
                      ? `${cmd.color} ${cmd.borderColor} ring-2 ring-[#059669]`
                      : "bg-[#F8FAFC] dark:bg-[#0B0F19] border-[#CBD5E1] dark:border-[#1E293B] hover:border-[#94A3B8]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${cmd.bgPill} text-[#0F172A]`}>
                        {cmd.gesture}
                      </span>
                    </div>
                    <div className="font-extrabold text-xs sm:text-sm text-[#0F172A] dark:text-[#F8FAFC]">
                      {cmd.label}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399]">
                    Click to fire &rarr;
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Virtual Bedside Terminal Display */}
          <div className="lg:col-span-6">
            <div className="bg-[#0F172A] border-2 border-[#1E293B] rounded-2xl p-6 text-white shadow-2xl space-y-5">
              
              {/* Virtual Screen Bezel Header */}
              <div className="flex items-center justify-between border-b border-[#334155] pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-ping" />
                  <span className="font-mono font-bold tracking-wider text-[#F8FAFC]">BEDSIDE MONITOR &bull; BED ICU-04</span>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#1E293B] text-[#94A3B8]">
                  PATIENT TERMINAL ACTIVE
                </span>
              </div>

              {/* Active Broadcast Screen Body */}
              <div className="min-h-[220px] rounded-xl bg-[#090D16] border border-[#1E293B] p-6 flex flex-col items-center justify-center text-center space-y-3">
                {activeCommand ? (
                  <>
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#38BDF8]">
                      EVENT DISPATCHED: {activeCommand.gesture}
                    </span>
                    <h3 className={`text-2xl sm:text-3xl font-black tracking-tight ${activeCommand.textColor}`}>
                      {activeCommand.label}
                    </h3>
                    <div className="flex items-center gap-2 pt-2 text-xs text-[#94A3B8]">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                      <span>Synthesized Audio Broadcast: &ldquo;{activeCommand.speech}&rdquo;</span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 text-[#64748B]">
                    <div className="w-10 h-10 rounded-full border border-dashed border-[#475569] flex items-center justify-center mx-auto text-sm">
                      NV
                    </div>
                    <div className="font-mono text-xs">
                      WAITING FOR BIOMETRIC INPUT...
                    </div>
                    <p className="text-[11px] max-w-xs mx-auto">
                      Click any trigger card on the left to simulate a patient gaze event.
                    </p>
                  </div>
                )}
              </div>

              {/* Screen Bezel Telemetry Footer */}
              <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] pt-1">
                <span>GATEWAY: NPG-BLE-8821 (ONLINE)</span>
                <span>LATENCY: 34ms</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

