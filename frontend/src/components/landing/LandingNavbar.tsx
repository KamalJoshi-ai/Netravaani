"use client";

import React from "react";

interface LandingNavbarProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function LandingNavbar({ onOpenAuth }: LandingNavbarProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-300 shadow-xs transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs shrink-0">
            NV
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              Netra<span className="text-teal-800">Vaani</span>
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-700">
          <a href="#hardware" className="hover:text-slate-950 transition">
            3D Hardware
          </a>
          <a href="#simulator" className="hover:text-slate-950 transition">
            Bedside Simulator
          </a>
          <a href="#membership" className="hover:text-slate-950 transition">
            Membership Plans
          </a>
          <a href="#safety" className="hover:text-slate-950 transition">
            Clinical Safety
          </a>
        </nav>

        {/* Right Controls: Sign In, Become a Member */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenAuth("login")}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 hover:text-slate-950 hover:bg-slate-100 transition"
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => onOpenAuth("signup")}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-800 hover:bg-teal-900 text-white transition shadow-sm"
          >
            Become a Member
          </button>
        </div>
      </div>
    </header>
  );
}

