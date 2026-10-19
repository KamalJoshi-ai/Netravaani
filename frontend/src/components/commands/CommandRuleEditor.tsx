"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient, ApiError, CommandRuleItem, DeviceRulesResponse, RuleFieldError } from "@/lib/api";
import { InfoTip, RangeCell, StatusPill, Switch, useFlipList } from "./controls";
import TryGesturePanel, { GestureInput } from "./TryGesturePanel";
import VersionHistory from "./VersionHistory";
import {
  CHANNELS,
  Channel,
  EditorRule,
  MAX_RULES,
  RowIssue,
  describeRule,
  newUid,
  ruleKeyFromLabel,
  toCommandRule,
  toEditorRules,
  tryGesture,
  validateEditor,
} from "./ruleModel";

const ALARM_TIP = "Alarm also makes the board itself flash red, even without Wi-Fi.";
const URGENT_TIP = "Urgent requests are highlighted at the nurse station.";
const TOGETHER_TIP = "Left and right squeezes must happen at the same time (paired). Both hands need at least 1.";
const ROW_GRID =
  "lg:grid-cols-[28px_minmax(250px,2fr)_repeat(3,minmax(78px,1fr))_88px_60px_60px_36px]";
const POLL_MS = 3000;
const OFFLINE_AFTER_MS = 60_000;

type Confirm = { kind: "alarm" } | { kind: "reset" } | { kind: "revert"; version: number } | null;

