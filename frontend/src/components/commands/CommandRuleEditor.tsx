"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient, ApiError, CommandRuleItem, DeviceRulesResponse, RuleFieldError } from "@/lib/api";
import { InfoTip, StatusPill, Switch, useFlipList } from "./controls";
import TryGesturePanel, { GestureInput } from "./TryGesturePanel";
import { SPEECH_PRESETS, buildSentence, speak, speechSupported, speechTemplateFor } from "@/lib/speech";
import { AlertTriangle } from "@/lib/noIcons";
import {
  CANONICAL_GESTURES,
  CanonicalGesture,
  CHANNELS,
  Channel,
  EditorRule,
  MAX_RULES,
  RowIssue,
  describeRule,
  formatRange,
  isMandatoryRule,
  matchCanonicalGesture,
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
  const isOnline = Boolean(
    (data as unknown as { isOnline?: boolean; connectivityStatus?: string })?.isOnline ||
    (data as unknown as { isOnline?: boolean; connectivityStatus?: string })?.connectivityStatus === "ONLINE" ||
    (data?.lastSeenAt && now - new Date(data.lastSeenAt).getTime() < OFFLINE_AFTER_MS)
  );
  const deviceSeenRecently = isOnline;

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

  const missingGestures = useMemo(() => {
    return CANONICAL_GESTURES.filter((g) => !rules.some((r) => matchCanonicalGesture(r)?.id === g.id));
  }, [rules]);

  const addCanonicalRule = (g: CanonicalGesture) => {
    if (rules.length >= MAX_RULES) return;
    const existing = rules.find((r) => matchCanonicalGesture(r)?.id === g.id);
    if (existing) {
      setFocusLabelUid(existing.uid);
      return;
    }
    const uid = newUid();
    const rule: EditorRule = {
      uid,
      idEdited: true,
      id: g.id,
      label: g.defaultLabel,
      displayLabel: g.defaultDisplayLabel,
      speechTemplate: g.defaultSpeechTemplate,
      eog: [...g.eog],
      emgLeft: [...g.emgLeft],
      emgRight: [...g.emgRight],
      simultaneous: g.simultaneous,
      urgent: g.urgent,
      alarm: g.alarm,
    };
    setRules((prev) => [...prev, rule]);
    setFocusLabelUid(uid);
  };

  const addRule = () => {
    if (rules.length >= MAX_RULES) return;
    // Prefer adding the next missing canonical gesture
    if (missingGestures.length > 0) {
      addCanonicalRule(missingGestures[0]);
      return;
    }
    const fallback = CANONICAL_GESTURES[0];
    const uid = newUid();
    const rule: EditorRule = {
      uid,
      idEdited: true,
      id: ruleKeyFromLabel("CUSTOM COMMAND", new Set(rules.map((r) => r.id))),
      label: "CUSTOM COMMAND",
      displayLabel: "Custom Command",
      speechTemplate: "Patient needs assistance",
      eog: [...fallback.eog],
      emgLeft: [...fallback.emgLeft],
      emgRight: [...fallback.emgRight],
      simultaneous: fallback.simultaneous,
      urgent: fallback.urgent,
      alarm: fallback.alarm,
    };
    setRules((prev) => [...prev, rule]);
    setFocusLabelUid(uid);
  };

  const deleteRule = (uid: string) => {
    const index = rules.findIndex((r) => r.uid === uid);
    if (index < 0) return;
    const rule = rules[index];
    if (isMandatoryRule(rule)) return; // Protection: YES, NO, and EMERGENCY are mandatory
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
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">Device commands</div>
          <h2 className="text-lg font-bold text-slate-900">
            {variant === "setup" ? "Review Bedside Commands" : "Device Gesture Commands"}
          </h2>
          <p className="text-xs text-slate-600 max-w-xl">
            {variant === "setup"
              ? "These standard calibrated commands are saved as the active configuration. Accept them as-is, or modify them for this patient."
              : "Calibrated sensor triggers detected by the patient's device. Updating commands replaces the single active configuration over Wi-Fi."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Battery Indicator (only shown when device is active/online and battery is reported) */}
            {isOnline && data.batteryLevel !== undefined && data.batteryLevel !== null && (
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  data.batteryLevel > 50
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 "
                    : data.batteryLevel > 20
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 "
                    : "border-rose-500/30 bg-rose-500/10 text-rose-800  animate-pulse"
                }`}
                title={`Device battery level: ${data.batteryLevel}%`}
              >
                <span>{data.batteryLevel > 20 ? "🔋" : "🪫"}</span>
                <span>{data.batteryLevel}% Battery</span>
              </div>
            )}

            {data.latestVersion && (
              <StatusPill
                version={data.latestVersion}
                deviceSeenRecently={deviceSeenRecently}
                appliedVersion={data.appliedConfigVersion}
                justApplied={justApplied}
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!isOnline || busy}
              onClick={() => setConfirm({ kind: "reset" })}
              className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:text-slate-900 :text-slate-100 transition disabled:opacity-40"
              title={!isOnline ? "Device is offline. Connect gateway to reset." : "Restore default commands"}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div role="alert" className="rounded-xl border border-[#E8BCBC]  bg-[#FAEEEE]  p-3.5 text-xs flex items-center gap-3 text-[#9E3232] ">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#9E3232] " />
          <div>
            <strong>Device is Offline (Read-Only):</strong> Command rules cannot be modified or saved while the gateway is offline. The device must be online with active telemetry to receive updated OTA configurations.
          </div>
        </div>
      )}

      {/* Hardware Gestures Policy Banner */}
      <div className="rounded-xl border border-sky-200  bg-sky-50  px-3.5 py-2.5 text-xs text-sky-800  flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base select-none">🔒</span>
          <div>
            <strong className="font-semibold">Firmware nv-5.0.0 Fixed Gestures:</strong> Exactly 7 fixed gestures. Every gesture must be completed within 5 seconds.
            <span className="block text-[11px] text-sky-700/80 ">Command names (WATER, PAIN, ADJUSTMENT, CALL NURSE, NO, EMERGENCY, YES), display labels, and urgency flags are fully editable.</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-[11px] font-semibold bg-white/70  px-2.5 py-1 rounded-lg border border-sky-300 ">
            {rules.length} of 7 Commands
          </div>
          {isOnline && data.batteryLevel !== undefined && data.batteryLevel !== null && (
            <div className="font-mono text-[11px] font-semibold bg-emerald-500/15 text-emerald-800  px-2.5 py-1 rounded-lg border border-emerald-500/30">
              🔋 {data.batteryLevel}%
            </div>
          )}
        </div>
      </div>

      {/* Column headings (wide screens) */}
      <div
        className={`hidden lg:grid ${ROW_GRID} gap-3 px-3 pl-10 text-[10px] font-semibold uppercase tracking-wider text-[#68747C] `}
        aria-hidden
      >
        <span />
        <span>Command name (Editable)</span>
        <span className="flex items-center gap-1">Blinks 🔒</span>
        <span className="flex items-center gap-1">Left wrist 🔒</span>
        <span className="flex items-center gap-1">Right wrist 🔒</span>
        <span className="flex items-center gap-1">Both hands 🔒 <InfoTip label="About both hands together" text={TOGETHER_TIP} /></span>
        <span className="flex items-center gap-1">Urgent (Edit) <InfoTip label="About urgent" text={URGENT_TIP} /></span>
        <span className="flex items-center gap-1">Alarm 🔒 <InfoTip label="About alarm" text={ALARM_TIP} /></span>
        <span />
      </div>

      <datalist id="nv-speech-presets">
        {SPEECH_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* Rows */}
      <div
        ref={listRef}
        className={`relative pl-7 space-y-2.5 ${
          !isOnline ? "pointer-events-none opacity-60 select-none cursor-not-allowed" : ""
        }`}
      >
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-7 overflow-visible">
          {connectors.map((c) => (
            <g key={c.id}>
              <path
                d={`M 28 ${c.y1} H ${c.x + 6} Q ${c.x} ${c.y1} ${c.x} ${c.y1 + 6} V ${c.y2 - 6} Q ${c.x} ${c.y2} ${c.x + 6} ${c.y2} H 28`}
                fill="none"
                stroke="#B54747"
                strokeWidth="1.6"
                strokeDasharray="3 3"
              />
              <circle cx={c.x} cy={(c.y1 + c.y2) / 2} r="7" fill="#B54747" />
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

      {/* Add + presets + undo */}
      <div className="flex flex-col gap-3 pl-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {missingGestures.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={addRule}
                  disabled={!isOnline || rules.length >= MAX_RULES}
                  className="rounded-xl border border-[#183A4A] bg-[#183A4A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#122C38] transition disabled:opacity-40"
                >
                  + Add Next Gesture (#{missingGestures[0].gestureNumber})
                </button>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-[#68747C] ">Quick Add:</span>
                  {missingGestures.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => addCanonicalRule(g)}
                      disabled={!isOnline || rules.length >= MAX_RULES}
                      className="rounded-lg border border-[#DFE3DF]  bg-white  px-2.5 py-1.5 text-[11px] font-semibold text-[#18212B]  hover:border-[#183A4A] transition disabled:opacity-40"
                      title={g.description}
                    >
                      #{g.gestureNumber} {g.title}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-800  border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                All 7 Standard Gestures are Configured
              </span>
            )}
          </div>
          <span className="text-[11px] text-[#68747C] ">
            {rules.length} of {MAX_RULES} commands
          </span>
        </div>
      </div>

      {undo && (
        <div role="status" className="ml-7 flex items-center justify-between gap-3 rounded-xl bg-[#18212B] px-4 py-2.5 text-xs text-white shadow-lg">
          <span>
            Deleted &ldquo;{undo.rule.displayLabel || undo.rule.label}&rdquo;.
          </span>
          <button type="button" onClick={undoDelete} className="rounded-md px-2 py-1 font-semibold text-[#B9D8D2] underline underline-offset-2 hover:text-white">
            Undo
          </button>
        </div>
      )}

      {/* Set-level problems & warnings */}
      {(validation.setErrors.length > 0 || validation.setWarnings.length > 0) && (
        <div className="space-y-1.5 pl-7">
          {validation.setErrors.map((m) => (
            <p key={m} className="rounded-lg border border-[#F2C4C4] bg-[#FDF1F1] px-3 py-2 text-xs font-semibold text-[#B54747]">
              {capitalize(m)}
            </p>
          ))}
          {validation.setWarnings.map((m) => (
            <p key={m} className="rounded-lg border border-[#F0DCBE] bg-[#FBF5EC] px-3 py-2 text-xs font-semibold text-[#A86B24]">
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
        <p role="alert" className="rounded-lg border border-[#F2C4C4] bg-[#FDF1F1] px-3 py-2 text-xs font-semibold text-[#B54747]">
          {serverError}
        </p>
      )}

      {/* Footer actions */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DFE3DF]  bg-white/95  px-3 py-2.5 backdrop-blur shadow-xs">
        <span className={`text-xs font-semibold ${!isOnline ? "text-[#B54747]" : validation.errorCount ? "text-[#B54747]" : dirty ? "text-[#183A4A] " : "text-[#68747C] "}`}>
          {!isOnline
            ? "Device is offline (read-only)"
            : validation.errorCount
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
              className="rounded-xl border border-[#DFE3DF]  px-4 py-2 text-xs font-semibold text-[#68747C]  hover:text-[#18212B] :text-[#F0F4F7] transition"
            >
              {dirty ? "Finish without saving changes" : "Accept & finish"}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!isOnline || validation.errorCount > 0 || saving || !dirty}
            className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 text-xs font-semibold shadow-xs transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save & send to device"}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="rules-confirm-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-[#18212B]/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-[#DFE3DF]  bg-white  p-5 shadow-lg space-y-3">
            <h3 id="rules-confirm-title" className="text-base font-semibold text-[#18212B] ">
              {confirm.kind === "alarm" ? "Change the only alarm command?" : confirm.kind === "reset" ? "Reset to the default commands?" : `Re-issue version ${confirm.version}?`}
            </h3>
            <p className="text-xs leading-relaxed text-[#68747C] ">
              {confirm.kind === "alarm"
                ? "This removes or changes the only command that raises the emergency alarm. Make sure the patient and staff know the new gesture."
                : confirm.kind === "reset"
                ? "The 7 standard canonical commands will be saved as a new version and sent to the device."
                : "Its commands will be saved as a new version and sent to the device."}
            </p>
            <div className="flex justify-end gap-2 pt-1 border-t border-[#DFE3DF] ">
              <button type="button" autoFocus onClick={() => setConfirm(null)} className="rounded-lg border border-[#DFE3DF]  px-3 py-1.5 text-xs font-semibold text-[#68747C] ">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => (confirm.kind === "alarm" ? doSave() : confirm.kind === "reset" ? doReset() : doRevert(confirm.version))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${confirm.kind === "alarm" ? "bg-[#B54747] hover:bg-[#8E3232]" : "bg-[#183A4A] hover:bg-[#122C38]"}`}
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
  const canonical = matchCanonicalGesture(rule);
  const isMandatory = isMandatoryRule(rule);
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
      className={`relative overflow-visible rounded-2xl border p-3 shadow-xs ${
        hasError
          ? "border-[#F2C4C4] bg-[#FDF1F1] "
          : "border-[#DFE3DF]  bg-[#EDEFEA]/40 "
      } ${matched ? "ring-2 ring-[#287A59]" : ""} ${dragging ? "opacity-60" : ""}`}
    >
      {(rule.alarm || rule.urgent) && (
        <span
          aria-hidden
          className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${rule.alarm ? "bg-[#B54747]" : "bg-[#183A4A] "}`}
        />
      )}

      {/* Gesture Header & Selector */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE3DF]/80  pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-800  border border-emerald-500/20">
            <span className="font-mono">#{canonical ? canonical.gestureNumber : index + 1}</span>
            <span>{canonical ? canonical.title : rule.label}</span>
            <span className="text-[10px] opacity-75 font-normal">🔒 Locked Pattern</span>
          </span>
          {isMandatory && (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-300">
              MANDATORY ACTION
            </span>
          )}
          {canonical && (
            <span className="text-xs text-[#68747C] ">
              {canonical.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[#68747C] ">
            Change Gesture:
          </label>
          <select
            value={canonical?.id || ""}
            onChange={(e) => {
              const target = CANONICAL_GESTURES.find((g) => g.id === e.target.value);
              if (target) {
                onChange({
                  eog: [...target.eog],
                  emgLeft: [...target.emgLeft],
                  emgRight: [...target.emgRight],
                  simultaneous: target.simultaneous,
                  alarm: target.alarm,
                  urgent: target.urgent !== undefined ? target.urgent : rule.urgent,
                });
              }
            }}
            className="h-7 rounded-lg border border-[#DFE3DF]  bg-white  px-2 text-xs font-semibold text-[#18212B]  focus:border-[#183A4A] focus:outline-none"
            title="Switch which standard physical gesture activates this command"
          >
            {CANONICAL_GESTURES.map((g) => (
              <option key={g.id} value={g.id}>
                #{g.gestureNumber}: {g.title}
              </option>
            ))}
          </select>
        </div>
      </div>

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
          className="hidden lg:grid mt-2 h-7 w-7 place-items-center rounded-lg text-[#68747C]  hover:bg-[#EDEFEA] :bg-[#1B2636] hover:text-[#18212B] :text-[#F0F4F7] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A]"
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
              className={`h-10 w-full rounded-xl border px-3 pr-12 text-sm font-semibold text-[#18212B]  focus:outline-none focus:ring-1 focus:ring-[#183A4A]/20 ${
                fieldError("label") ? "border-[#B54747] bg-[#FDF1F1]" : "border-[#DFE3DF]  bg-white  focus:border-[#183A4A] :border-[#B9D8D2]"
              }`}
            />
            <span
              aria-live="polite"
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums ${rule.label.length >= 36 ? "text-[#B54747]" : "text-[#68747C] "}`}
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
            className="h-8 w-full rounded-lg border border-[#DFE3DF]  bg-white  px-3 text-xs text-[#18212B]  placeholder-[#68747C] focus:border-[#183A4A] :border-[#B9D8D2] focus:outline-none focus:ring-1 focus:ring-[#183A4A]/20"
          />
          {/* Voice phrase: completes "Patient on bed X ...", dashboard only */}
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#68747C] ">Spoken as</span>
            <input
              value={rule.speechTemplate || ""}
              onChange={(e) => onChange({ speechTemplate: e.target.value })}
              maxLength={120}
              list="nv-speech-presets"
              placeholder={speechTemplateFor(rule.id, undefined)}
              title='Completes "Patient on bed X ...". {command} is replaced with the command name.'
              aria-label={`Spoken phrase for voice alerts, row ${index + 1}`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#DFE3DF]  bg-white  px-2.5 text-xs text-[#18212B]  placeholder-[#68747C] focus:border-[#183A4A] :border-[#B9D8D2] focus:outline-none focus:ring-1 focus:ring-[#183A4A]/20"
            />
            {speechSupported() && (
              <button
                type="button"
                onClick={() =>
                  speak(
                    buildSentence("4", speechTemplateFor(rule.id, rule.speechTemplate), rule.displayLabel?.trim() || rule.label),
                    { interrupt: true }
                  )
                }
                aria-label={`Preview how ${name} is announced`}
                title={buildSentence("4", speechTemplateFor(rule.id, rule.speechTemplate), rule.displayLabel?.trim() || rule.label)}
                className="h-8 w-8 shrink-0 grid place-items-center rounded-lg border border-[#DFE3DF]  text-[#68747C]  hover:text-[#183A4A] hover:border-[#183A4A] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183A4A]"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={onToggleAdvanced}
            className="text-[11px] font-semibold text-[#376B70]  hover:text-[#183A4A]"
          >
            {advancedOpen ? "Hide advanced" : "Advanced"} · <span className="font-mono">{rule.id || "—"}</span>
          </button>
          {advancedOpen && (
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-[#68747C] ">Device id</label>
              <input
                value={rule.id}
                maxLength={24}
                onChange={(e) => onChange({ id: e.target.value.toLowerCase(), idEdited: true })}
                aria-label={`Device id, row ${index + 1}`}
                aria-invalid={fieldError("id") || idClash}
                className={`h-8 w-full rounded-lg border px-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#183A4A]/20 ${
                  fieldError("id") || idClash ? "border-[#B54747] bg-[#FDF1F1]" : "border-[#DFE3DF]  bg-white  focus:border-[#183A4A] :border-[#B9D8D2]"
                }`}
              />
              <p className="text-[10px] text-[#68747C] ">a–z, 0–9, _ or -, up to 24. Generated from the name until you edit it.</p>
            </div>
          )}
        </div>

        {/* Channels (Locked Hardware Gesture Patterns) */}
        <div className="grid grid-cols-3 gap-2 lg:contents">
          {CHANNELS.map((c) => {
            const formatted = formatRange(rule[c.key as Channel]);
            return (
              <div key={c.key} className="space-y-1 lg:space-y-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#68747C]  lg:hidden">
                  {c.short} 🔒
                </span>
                <div
                  className="flex h-10 items-center justify-between rounded-xl border border-[#DFE3DF]  bg-[#F7F9F7]  px-2.5 text-xs font-mono font-semibold text-[#18212B] "
                  title={`${c.title}: ${formatted} (${c.unit}s) - Fixed for hardware gesture reliability`}
                >
                  <span>{formatted}</span>
                  <span className="text-[10px] opacity-60 select-none">🔒</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Switches */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:contents">
          <div className="flex items-center gap-2 lg:block lg:pt-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#68747C]  lg:hidden">
              Both hands 🔒 <InfoTip label="About both hands together" text={TOGETHER_TIP} />
            </span>
            <div
              className="flex h-7 items-center text-xs font-semibold"
              title="Locked to gesture pattern"
            >
              {rule.simultaneous ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700  border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Yes
                </span>
              ) : (
                <span className="rounded-md bg-[#DFE3DF]/50  px-2 py-0.5 text-[11px] font-medium text-[#68747C] ">
                  No
                </span>
              )}
            </div>
          </div>

          <SwitchCell label="Urgent" tip={URGENT_TIP}>
            <Switch label={`Urgent for ${name}`} checked={Boolean(rule.urgent)} onChange={(v) => onChange({ urgent: v })} />
          </SwitchCell>

          <div className="flex items-center gap-2 lg:block lg:pt-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#68747C]  lg:hidden">
              Alarm 🔒 <InfoTip label="About alarm" text={ALARM_TIP} />
            </span>
            <div className="flex h-7 items-center text-xs font-semibold">
              {rule.alarm ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-700  border border-rose-500/30">
                  🚨 Active
                </span>
              ) : (
                <span className="rounded-md bg-[#DFE3DF]/50  px-2 py-0.5 text-[11px] font-medium text-[#68747C] ">
                  Off
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Delete + mobile reorder */}
        <div className="flex items-center gap-1 lg:block">
          {isMandatory ? (
            <span
              title="Mandatory system action: YES, NO, and EMERGENCY are required for bedside audio confirmation and safety alarms."
              className="h-9 w-9 lg:mt-0.5 grid place-items-center text-xs text-slate-400 cursor-not-allowed select-none"
            >
              🔒
            </span>
          ) : (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${name}`}
              className="h-9 w-9 lg:mt-0.5 grid place-items-center rounded-lg text-lg leading-none text-[#68747C] hover:bg-[#FDF1F1] hover:text-[#B54747] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B54747] transition"
            >
              ×
            </button>
          )}
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${name} up`}
            className="lg:hidden h-9 w-9 grid place-items-center rounded-lg text-[#68747C] hover:bg-[#EDEFEA] disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${name} down`}
            className="lg:hidden h-9 w-9 grid place-items-center rounded-lg text-[#68747C] hover:bg-[#EDEFEA] disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Summary, errors, warnings */}
      <div className="mt-2.5 space-y-1 border-t border-[#DFE3DF]  pt-2 lg:ml-[40px]">
        <p className="text-xs text-[#68747C] ">{describeRule(toCommandRule(rule))}</p>
        {hasError && (
          <ul id={errId} className="space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B54747]">
                {issue.conflictId && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-[#B54747] text-[9px] font-bold text-white">{issue.conflictId}</span>
                )}
                {capitalize(issue.message)}
                {issue.partner !== undefined && ` (with row ${issue.partner + 1})`}
              </li>
            ))}
          </ul>
        )}
        {warnings.map((w) => (
          <p key={w} className="text-[11px] font-semibold text-[#A86B24]">
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
      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#68747C]  lg:hidden">
        {label} <InfoTip label={`About ${label.toLowerCase()}`} text={tip} />
      </span>
      {children}
    </div>
  );
}
