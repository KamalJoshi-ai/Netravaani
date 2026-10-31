"use client";

import React from "react";

interface MembershipTiersSectionProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function MembershipTiersSection({ onOpenAuth }: MembershipTiersSectionProps) {
  const tiers = [
    {
      id: "patient",
      title: "Patient & Caregiver",
      eyebrow: "Personal Bedside",
      description: "Direct bedside speech output, individualized gesture calibration, and complete privacy control over bed access.",
      features: [
        "Personalized gaze & blink threshold calibration",
        "Bedside voice synthesis & emergency alert",
        "Full bedside approval control over nurse link requests",
        "Family caregiver companion telemetry access",
      ],
      buttonText: "Join as Patient Member",
      buttonStyle: "bg-slate-900 hover:bg-slate-800 text-white  :bg-slate-700",
      role: "patient" as const,
      highlight: false,
    },
    {
      id: "nurse",
      title: "Clinical Nurse Staff",
      eyebrow: "Nurse Station",
      description: "Centralized live care call queue with automated triage, voice notifications, and 1-to-1 hardware pairing.",
      features: [
        "Unified real-time multi-patient care desk queue",
        "Bed assignment & telemetry pairing workflows",
        "Voice announcements for incoming and urgent calls",
        "Strict 1-to-1 hardware safety verification",
      ],
      buttonText: "Join as Clinical Nurse",
      buttonStyle: "bg-teal-700 hover:bg-teal-800 text-white  :bg-teal-500",
      role: "nurse" as const,
      highlight: true,
    },
    {
      id: "hospital",
      title: "Hospital & Care Facility",
      eyebrow: "Enterprise Ward",
      description: "Fleet deployment of NetraVaani gateways across ICU wards, neuro-rehabilitation units, and acute care facilities.",
      features: [
        "Fleet-wide NPG hardware commissioning & tracking",
        "Ward-level bed occupancy & availability status",
        "Structured clinical audit logs and response metrics",
        "HL7 / FHIR clinical event integration support",
      ],
      buttonText: "Contact Facility Team",
      buttonStyle: "bg-white  border border-slate-300  text-slate-800  hover:bg-[#EEF2F6] :bg-slate-800",
      role: undefined,
      highlight: false,
    },
  ];

  return (
    <section id="membership" className="py-14 sm:py-20 bg-[#EEF2F6]/70  border-b border-slate-300  transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100  text-slate-700  border border-slate-300 ">
            Account Options
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900  tracking-tight">
            Select Your Role &amp; Access Plan
          </h2>
          <p className="text-xs sm:text-sm text-slate-700  leading-relaxed">
            Create your account to access your dedicated clinical interface.
          </p>
        </div>

        {/* Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl p-6 flex flex-col justify-between border shadow-xs transition duration-150 relative ${
                t.highlight
                  ? "bg-white  border-teal-700  ring-1 ring-teal-700/20"
                  : "bg-white  border-slate-300 "
              }`}
            >
              <div className="space-y-3.5">
                <span className="inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100  text-slate-700  border border-slate-300  uppercase">
                  {t.eyebrow}
                </span>

                <h3 className="text-lg font-bold text-slate-900  tracking-tight">
                  {t.title}
                </h3>

                <p className="text-xs text-slate-700  leading-relaxed">
                  {t.description}
                </p>

                <div className="pt-3 border-t border-slate-200  space-y-2">
                  <div className="text-[11px] font-semibold text-slate-700 ">
                    Included capabilities:
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700 ">
                    {t.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <span className="text-teal-700  font-bold shrink-0">&check;</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (t.role) {
                      onOpenAuth("signup", t.role);
                    } else {
                      onOpenAuth("signup");
                    }
                  }}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5 ${t.buttonStyle}`}
                >
                  <span>{t.buttonText}</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Existing Member Notice */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-700 ">
            Already registered?{" "}
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className="text-teal-700  font-semibold hover:underline"
            >
              Sign into your station &rarr;
            </button>
          </p>
        </div>

      </div>
    </section>
  );
}

