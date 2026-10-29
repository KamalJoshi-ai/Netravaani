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
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] flex items-center justify-center p-6 text-[#0F172A] dark:text-[#F8FAFC]">
        <div className="flex items-center gap-3 bg-white dark:bg-[#131B2E] border border-[#CBD5E1] dark:border-[#1E293B] rounded-xl px-4 py-3 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-[#0F172A] dark:text-[#F8FAFC]">
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

  // 3. Public Marketing: Interactive 3D Landing Page
  const handleOpenAuth = (mode: "login" | "signup", role?: "patient" | "nurse") => {
    setAuthView({ mode, role });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] selection:bg-[#059669] selection:text-white transition-colors duration-150">
      <LandingNavbar onOpenAuth={handleOpenAuth} />
      <main>
        <HeroSection onOpenAuth={handleOpenAuth} />
        <StatsTicker />
        <HardwareExplodedSection />
        <BedsideSimulatorSection />
        <MembershipTiersSection onOpenAuth={handleOpenAuth} />
      </main>
      <LandingFooter onOpenAuth={handleOpenAuth} />
    </div>
  );
}
