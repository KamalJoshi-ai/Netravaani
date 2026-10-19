"use client";

import React from "react";
import type { RuleVersionItem } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#FAF0E6] text-[#AD5D3D] border-[#E2C7B8]",
  APPLIED: "bg-[#EDF5F0] text-[#42765A] border-[#C5DDCF]",
  FAILED: "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]",
};

/** Saved versions with their delivery status. Any rule version can be re-issued. */
export default function VersionHistory({
  versions,
  appliedVersion,
  busy,
  onRevert,
}: {
  versions: RuleVersionItem[];
  appliedVersion: number | null;
  busy: boolean;
  onRevert: (version: number) => void;
}) {
  if (versions.length === 0) {
    return <p className="text-xs text-[#76685F]">No versions saved yet.</p>;
  }
  const latest = versions[0]?.version;

  return (
    <ol className="divide-y divide-[#E5D9CA]/70 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7]">
      {versions.map((v) => (
        <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-heading font-extrabold text-[#211C19] tabular-nums w-9">v{v.version}</span>
            {v.status === "PENDING" && v.version !== latest ? (
              <span
                title="A newer version was saved before the device picked this one up"
                className="rounded-full border border-[#E5D9CA] bg-[#F5F1E9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9E9086]"
              >
                Superseded
              </span>
            ) : (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[v.status] || ""}`}>
                {v.status}
              </span>
            )}
            {v.version === appliedVersion && (
              <span className="rounded-full bg-[#211C19] px-2 py-0.5 text-[10px] font-bold text-white">Running</span>
            )}
            <span className="text-[#76685F] truncate">
              {new Date(v.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              {v.createdBy ? ` · ${v.createdBy}` : ""}
              {v.kind === "rules" ? ` · ${v.ruleCount} commands` : " · legacy gesture config"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {v.status === "FAILED" && v.error && <span className="text-[11px] text-[#B42318]">{v.error}</span>}
            <button
              type="button"
              disabled={busy || v.kind !== "rules" || v.version === latest}
              onClick={() => onRevert(v.version)}
              aria-label={`Revert to version ${v.version}`}
              className="rounded-lg border border-[#E5D9CA] px-2.5 py-1 text-[11px] font-bold text-[#76685F] hover:border-[#AD5D3D] hover:text-[#AD5D3D] disabled:opacity-40 disabled:hover:border-[#E5D9CA] disabled:hover:text-[#76685F] transition"
            >
              Revert
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
