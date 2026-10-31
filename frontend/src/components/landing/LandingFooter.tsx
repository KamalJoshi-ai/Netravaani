"use client";

import React from "react";

interface LandingFooterProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function LandingFooter({ onOpenAuth }: LandingFooterProps) {
  return (
    <footer id="safety" className="bg-white  text-slate-900  border-t border-slate-300  transition-colors duration-150">
      
      {/* Conversion Banner */}
      <div className="border-b border-slate-300  py-12 sm:py-16 bg-[#EEF2F6]/60 ">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <div className="w-10 h-10 rounded-lg bg-teal-700  text-white flex items-center justify-center font-bold text-sm mx-auto shadow-xs">
            NV
          </div>
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 ">
            Restore communication and autonomy at the bedside.
          </h2>
          <p className="text-xs sm:text-sm text-slate-700  max-w-lg mx-auto leading-relaxed">
            Designed for motor-impaired and ICU patients, clinical nurses, and care teams.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth("signup")}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800  :bg-teal-500 text-white transition shadow-xs"
            >
              Become a Member Today &rarr;
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-medium bg-white  border border-slate-300  text-slate-800  hover:bg-[#EEF2F6] :bg-slate-800 transition shadow-xs"
            >
              Sign In to Your Station
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="space-y-2.5 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-teal-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                NV
              </div>
              <span className="font-bold text-sm tracking-tight text-slate-900 ">
                NetraVaani
              </span>
            </div>
            <p className="text-xs text-slate-700  leading-relaxed">
              Clinical Gaze &amp; Gesture Assistive Platform. Empowering locked-in and ICU patients with instantaneous voice broadcasts.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-800 ">
              Technology
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-700 ">
              <li><a href="#hardware" className="hover:text-teal-700 :text-teal-400 transition">NPG Eyewear Frame</a></li>
              <li><a href="#hardware" className="hover:text-teal-700 :text-teal-400 transition">Dual-Channel EOG</a></li>
              <li><a href="#hardware" className="hover:text-teal-700 :text-teal-400 transition">Sub-Threshold EMG</a></li>
              <li><a href="#simulator" className="hover:text-teal-700 :text-teal-400 transition">Bedside Voice Engine</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-800 ">
              Access
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-700 ">
              <li>
                <button type="button" onClick={() => onOpenAuth("signup", "patient")} className="hover:text-teal-700 :text-teal-400 transition">
                  Patient Membership
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("signup", "nurse")} className="hover:text-teal-700 :text-teal-400 transition">
                  Clinical Nurse Access
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("login")} className="hover:text-teal-700 :text-teal-400 transition">
                  Station Sign In
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-800 ">
              Clinical Safety
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-700 ">
              <li>1-to-1 Hardware Invariant</li>
              <li>Bedside Patient Authorization</li>
              <li>Collision-Free Telemetry</li>
              <li>Zero Voice Control Barrier</li>
            </ul>
          </div>

        </div>

        {/* Regulatory & Copyright Notice */}
        <div className="pt-6 mt-8 border-t border-slate-200  flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700 ">
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

