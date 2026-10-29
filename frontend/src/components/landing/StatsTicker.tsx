"use client";

import React from "react";

export default function StatsTicker() {
  const stats = [
    {
      metric: "< 45ms",
      title: "Real-Time Response Latency",
      subtitle: "Edge BLE telemetry ensures instant bedside nurse call propagation.",
      accentBorder: "border-[#10B981]",
      badgeBg: "bg-[#ECFDF5] dark:bg-[#064E3B]",
      badgeText: "text-[#047857] dark:text-[#A7F3D0]",
    },
    {
      metric: "99.4%",
      title: "Intent Recognition Precision",
      subtitle: "Dual-channel EOG filtering discriminates natural blinks from active commands.",
      accentBorder: "border-[#3B82F6]",
      badgeBg: "bg-[#EFF6FF] dark:bg-[#1E3A8A]",
      badgeText: "text-[#1D4ED8] dark:text-[#93C5FD]",
    },
    {
      metric: "1-to-1",
      title: "Strict Allocation Safety",
      subtitle: "Zero hardware collision. One gateway is bound exclusively to one active patient.",
      accentBorder: "border-[#F59E0B]",
      badgeBg: "bg-[#FFFBEB] dark:bg-[#78350F]",
      badgeText: "text-[#B45309] dark:text-[#FDE68A]",
    },
    {
      metric: "100%",
      title: "Bedside Patient Governance",
      subtitle: "Care links and hospital beds cannot be forced; only the bedside patient approves.",
      accentBorder: "border-[#8B5CF6]",
      badgeBg: "bg-[#F5F3FF] dark:bg-[#4C1D95]",
      badgeText: "text-[#6D28D9] dark:text-[#DDD6FE]",
    },
  ];

  return (
    <section className="py-12 bg-white dark:bg-[#131B2E] border-b border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((s) => (
            <div
              key={s.title}
              className={`p-5 rounded-xl border ${s.accentBorder} bg-[#F8FAFC] dark:bg-[#0B0F19] shadow-xs space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
                  {s.metric}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${s.badgeBg} ${s.badgeText}`}>
                  VERIFIED
                </span>
              </div>
              <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
                {s.title}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                {s.subtitle}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

