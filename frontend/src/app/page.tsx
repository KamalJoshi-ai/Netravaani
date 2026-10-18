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
      <div className="min-h-screen bg-[#F5F1E9] flex items-center justify-center p-6 text-[#211C19]">
        <div className="flex items-center gap-3 bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl px-5 py-3 shadow-subtle">
          <span className="w-2.5 h-2.5 rounded-full bg-[#AD5D3D] animate-ping" />
          <span className="text-sm font-semibold font-sans">Connecting to NetraVaani...</span>
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
