"use client";

import React from "react";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import NurseDashboardPage from "./nurse/page";
import PatientBedsideView from "@/components/PatientBedsideView";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] flex items-center justify-center p-6 text-[#28211B] dark:text-[#F2ECE1]">
        <div className="flex items-center gap-3 bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl px-4 py-3 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#8C4327] dark:bg-[#D49D4F] animate-pulse" />
          <span className="text-xs font-serif font-semibold tracking-wide text-[#28211B] dark:text-[#F2ECE1]">Connecting to NetraVaani...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (user.role === "patient") {
    return <PatientBedsideView />;
  }

  return <NurseDashboardPage />;
}
