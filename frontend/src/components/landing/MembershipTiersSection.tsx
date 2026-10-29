"use client";

import React from "react";

interface MembershipTiersSectionProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function MembershipTiersSection({ onOpenAuth }: MembershipTiersSectionProps) {
  const tiers = [
    {
      id: "patient",
      title: "Patient & Family Member",
      eyebrow: "FOR PATIENTS & CAREGIVERS",
      badgeColor: "bg-[#EFF6FF] dark:bg-[#1E3A8A] text-[#1D4ED8] dark:text-[#93C5FD] border-[#BFDBFE] dark:border-[#3B82F6]",
      description: "Empower non-verbal and motor-impaired individuals with instant bedside voice communication and independence.",
      features: [
        "Personalized gaze & blink threshold calibration",
        "Bedside voice synthesis & emergency trigger",
        "Exclusive bedside approval control over nurses & beds",
        "Family caregiver companion telemetry access",
      ],
      buttonText: "Join as Patient Member",
      buttonStyle: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white",
      role: "patient" as const,
      highlight: false,
    },
    {
      id: "nurse",
      title: "Clinical Nurse Member",
      eyebrow: "FOR CLINICAL STAFF & THERAPISTS",
      badgeColor: "bg-[#ECFDF5] dark:bg-[#064E3B] text-[#047857] dark:text-[#A7F3D0] border-[#10B981]",
      description: "Equip your nursing desk with unified real-time telemetry, automated priority sorting, and voice alerts.",
      features: [
        "Unified Multi-Patient live care queue",
        "Propose bed assignments and care link authorizations",
        "Automated speech alerts for urgent bedside calls",
        "Strict 1-to-1 hardware safety verification",
      ],
      buttonText: "Join as Clinical Nurse",
      buttonStyle: "bg-[#059669] hover:bg-[#047857] text-white",
      role: "nurse" as const,
      highlight: true,
    },
    {
      id: "hospital",
      title: "Hospital & Care Facility",
      eyebrow: "FOR INSTITUTIONAL FLEETS",
      badgeColor: "bg-[#FFFBEB] dark:bg-[#78350F] text-[#B45309] dark:text-[#FDE68A] border-[#F59E0B]",
      description: "Deploy NetraVaani hardware gateways across ICU units, post-stroke rehabilitation centers, and neurological wards.",
      features: [
        "Fleet-wide NPG hardware commissioning & tracking",
        "Ward-level bed occupancy & availability maps",
        "Immutable clinical audit trails and response metrics",
        "HL7 / FHIR event integration support",
      ],
      buttonText: "Request Hospital Demo",
      buttonStyle: "bg-white dark:bg-[#131B2E] border border-[#CBD5E1] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#059669]",
      role: undefined,
      highlight: false,
    },
  ];

  return (
    <section id="membership" className="py-16 sm:py-24 bg-[#F8FAFC] dark:bg-[#0B0F19] border-b border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#ECFDF5] dark:bg-[#064E3B] text-[#047857] dark:text-[#A7F3D0] border border-[#A7F3D0] dark:border-[#059669]">
            MEMBERSHIP &amp; ACCESS PLANS
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
            Choose Your NetraVaani Membership
          </h2>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            Select your account type to create your unique credentials and immediately access your dedicated clinical dashboard.
          </p>
        </div>

        {/* Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between border shadow-card transition duration-200 relative ${
                t.highlight
                  ? "bg-white dark:bg-[#131B2E] border-[#059669] ring-2 ring-[#059669]"
                  : "bg-white dark:bg-[#131B2E] border-[#CBD5E1] dark:border-[#1E293B]"
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#059669] text-white tracking-wider shadow-xs">
                  MOST POPULAR CLINICAL TIER
                </div>
              )}

              <div className="space-y-4">
                <span className={`inline-block text-[10px] font-extrabold font-mono px-2.5 py-0.5 rounded border uppercase ${t.badgeColor}`}>
                  {t.eyebrow}
                </span>

                <h3 className="text-xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
                  {t.title}
                </h3>

                <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  {t.description}
                </p>

                <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2.5">
                  <div className="text-[11px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    INCLUDED MEMBER CAPABILITIES:
                  </div>
                  <ul className="space-y-2 text-xs text-[#475569] dark:text-[#CBD5E1]">
                    {t.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <span className="text-[#059669] font-bold shrink-0">&check;</span>
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
                  className={`w-full py-3 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${t.buttonStyle}`}
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
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Already have an active NetraVaani membership?{" "}
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className="text-[#059669] dark:text-[#34D399] font-bold hover:underline"
            >
              Sign into your clinical station &rarr;
            </button>
          </p>
        </div>

      </div>
    </section>
  );
}