export default function CommandRuleEditor({
  deviceId,
  variant = "panel",
  onDone,
}: {
  deviceId: string;
  /** "panel" on the device page, "setup" as the Commands step after registration. */
  variant?: "panel" | "setup";
  onDone?: () => void;
}) {
  const [data, setData] = useState<DeviceRulesResponse | null>(null);
  const [rules, setRules] = useState<EditorRule[]>([]);
  const [saved, setSaved] = useState<CommandRuleItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ rule: EditorRule; index: number } | null>(null);
  const [leavingUid, setLeavingUid] = useState<string | null>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [armedUid, setArmedUid] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const [gesture, setGesture] = useState<GestureInput>({ blinks: 4, left: 0, right: 0, together: false });
  const [flashUid, setFlashUid] = useState<string | null>(null);
  const [focusLabelUid, setFocusLabelUid] = useState<string | null>(null);
  const [focusHandleUid, setFocusHandleUid] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement>(null);
  const rowNodes = useRef(new Map<string, HTMLElement>());
  const labelInputs = useRef(new Map<string, HTMLInputElement>());
  const handleButtons = useRef(new Map<string, HTMLButtonElement>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatus = useRef<{ version: number; status: string } | null>(null);

  /* ---------------- loading & polling ---------------- */
  const load = useCallback(
    async (replaceRules: boolean) => {
      try {
        const res = await apiClient.getCommandRules(deviceId);
        const next = res.data;
        const lv = next.latestVersion;
        const before = prevStatus.current;
        if (lv && before && before.version === lv.version && before.status === "PENDING" && lv.status === "APPLIED") {
          setJustApplied(true);
          setTimeout(() => setJustApplied(false), 1600);
        }
        prevStatus.current = lv ? { version: lv.version, status: lv.status } : null;
        setData(next);
        setNow(Date.now());
        if (replaceRules) {
          setRules(toEditorRules(next.rules));
          setSaved(next.rules);
        }
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load command rules");
      }
    },
    [deviceId]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const pending = data?.latestVersion?.status === "PENDING";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(t);
  }, [pending, load]);

  /* ---------------- derived ---------------- */
  const validation = useMemo(() => validateEditor(rules), [rules]);
  const dirty = useMemo(
    () => JSON.stringify(rules.map(toCommandRule)) !== JSON.stringify(saved.map((r) => toCommandRule({ ...r, uid: "", idEdited: true }))),
    [rules, saved]
  );
  const matchIndex = useMemo(
    () => tryGesture(rules, gesture.blinks, gesture.left, gesture.right, gesture.together && gesture.left > 0 && gesture.right > 0),
    [rules, gesture]
  );
  const matchUid = matchIndex >= 0 ? rules[matchIndex]?.uid : null;
  const deviceSeenRecently = Boolean(data?.lastSeenAt && now - new Date(data.lastSeenAt).getTime() < OFFLINE_AFTER_MS);

  // Restart the match glow whenever the matched row changes
  useEffect(() => {
    setFlashUid(null);
    if (!matchUid) return;
    const id = requestAnimationFrame(() => setFlashUid(matchUid));
    return () => cancelAnimationFrame(id);
  }, [matchUid, gesture]);

  /* ---------------- layout animation & refs ---------------- */
  const flip = useFlipList(
    rules.map((r) => r.uid),
    listRef
  );
  const registerRow = useCallback(
    (uid: string) => {
      const flipRef = flip(uid);
      return (el: HTMLElement | null) => {
        flipRef(el);
        if (el) rowNodes.current.set(uid, el);
        else rowNodes.current.delete(uid);
      };
    },
    [flip]
  );

  useEffect(() => {
    if (!focusLabelUid) return;
    labelInputs.current.get(focusLabelUid)?.focus();
    setFocusLabelUid(null);
  }, [focusLabelUid, rules]);

  useEffect(() => {
    if (!focusHandleUid) return;
    handleButtons.current.get(focusHandleUid)?.focus();
    setFocusHandleUid(null);
  }, [focusHandleUid, rules]);

  /* ---------------- conflict connectors ---------------- */
  const [connectors, setConnectors] = useState<{ id: number; y1: number; y2: number; x: number }[]>([]);
  const measureConnectors = useCallback(() => {
    const lines = validation.conflicts
      .map((c, i) => {
        const a = rowNodes.current.get(rules[c.a]?.uid);
        const b = rowNodes.current.get(rules[c.b]?.uid);
        if (!a || !b) return null;
        const mid = (el: HTMLElement) => el.offsetTop + Math.min(el.offsetHeight / 2, 34);
        return { id: c.id, y1: mid(a), y2: mid(b), x: 6 + (i % 3) * 6 };
      })
      .filter(Boolean) as { id: number; y1: number; y2: number; x: number }[];
    setConnectors(lines);
  }, [validation.conflicts, rules]);

  useLayoutEffect(() => {
    measureConnectors();
  }, [measureConnectors]);

  useEffect(() => {
    const host = listRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureConnectors());
    ro.observe(host);
    return () => ro.disconnect();
  }, [measureConnectors]);

  /* ---------------- editing ---------------- */
  const takenIds = (except: string) => new Set(rules.filter((r) => r.uid !== except).map((r) => r.id));

  const updateRule = (uid: string, patch: Partial<EditorRule>) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined && !r.idEdited) {
          next.id = ruleKeyFromLabel(patch.label, new Set(prev.filter((x) => x.uid !== uid).map((x) => x.id)));
        }
        // "Both hands together" needs at least one squeeze on each hand
        if (patch.simultaneous) {
          if (next.emgLeft[0] < 1) next.emgLeft = [1, Math.max(1, next.emgLeft[1])];
          if (next.emgRight[0] < 1) next.emgRight = [1, Math.max(1, next.emgRight[1])];
        }
        return next;
      })
    );
    setServerError(null);
  };

  const addRule = () => {
    if (rules.length >= MAX_RULES) return;
    const uid = newUid();
    const rule: EditorRule = {
      uid,
      idEdited: false,
      id: ruleKeyFromLabel("NEW COMMAND", new Set(rules.map((r) => r.id))),
      label: "NEW COMMAND",
      eog: [0, 0],
      emgLeft: [0, 0],
      emgRight: [0, 0],
    };
    setRules((prev) => [...prev, rule]);
    setFocusLabelUid(uid);
  };

  const deleteRule = (uid: string) => {
    const index = rules.findIndex((r) => r.uid === uid);
    if (index < 0) return;
    const rule = rules[index];
    setLeavingUid(uid);
    setTimeout(() => {
      setRules((prev) => prev.filter((r) => r.uid !== uid));
      setLeavingUid(null);
    }, 180);
    setUndo({ rule, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  };

  const undoDelete = () => {
    if (!undo) return;
    setRules((prev) => {
      const next = [...prev];
      next.splice(Math.min(undo.index, next.length), 0, undo.rule);
      return next;
    });
    setFocusLabelUid(undo.rule.uid);
    setUndo(null);
  };

  const moveTo = (uid: string, toIndex: number) => {
    setRules((prev) => {
      const from = prev.findIndex((r) => r.uid === uid);
      if (from < 0 || toIndex < 0 || toIndex >= prev.length || from === toIndex) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  /* ---------------- saving ---------------- */
  const onlyAlarmChanged = () => {
    const savedAlarms = saved.filter((r) => r.alarm);
    if (savedAlarms.length !== 1) return false;
    const before = savedAlarms[0];
    const after = rules.find((r) => r.id === before.id);
    if (!after) return true;
    const norm = (r: CommandRuleItem) => JSON.stringify(toCommandRule({ ...r, uid: "", idEdited: true }));
    return norm(before) !== norm(after);
  };

  const doSave = async () => {
    setConfirm(null);
    setSaving(true);
    setServerError(null);
    try {
      await apiClient.saveCommandRules(deviceId, rules.map(toCommandRule));
      await load(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.details as { details?: { errors?: RuleFieldError[] } } | undefined;
        const first = body?.details?.errors?.[0];
        setServerError(first ? `${err.message} (row ${first.rule !== null ? first.rule + 1 : "set"})` : err.message);
      } else {
        setServerError("Could not save the rules. Check the connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (validation.errorCount > 0 || saving) return;
    if (onlyAlarmChanged()) setConfirm({ kind: "alarm" });
    else doSave();
  };

  const doReset = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      await apiClient.resetCommandRules(deviceId);
      await load(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const doRevert = async (version: number) => {
    setConfirm(null);
    setBusy(true);
    try {
      await apiClient.revertCommandRules(deviceId, version);
      await load(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- render ---------------- */
  if (loadError && !data) {
    return (
      <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-5 text-sm text-[#B42318] space-y-3">
        <p className="font-bold">Could not load command rules</p>
        <p className="text-xs">{loadError}</p>
        <button type="button" onClick={() => load(true)} className="rounded-lg bg-[#B42318] px-3 py-1.5 text-xs font-bold text-white">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2.5" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl border border-[#E5D9CA] bg-[#F0EAE1] animate-pulse" />
        ))}
      </div>
    );
  }

  const errorSummary =
    validation.errorCount === 0
      ? "No problems."
      : `${validation.errorCount} problem${validation.errorCount === 1 ? "" : "s"}. ${
          validation.setErrors[0] || validation.rows.flat()[0]?.message || ""
        }`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#AD5D3D]">Device commands</div>
          <h2 className="font-heading text-lg font-bold text-[#211C19]">
            {variant === "setup" ? "Review the patient's commands" : "Commands"}
          </h2>
          <p className="text-xs text-[#76685F] max-w-xl">
            {variant === "setup"
              ? "These six default commands are already saved for this device as version 1. Accept them as they are, or edit and send a new version."
              : "Each command is a gesture the patient can make. The device downloads changes over Wi-Fi; no reflash is needed."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {data.latestVersion && (
            <StatusPill
              version={data.latestVersion}
              deviceSeenRecently={deviceSeenRecently}
              appliedVersion={data.appliedConfigVersion}
              justApplied={justApplied}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((s) => !s)}
              className="rounded-lg border border-[#E5D9CA] bg-[#FFFCF7] px-3 py-1.5 text-xs font-bold text-[#76685F] hover:text-[#211C19] hover:border-[#C8BEB4] transition"
            >
              Version history
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ kind: "reset" })}
              className="rounded-lg border border-[#E5D9CA] bg-[#FFFCF7] px-3 py-1.5 text-xs font-bold text-[#76685F] hover:text-[#AD5D3D] hover:border-[#AD5D3D] transition disabled:opacity-40"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="nv-pop-in">
          <VersionHistory
            versions={data.versions}
            appliedVersion={data.appliedConfigVersion}
            busy={busy}
            onRevert={(version) => setConfirm({ kind: "revert", version })}
          />
        </div>
      )}

      {/* Column headings (wide screens) */}
      <div
        className={`hidden lg:grid ${ROW_GRID} gap-3 px-3 pl-10 text-[10px] font-bold uppercase tracking-wider text-[#76685F]`}
        aria-hidden
      >
        <span />
        <span>Command name</span>
        <span>Forehead EOG (blinks)</span>
        <span>Left wrist EMG (squeezes)</span>
        <span>Right wrist EMG (squeezes)</span>
        <span className="flex items-center gap-1">Both hands <InfoTip label="About both hands together" text={TOGETHER_TIP} /></span>
        <span className="flex items-center gap-1">Urgent <InfoTip label="About urgent" text={URGENT_TIP} /></span>
        <span className="flex items-center gap-1">Alarm <InfoTip label="About alarm" text={ALARM_TIP} /></span>
        <span />
      </div>

      {/* Rows */}
      <div ref={listRef} className="relative pl-7 space-y-2.5">
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-7 overflow-visible">
          {connectors.map((c) => (
            <g key={c.id} className="nv-pop-in">
              <path
                d={`M 28 ${c.y1} H ${c.x + 6} Q ${c.x} ${c.y1} ${c.x} ${c.y1 + 6} V ${c.y2 - 6} Q ${c.x} ${c.y2} ${c.x + 6} ${c.y2} H 28`}
                fill="none"
                stroke="#B42318"
                strokeWidth="1.6"
                strokeDasharray="3 3"
              />
              <circle cx={c.x} cy={(c.y1 + c.y2) / 2} r="7" fill="#B42318" />
              <text x={c.x} y={(c.y1 + c.y2) / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
                {c.id}
              </text>
            </g>
          ))}
        </svg>

        {rules.map((rule, index) => (
          <RuleRow
            key={rule.uid}
            rule={rule}
            index={index}
            total={rules.length}
            issues={validation.rows[index] || []}
            warnings={validation.warnings[index] || []}
            matched={flashUid === rule.uid}
            leaving={leavingUid === rule.uid}
            dragging={dragUid === rule.uid}
            draggable={armedUid === rule.uid}
            advancedOpen={advanced.has(rule.uid)}
            takenIds={takenIds(rule.uid)}
            rowRef={registerRow(rule.uid)}
            labelRef={(el) => (el ? labelInputs.current.set(rule.uid, el) : labelInputs.current.delete(rule.uid))}
            handleRef={(el) => (el ? handleButtons.current.set(rule.uid, el) : handleButtons.current.delete(rule.uid))}
            onChange={(patch) => updateRule(rule.uid, patch)}
            onDelete={() => deleteRule(rule.uid)}
            onToggleAdvanced={() =>
              setAdvanced((s) => {
                const n = new Set(s);
                if (n.has(rule.uid)) n.delete(rule.uid);
                else n.add(rule.uid);
                return n;
              })
            }
            onArm={(on) => setArmedUid(on ? rule.uid : null)}
            onDragStart={() => setDragUid(rule.uid)}
            onDragOverRow={() => {
              if (dragUid && dragUid !== rule.uid) moveTo(dragUid, index);
            }}
            onDragEnd={() => {
              setDragUid(null);
              setArmedUid(null);
            }}
            onMove={(delta) => {
              moveTo(rule.uid, index + delta);
              setFocusHandleUid(rule.uid);
            }}
          />
        ))}
      </div>

      {/* Add + undo */}
      <div className="flex flex-wrap items-center justify-between gap-3 pl-7">
        <button
          type="button"
          onClick={addRule}
          disabled={rules.length >= MAX_RULES}
          className="rounded-xl border border-dashed border-[#C8BEB4] bg-[#FFFCF7] px-4 py-2 text-xs font-bold text-[#AD5D3D] hover:border-[#AD5D3D] hover:bg-[#F5ECE6] transition disabled:opacity-40"
        >
          + Add command
        </button>
        <span className="text-[11px] text-[#76685F]">
          {rules.length} of {MAX_RULES} commands
        </span>
      </div>

      {undo && (
        <div role="status" className="nv-pop-in ml-7 flex items-center justify-between gap-3 rounded-xl bg-[#211C19] px-4 py-2.5 text-xs text-[#FFFCF7] shadow-hover">
          <span>
            Deleted &ldquo;{undo.rule.displayLabel || undo.rule.label}&rdquo;.
          </span>
          <button type="button" onClick={undoDelete} className="rounded-md px-2 py-1 font-bold text-[#F5ECE6] underline underline-offset-2 hover:text-white">
            Undo
          </button>
        </div>
      )}

      {/* Set-level problems & warnings */}
      {(validation.setErrors.length > 0 || validation.setWarnings.length > 0) && (
        <div className="space-y-1.5 pl-7">
          {validation.setErrors.map((m) => (
            <p key={m} className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-xs font-semibold text-[#B42318]">
              {capitalize(m)}
            </p>
          ))}
          {validation.setWarnings.map((m) => (
            <p key={m} className="rounded-lg border border-[#F4DFC8] bg-[#FBF3E8] px-3 py-2 text-xs font-semibold text-[#8C4318]">
              {m}
            </p>
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {errorSummary}
      </p>

      <TryGesturePanel rules={rules} input={gesture} onChange={setGesture} matchIndex={matchIndex} />

      {serverError && (
        <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-xs font-semibold text-[#B42318]">
          {serverError}
        </p>
      )}

      {/* Footer actions */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7]/95 px-3 py-2.5 backdrop-blur shadow-subtle">
        <span className={`text-xs font-semibold ${validation.errorCount ? "text-[#B42318]" : dirty ? "text-[#AD5D3D]" : "text-[#76685F]"}`}>
          {validation.errorCount
            ? `Fix ${validation.errorCount} problem${validation.errorCount === 1 ? "" : "s"} before saving`
            : dirty
            ? "Unsaved changes"
            : "Saved"}
        </span>
        <div className="flex flex-wrap gap-2">
          {variant === "setup" && onDone && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-xl border border-[#E5D9CA] px-4 py-2 text-xs font-bold text-[#76685F] hover:text-[#211C19] transition"
            >
              {dirty ? "Finish without saving changes" : "Accept & finish"}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={validation.errorCount > 0 || saving || !dirty}
            className="rounded-xl bg-[#AD5D3D] px-5 py-2 text-xs font-bold text-white shadow-subtle transition hover:bg-[#964F33] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save & send to device"}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="rules-confirm-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-[#211C19]/45 p-4 backdrop-blur-sm">
          <div className="nv-pop-in w-full max-w-sm rounded-2xl border border-[#E5D9CA] bg-[#FFFCF7] p-5 shadow-hover space-y-3">
            <h3 id="rules-confirm-title" className="font-heading text-base font-bold text-[#211C19]">
              {confirm.kind === "alarm" ? "Change the only alarm command?" : confirm.kind === "reset" ? "Reset to the default commands?" : `Re-issue version ${confirm.version}?`}
            </h3>
            <p className="text-xs leading-relaxed text-[#76685F]">
              {confirm.kind === "alarm"
                ? "This removes or changes the only command that raises the emergency alarm. Make sure the patient and staff know the new gesture."
                : confirm.kind === "reset"
                ? "The six default commands will be saved as a new version and sent to the device."
                : "Its commands will be saved as a new version and sent to the device."}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" autoFocus onClick={() => setConfirm(null)} className="rounded-lg border border-[#E5D9CA] px-3 py-1.5 text-xs font-bold text-[#76685F]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => (confirm.kind === "alarm" ? doSave() : confirm.kind === "reset" ? doReset() : doRevert(confirm.version))}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white ${confirm.kind === "alarm" ? "bg-[#B42318] hover:bg-[#912018]" : "bg-[#AD5D3D] hover:bg-[#964F33]"}`}
              >
                {confirm.kind === "alarm" ? "Save anyway" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ====================================================================== */
/* One rule row                                                            */
/* ====================================================================== */
function RuleRow({
  rule,
  index,
  total,
  issues,
  warnings,
  matched,
  leaving,
  dragging,
  draggable,
  advancedOpen,
  takenIds,
  rowRef,
  labelRef,
  handleRef,
  onChange,
  onDelete,
  onToggleAdvanced,
  onArm,
  onDragStart,
  onDragOverRow,
  onDragEnd,
  onMove,
}: {
  rule: EditorRule;
  index: number;
  total: number;
  issues: RowIssue[];
  warnings: string[];
  matched: boolean;
  leaving: boolean;
  dragging: boolean;
  draggable: boolean;
  advancedOpen: boolean;
  takenIds: Set<string>;
  rowRef: (el: HTMLElement | null) => void;
  labelRef: (el: HTMLInputElement | null) => void;
  handleRef: (el: HTMLButtonElement | null) => void;
  onChange: (patch: Partial<EditorRule>) => void;
  onDelete: () => void;
  onToggleAdvanced: () => void;
  onArm: (on: boolean) => void;
  onDragStart: () => void;
  onDragOverRow: () => void;
  onDragEnd: () => void;
  onMove: (delta: number) => void;
}) {
  const name = rule.displayLabel?.trim() || rule.label || `command ${index + 1}`;
  const hasError = issues.length > 0;
  const fieldError = (field: string) => issues.some((i) => i.field === field);
  const errId = `rule-${rule.uid}-errors`;
  const idClash = takenIds.has(rule.id);

  return (
    <article
      ref={rowRef}
      aria-label={`Command ${index + 1}: ${name}`}
      aria-describedby={hasError ? errId : undefined}
      data-leaving={leaving}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", rule.uid);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverRow();
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => e.preventDefault()}
      className={`nv-rule-card relative overflow-visible rounded-2xl border p-3 shadow-subtle ${
        hasError
          ? "border-[#FECDCA] bg-gradient-to-br from-[#FFFCF7] to-[#FEF3F2]"
          : "border-[#E5D9CA] bg-gradient-to-br from-[#FFFCF7] to-[#FAF5F0]"
      } ${matched ? "nv-rule-match" : ""} ${dragging ? "opacity-60" : ""}`}
    >
      {(rule.alarm || rule.urgent) && (
        <span
          aria-hidden
          className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${rule.alarm ? "bg-[#B42318]" : "bg-[#AD5D3D]"}`}
        />
      )}

      <div className={`grid grid-cols-1 gap-3 ${ROW_GRID} lg:items-start`}>
        {/* Drag handle (mouse drag, or arrow keys) */}
        <button
          ref={handleRef}
          type="button"
          aria-label={`Reorder ${name}, position ${index + 1} of ${total}. Use the up and down arrow keys.`}
          onMouseDown={() => onArm(true)}
          onMouseUp={() => onArm(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && index > 0) {
              e.preventDefault();
              onMove(-1);
            } else if (e.key === "ArrowDown" && index < total - 1) {
              e.preventDefault();
              onMove(1);
            }
          }}
          className="hidden lg:grid mt-2 h-7 w-7 place-items-center rounded-lg text-[#9E9086] hover:bg-[#F0EAE1] hover:text-[#211C19] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AD5D3D]"
        >
          <span aria-hidden className="text-sm leading-none tracking-[-2px]">⋮⋮</span>
        </button>

        {/* Name */}
        <div className="space-y-1.5 min-w-0">
          <div className="relative">
            <input
              ref={labelRef}
              value={rule.label}
              maxLength={40}
              onChange={(e) => onChange({ label: e.target.value })}
              aria-label={`Command name sent to the device, row ${index + 1}`}
              aria-invalid={fieldError("label")}
              className={`h-10 w-full rounded-xl border px-3 pr-12 font-heading text-sm font-bold text-[#211C19] focus:outline-none focus:ring-2 focus:ring-[#AD5D3D]/25 ${
                fieldError("label") ? "border-[#B42318] bg-[#FEF3F2]" : "border-[#E5D9CA] bg-[#FFFCF7] focus:border-[#AD5D3D]"
              }`}
            />
            <span
              aria-live="polite"
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums ${rule.label.length >= 36 ? "text-[#AD5D3D]" : "text-[#9E9086]"}`}
            >
              {rule.label.length}/40
            </span>
          </div>
          <input
            value={rule.displayLabel || ""}
            onChange={(e) => onChange({ displayLabel: e.target.value })}
            maxLength={80}
            placeholder="Display name (optional)"
            title="Shown on the dashboard only. Any language or emoji."
            aria-label={`Display name for the dashboard, row ${index + 1}`}
            className="h-8 w-full rounded-lg border border-[#E5D9CA] bg-[#FFFCF7] px-3 text-xs text-[#211C19] placeholder-[#9E9086] focus:border-[#AD5D3D] focus:outline-none focus:ring-2 focus:ring-[#AD5D3D]/20"
          />
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={onToggleAdvanced}
            className="text-[11px] font-semibold text-[#76685F] hover:text-[#AD5D3D]"
          >
            {advancedOpen ? "Hide advanced" : "Advanced"} · <span className="font-mono">{rule.id || "—"}</span>
          </button>
          {advancedOpen && (
            <div className="nv-pop-in space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-[#76685F]">Device id</label>
              <input
                value={rule.id}
                maxLength={24}
                onChange={(e) => onChange({ id: e.target.value.toLowerCase(), idEdited: true })}
                aria-label={`Device id, row ${index + 1}`}
                aria-invalid={fieldError("id") || idClash}
                className={`h-8 w-full rounded-lg border px-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#AD5D3D]/20 ${
                  fieldError("id") || idClash ? "border-[#B42318] bg-[#FEF3F2]" : "border-[#E5D9CA] bg-[#FFFCF7] focus:border-[#AD5D3D]"
                }`}
              />
              <p className="text-[10px] text-[#9E9086]">a–z, 0–9, _ or -, up to 24. Generated from the name until you edit it.</p>
            </div>
          )}
        </div>

        {/* Channels */}
        <div className="grid grid-cols-3 gap-2 lg:contents">
          {CHANNELS.map((c) => (
            <div key={c.key} className="space-y-1 lg:space-y-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#76685F] lg:hidden">{c.short}</span>
              <RangeCell
                value={rule[c.key as Channel]}
                onChange={(r) => onChange({ [c.key]: r } as Partial<EditorRule>)}
                channelLabel={c.title}
                ruleName={name}
                invalid={fieldError("counts") || (c.key !== "eog" && fieldError("simultaneous"))}
              />
            </div>
          ))}
        </div>

        {/* Switches */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:contents">
          <SwitchCell label="Both hands" tip={TOGETHER_TIP}>
            <Switch
              label={`Both hands together for ${name}`}
              checked={Boolean(rule.simultaneous)}
              onChange={(v) => onChange({ simultaneous: v })}
            />
          </SwitchCell>
          <SwitchCell label="Urgent" tip={URGENT_TIP}>
            <Switch label={`Urgent for ${name}`} checked={Boolean(rule.urgent)} onChange={(v) => onChange({ urgent: v })} />
          </SwitchCell>
          <SwitchCell label="Alarm" tip={ALARM_TIP}>
            <Switch label={`Alarm for ${name}`} tone="emergency" checked={Boolean(rule.alarm)} onChange={(v) => onChange({ alarm: v })} />
          </SwitchCell>
        </div>

        {/* Delete + mobile reorder */}
        <div className="flex items-center gap-1 lg:block">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${name}`}
            className="h-9 w-9 lg:mt-0.5 grid place-items-center rounded-lg text-lg leading-none text-[#9E9086] hover:bg-[#FEF3F2] hover:text-[#B42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318]"
          >
            ×
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${name} up`}
            className="lg:hidden h-9 w-9 grid place-items-center rounded-lg text-[#76685F] hover:bg-[#F0EAE1] disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${name} down`}
            className="lg:hidden h-9 w-9 grid place-items-center rounded-lg text-[#76685F] hover:bg-[#F0EAE1] disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Summary, errors, warnings */}
      <div className="mt-2.5 space-y-1 border-t border-[#E5D9CA]/70 pt-2 lg:ml-[40px]">
        <p className="text-xs text-[#4A4039]">{describeRule(toCommandRule(rule))}</p>
        {hasError && (
          <ul id={errId} className="space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B42318]">
                {issue.conflictId && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-[#B42318] text-[9px] font-bold text-white">{issue.conflictId}</span>
                )}
                {capitalize(issue.message)}
                {issue.partner !== undefined && ` (with row ${issue.partner + 1})`}
              </li>
            ))}
          </ul>
        )}
        {warnings.map((w) => (
          <p key={w} className="text-[11px] font-semibold text-[#8C4318]">
            {w}
          </p>
        ))}
      </div>
    </article>
  );
}

function SwitchCell({ label, tip, children }: { label: string; tip: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 lg:block lg:pt-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#76685F] lg:hidden">
        {label} <InfoTip label={`About ${label.toLowerCase()}`} text={tip} />
      </span>
      {children}
    </div>
  );
}
