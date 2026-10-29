"use client";

import React from "react";
import { ThemeToggle } from "@/lib/theme";

interface LandingNavbarProps {
  onOpenAuth: (mode: "login" | "signup", role?: "patient" | "nurse") => void;
}

export default function LandingNavbar({ onOpenAuth }: LandingNavbarProps) {
  return (
    <header className="sticky top-0 z-50 bg-[#F8FAFC]/90 dark:bg-[#0B0F19]/90 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#059669] text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
            NV
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
              Netra<span className="text-[#059669]">Vaani</span>
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
          <a href="#hardware" className="hover:text-[#059669] dark:hover:text-[#34D399] transition">
            3D Hardware
          </a>
          <a href="#simulator" className="hover:text-[#059669] dark:hover:text-[#34D399] transition">
            Bedside Simulator
          </a>
          <a href="#membership" className="hover:text-[#059669] dark:hover:text-[#34D399] transition">
            Membership Plans
          </a>
          <a href="#safety" className="hover:text-[#059669] dark:hover:text-[#34D399] transition">
            Clinical Safety
          </a>
        </nav>

        {/* Right Controls: Theme Toggle, Sign In, Become a Member */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <ThemeToggle />

          <button
            type="button"
            onClick={() => onOpenAuth("login")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#475569] dark:text-[#CBD5E1] hover:text-[#0F172A] dark:hover:text-white transition"
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => onOpenAuth("signup")}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-xs"
          >
            Become a Member
          </button>
        </div>
      </div>
    </header>
  );
}

