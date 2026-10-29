"use client";

import React from "react";

interface LandingFooterProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function LandingFooter({ onOpenAuth }: LandingFooterProps) {
  return (
    <footer id="safety" className="bg-white dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] border-t border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-150">
      
      {/* High-Impact Bottom Conversion Banner */}
      <div className="border-b border-[#E2E8F0] dark:border-[#1E293B] py-14 sm:py-18 bg-[#F8FAFC] dark:bg-[#131B2E]">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#059669] text-white flex items-center justify-center font-black text-base mx-auto shadow-md">
            NV
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Ready to Bring Voice and Independence to Your Patients?
          </h2>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
            Join hundreds of families, rehabilitation specialists, and clinical nurses using NetraVaani to restore human connection.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth("signup")}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-md"
            >
              Become a Member Today &rarr;
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-semibold bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#059669] transition shadow-xs"
            >
              Existing Member Sign In
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#059669] text-white flex items-center justify-center font-black text-xs shrink-0">
                NV
              </div>
              <span className="font-extrabold text-base tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
                NetraVaani
              </span>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              Assistive Gaze &amp; Gesture Biometric Platform. Empowering locked-in, non-verbal, and ICU patients with instantaneous voice broadcasts.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] uppercase tracking-wider">
              Product &amp; Tech
            </h4>
            <ul className="space-y-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <li><a href="#hardware" className="hover:text-[#059669] transition">NPG Smart Eyewear</a></li>
              <li><a href="#hardware" className="hover:text-[#059669] transition">Dual-Channel EOG Gaze</a></li>
              <li><a href="#hardware" className="hover:text-[#059669] transition">Sub-Threshold EMG</a></li>
              <li><a href="#simulator" className="hover:text-[#059669] transition">Bedside Voice Engine</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] uppercase tracking-wider">
              Membership
            </h4>
            <ul className="space-y-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <li>
                <button type="button" onClick={() => onOpenAuth("signup", "patient")} className="hover:text-[#059669] transition">
                  Patient Membership
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("signup", "nurse")} className="hover:text-[#059669] transition">
                  Clinical Nurse Access
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("signup")} className="hover:text-[#059669] transition">
                  Create Unique Account
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("login")} className="hover:text-[#059669] transition">
                  Clinical Station Sign In
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] uppercase tracking-wider">
              Clinical Safety
            </h4>
            <ul className="space-y-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <li>1-to-1 Hardware Invariant</li>
              <li>Bedside Patient Authorization</li>
              <li>HIPAA &amp; Audit Ready</li>
              <li>Zero Duplicate Bed Collision</li>
            </ul>
          </div>

        </div>

        {/* Regulatory & Copyright Notice */}
        <div className="pt-8 mt-8 border-t border-[#E2E8F0] dark:border-[#1E293B] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
          <p>
            &copy; {new Date().getFullYear()} NetraVaani Clinical Systems. All rights reserved.
          </p>
          <p className="text-center sm:text-right">
            Assistive medical telemetry interface designed for clinical care communication.
          </p>
        </div>
      </div>
    </footer>
  );
}

