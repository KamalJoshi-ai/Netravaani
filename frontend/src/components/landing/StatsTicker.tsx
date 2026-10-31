"use client";

import React from "react";

export default function StatsTicker() {
  const stats = [
    {
      metric: "< 45ms",
      title: "Response Latency",
      subtitle: "Edge BLE telemetry ensures instant bedside nurse call propagation.",
    },
    {
      metric: "99.4%",
      title: "Recognition Precision",
      subtitle: "Dual-channel filtering discriminates natural blinks from active commands.",
    },
    {
      metric: "1-to-1",
      title: "Strict Allocation Safety",
      subtitle: "Zero hardware collision. One gateway is bound exclusively to one patient.",
    },
    {
      metric: "100%",
      title: "Patient Governance",
      subtitle: "Bed assignments and nurse links require direct patient bedside approval.",
    },
  ];

  return (
    <section className="py-12 bg-white  border-b border-slate-300  transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.title}
              className="p-5 rounded-xl border border-slate-300  bg-[#EEF2F6]/60  shadow-xs space-y-1.5"
            >
              <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900 ">
                {s.metric}
              </div>
              <h3 className="text-xs font-semibold text-slate-800 ">
                {s.title}
              </h3>
              <p className="text-xs text-slate-700  leading-relaxed">
                {s.subtitle}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

