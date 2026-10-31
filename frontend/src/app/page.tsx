"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import NurseDashboardPage from "./nurse/page";
import PatientBedsideView from "@/components/PatientBedsideView";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import StatsTicker from "@/components/landing/StatsTicker";
import HardwareExplodedSection from "@/components/landing/HardwareExplodedSection";
import ClinicalJourneySection from "@/components/landing/ClinicalJourneySection";
import BedsideSimulatorSection from "@/components/landing/BedsideSimulatorSection";
import MembershipTiersSection from "@/components/landing/MembershipTiersSection";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Home() {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<{
    mode: "login" | "signup";
    role?: "patient" | "nurse";
  } | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-6 text-slate-900">
        <div className="flex items-center gap-3 bg-white border border-slate-300 rounded-lg px-4 py-3 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
          <span className="text-xs font-semibold text-slate-900">
            Connecting to NetraVaani...
          </span>
        </div>
      </div>
    );
  }

  // 1. Authenticated Users route directly to their dedicated role workspace
  if (user) {
    if (user.role === "patient") {
      return <PatientBedsideView />;
    }
    return <NurseDashboardPage />;
  }

  // 2. Auth Flow: If visitor clicked "Become a Member" or "Sign In"
  if (authView) {
    return (
      <LoginForm
        initialMode={authView.mode}
        initialRole={authView.role}
        onBackToLanding={() => setAuthView(null)}
      />
    );
  }

  // 3. Public Marketing: Landing Page
  const handleOpenAuth = (mode: "login" | "signup", role?: "patient" | "nurse") => {
    setAuthView({ mode, role });
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#090D16] selection:bg-teal-700 selection:text-white transition-colors duration-150">
      <LandingNavbar onOpenAuth={handleOpenAuth} />
      <main>
        <HeroSection onOpenAuth={handleOpenAuth} />
        <StatsTicker />
        <HardwareExplodedSection />
        <ClinicalJourneySection />
        <BedsideSimulatorSection />
        <MembershipTiersSection onOpenAuth={handleOpenAuth} />
      </main>
      <LandingFooter onOpenAuth={handleOpenAuth} />
    </div>
  );
}
