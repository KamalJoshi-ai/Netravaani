"use client";

import React from "react";
import type { RuleVersionItem } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#FBF5EC] text-[#A86B24] border-[#F0DCBE] dark:bg-[#A86B24]/15 dark:border-[#A86B24]/30 dark:text-[#FBBF24]",
  APPLIED: "bg-[#EAF3EF] text-[#287A59] border-[#BEDECE] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]",
  FAILED: "bg-[#FDF1F1] text-[#B54747] border-[#F2C4C4] dark:bg-[#B54747]/15 dark:border-[#B54747]/30 dark:text-[#F87171]",
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
    return <p className="text-xs text-[#68747C] dark:text-[#8FA1B0]">No versions saved yet.</p>;
  }
  const latest = versions[0]?.version;

  return (
    <ol className="divide-y divide-[#DFE3DF] dark:divide-[#27374D] rounded-xl border border-[#DFE3DF] dark:border-[#27374D] bg-white dark:bg-[#151E2A]">
      {versions.map((v) => (
        <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-[#18212B] dark:text-[#F0F4F7] tabular-nums w-9">v{v.version}</span>
            {v.status === "PENDING" && v.version !== latest ? (
              <span
                title="A newer version was saved before the device picked this one up"
                className="rounded-full border border-[#DFE3DF] dark:border-[#27374D] bg-[#EDEFEA] dark:bg-[#0E151E] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#68747C] dark:text-[#8FA1B0]"
              >
                Superseded
              </span>
            ) : (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[v.status] || ""}`}>
                {v.status}
              </span>
            )}
            {v.version === appliedVersion && (
              <span className="rounded-full bg-[#183A4A] dark:bg-[#376B70] px-2 py-0.5 text-[10px] font-semibold text-white">Running</span>
            )}
            <span className="text-[#68747C] dark:text-[#8FA1B0] truncate">
              {new Date(v.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              {v.createdBy ? ` · ${v.createdBy}` : ""}
              {v.kind === "rules" ? ` · ${v.ruleCount} commands` : " · legacy gesture config"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {v.status === "FAILED" && v.error && <span className="text-[11px] text-[#B54747]">{v.error}</span>}
            <button
              type="button"
              disabled={busy || v.kind !== "rules" || v.version === latest}
              onClick={() => onRevert(v.version)}
              aria-label={`Revert to version ${v.version}`}
              className="rounded-lg border border-[#DFE3DF] dark:border-[#27374D] px-2.5 py-1 text-[11px] font-semibold text-[#68747C] dark:text-[#8FA1B0] hover:border-[#183A4A] hover:text-[#183A4A] dark:hover:border-[#B9D8D2] dark:hover:text-[#B9D8D2] disabled:opacity-40 transition"
            >
              Revert
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
