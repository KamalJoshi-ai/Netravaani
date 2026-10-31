"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient, CommandRuleItem, DeviceItem, PatientItem, CommunicationMode, HandshakeStatus } from "@/lib/api";
import { DEFAULT_RULES, isMandatoryRule } from "@/lib/commandRules";
import { pickVoice, speak as speechSpeak, speechTemplateFor } from "@/lib/speech";
import {
  Volume2,
  AlertTriangle,
  Clock,
  Sliders,
  X,
  Lock,
  Shield,
  Check,
} from "@/lib/noIcons";
import { ThemeToggle } from "@/lib/theme";

interface ActiveConfirmationState {
  mode: "DISPATCH_CONFIRMATION" | "RESOLUTION_CONFIRMATION";
  requestId: string;
  deviceId?: string;
  patientCode?: string;
  patientName?: string;
  bedLabel?: string;
  action?: string;
  actionLabel?: string;
  ruleId?: string;
  gesture?: string;
  counts?: { eog: number; emgLeft: number; emgRight: number; together?: number };
  urgent?: boolean;
  alarm?: boolean;
  speechPrompt: string;
  confirmGesture: string;
  rejectGesture: string;
  expiresAt: string;
  secondsRemaining: number;
}

export interface BedsideCommandItem {
  ruleId: string;
  label: string;
  displayLabel?: string;
  speechTemplate?: string;
  action: string;
  gesture: string;
  countSummary: string;
  counts: { eog: number; emgLeft: number; emgRight: number; together: number };
  urgent?: boolean;
  alarm?: boolean;
  isMandatory?: boolean;
  hint?: string;
}

function formatGestureRule(r: {
  eog: [number, number];
  emgLeft: [number, number];
  emgRight: [number, number];
  simultaneous?: boolean;
}): { description: string; countSummary: string } {
  const [bMin, bMax] = r.eog;
  const [lMin, lMax] = r.emgLeft;
  const [rMin, rMax] = r.emgRight;

  const bStr = bMin === 0 && bMax === 0 ? "" : bMax >= 20 ? `${bMin}+ blinks` : bMin === bMax ? `${bMin} blinks` : `${bMin}–${bMax} blinks`;
  const lStr = lMin === 0 && lMax === 0 ? "" : lMax >= 20 ? `${lMin}+ left` : lMin === lMax ? `${lMin} left` : `${lMin}–${lMax} left`;
  const rStr = rMin === 0 && rMax === 0 ? "" : rMax >= 20 ? `${rMin}+ right` : rMin === rMax ? `${rMin} right` : `${rMin}–${rMax} right`;

  if (r.simultaneous && lMin > 0 && rMin > 0) {
    const range = lMax >= 20 ? `${lMin}+` : lMin === lMax ? `${lMin}` : `${lMin}–${lMax}`;
    return {
      description: `${range} squeezes (Both hands together)`,
      countSummary: `Both wrists ×${range}`,
    };
  }

  if (bStr && !lStr && !rStr) {
    return {
      description: `${bStr} (Forehead EOG)`,
      countSummary: bStr,
    };
  }

  if (lStr && !rStr) {
    return {
      description: `${lStr} wrist squeezes`,
      countSummary: lStr,
    };
  }

  if (rStr && !lStr) {
    return {
      description: `${rStr} wrist squeezes`,
      countSummary: rStr,
    };
  }

  const parts = [bStr, lStr, rStr].filter(Boolean);
  return {
    description: parts.join(" + ") || "Any gesture",
    countSummary: parts.join(" · ") || "0 counts",
  };
}

function getResolvedApiBase(): string {
  if (typeof window !== "undefined") {
    const envApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    try {
      const url = new URL(envApi, window.location.origin);
      if (
        (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1" &&
        window.location.hostname !== ""
      ) {
        url.hostname = window.location.hostname;
      }
      return url.toString().replace(/\/+$/, "");
    } catch {
      return `${window.location.protocol}//${window.location.hostname}:5000/api`;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
}

function BedsideAudioContent() {
  const searchParams = useSearchParams();
  const urlDeviceId = searchParams.get("deviceId") || "";
  const urlPatientCode = searchParams.get("patientCode") || "";

  // Device & Patient scoping
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(urlDeviceId);
  const [selectedPatientCode, setSelectedPatientCode] = useState<string>(urlPatientCode);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);

  // Speaker & Audio state
  const [isSpeakerActive, setIsSpeakerActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastSpokenAt, setLastSpokenAt] = useState<string>("");
  const [voiceVolume, setVoiceVolume] = useState<number>(1.0);
  const [voiceRate, setVoiceRate] = useState<number>(0.90);
  const [voicePitch, setVoicePitch] = useState<number>(1.12);
  const [currentVoiceName, setCurrentVoiceName] = useState<string>("");
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Active confirmation prompt (outgoing dispatch or incoming resolution)
  const [activePrompt, setActivePrompt] = useState<ActiveConfirmationState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // nv-4.0.0 simulator state
  const [simulatorStatus, setSimulatorStatus] = useState<string>("");
  const [simulatorLoading, setSimulatorLoading] = useState<string | null>(null);

  // Mandatory Handshake & Communication Mode State
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>("MANDATORY_HANDSHAKE");
  const [handshakeStatus, setHandshakeStatus] = useState<HandshakeStatus>("PENDING");
  const [yesSent, setYesSent] = useState<boolean>(false);
  const [noSent, setNoSent] = useState<boolean>(false);
  const [hasActiveCall, setHasActiveCall] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Audio Context for synthetic chimes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<{ release?: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void } | null>(null);
  const spokenRequestIdsRef = useRef<Set<string>>(new Set());

  // Initialize Web Audio Context
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Play synthetic pleasant chime
  const playChime = useCallback((type: "prompt" | "success" | "alert") => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "prompt") {
        // Two pleasant notes (C5 -> E5)
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === "success") {
        // Three ascending notes (C5 -> E5 -> G5)
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.12);
        osc.frequency.setValueAtTime(783.99, now + 0.24);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        // Alert chime (A4 -> F4)
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(349.23, now + 0.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {
      console.warn("Chime error:", e);
    }
  }, [getAudioContext]);

  // Detect and update active voice name
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const updateVoice = () => {
      const v = pickVoice();
      if (v) setCurrentVoiceName(v.name);
    };
    updateVoice();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", updateVoice);
    } else {
      synth.onvoiceschanged = updateVoice;
    }
    return () => {
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", updateVoice);
      } else if (synth.onvoiceschanged === updateVoice) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  // Speech synthesis function
  const speak = useCallback((text: string, onEnd?: () => void) => {
    speechSpeak(text, {
      volume: voiceVolume,
      rate: voiceRate,
      pitch: voicePitch,
      interrupt: true,
      onEnd,
    });
    const v = pickVoice(text);
    if (v) setCurrentVoiceName(v.name);
    setLastSpokenAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [voiceVolume, voiceRate, voicePitch]);

  // Request Wake Lock so the phone doesn't sleep while standing at bedside
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try {
        const lock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release?: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void }> } }).wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockActive(false);
          wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn("Wake lock request failed:", err);
      }
    }
  }, []);

  // Activate Bedside Speaker on explicit user touch
  const activateSpeaker = () => {
    getAudioContext();
    playChime("prompt");
    speak("Bedside speaker activated. Ready to assist patient.");
    setIsSpeakerActive(true);
    requestWakeLock();
  };

  // Live device rules synced from Nurse Dashboard commands section
  const [deviceRules, setDeviceRules] = useState<CommandRuleItem[]>([]);

  const activeDevId = selectedDeviceId || devices[0]?.deviceId || "";

  useEffect(() => {
    if (!activeDevId) return;
    let isCancelled = false;

    async function loadRules() {
      try {
        const res = await apiClient.getCommandRules(activeDevId);
        if (!isCancelled && res.data?.rules && res.data.rules.length > 0) {
          setDeviceRules(res.data.rules);
        }
      } catch (err) {
        console.warn("[BedsideAudio] Could not fetch live device rules:", err);
      }
    }

    loadRules();
    return () => {
      isCancelled = true;
    };
  }, [activeDevId]);

  // Map live device rules to bedside commands, aligned with Nurse Dashboard
  const effectiveCommands: BedsideCommandItem[] = useMemo(() => {
    const rawList: CommandRuleItem[] = deviceRules.length > 0 ? deviceRules : DEFAULT_RULES;
    return rawList.map((r) => {
      const gInfo = formatGestureRule(r);
      const isMand = isMandatoryRule(r);
      const action =
        r.id.toUpperCase() === "YES"
          ? "YES"
          : r.id.toUpperCase() === "NO"
          ? "NO"
          : r.alarm || r.id === "emergency"
          ? "EMERGENCY"
          : r.id === "water"
          ? "WATER"
          : r.id === "call_nurse"
          ? "CALL_NURSE"
          : r.id === "adjustment"
          ? "REPOSITION"
          : r.label.toUpperCase().replace(/\s+/g, "_");

      return {
        ruleId: r.id,
        label: r.label,
        displayLabel: r.displayLabel || r.label,
        speechTemplate: r.speechTemplate || speechTemplateFor(r.id),
        action,
        gesture: gInfo.description,
        countSummary: gInfo.countSummary,
        counts: {
          eog: r.eog[0],
          emgLeft: r.emgLeft[0],
          emgRight: r.emgRight[0],
          together: r.simultaneous ? r.emgLeft[0] : 0,
        },
        urgent: r.urgent,
        alarm: r.alarm,
        isMandatory: isMand,
        hint: r.alarm ? "Emergency alarm: alerts nurse immediately & triggers red alarm" : undefined,
      };
    });
  }, [deviceRules]);

  const liveYesRule = useMemo(() => {
    return effectiveCommands.find((c) => c.ruleId === "yes" || c.action === "YES") || effectiveCommands[0];
  }, [effectiveCommands]);

  const liveNoRule = useMemo(() => {
    return effectiveCommands.find((c) => c.ruleId === "no" || c.action === "NO") || effectiveCommands[1];
  }, [effectiveCommands]);

  // Trigger command with live counts, labels, and announce voice template
  const sendTestCommand = async (cmd: BedsideCommandItem) => {
    const targetDevId = activeDevId || "NetraVaani-01";
    setSimulatorLoading(cmd.ruleId);
    setSimulatorStatus("");
    try {
      if (isSpeakerActive && cmd.speechTemplate) {
        playChime("prompt");
        speak(cmd.speechTemplate);
      }

      const res = await apiClient.sendDeviceEvent({
        eventId: `bedside-${cmd.ruleId}-${Date.now()}`,
        deviceId: targetDevId,
        ruleId: cmd.ruleId,
        gestureId: cmd.ruleId,
        gesture: cmd.gesture,
        label: cmd.displayLabel || cmd.label,
        action: cmd.action,
        counts: cmd.counts,
        urgent: cmd.urgent,
        alarm: cmd.alarm,
        configVersion: 1,
      });

      const eventOutcome = res as unknown as { reason?: string; accepted?: boolean; message?: string };
      if (eventOutcome.reason === "ACTIVE_REQUEST_EXISTS" || eventOutcome.reason === "MAX_ACTIVE_REQUESTS_REACHED") {
        setHasActiveCall(true);
        setSimulatorStatus(`✕ Blocked: A call is already open for this bed. Wait until resolved.`);
        return;
      }
      if (eventOutcome.reason === "HANDSHAKE_INCOMPLETE" || eventOutcome.accepted === false) {
        setSimulatorStatus(`✕ Gated: ${eventOutcome.message || "Only YES, NO, and EMERGENCY are permitted until handshake completes."}`);
        return;
      }

      if (cmd.ruleId === "yes" || cmd.action === "YES") {
        setYesSent(true);
        setSimulatorStatus("✓ YES gesture validated and acknowledged by backend.");
      } else if (cmd.ruleId === "no" || cmd.action === "NO") {
        setNoSent(true);
        setSimulatorStatus("✓ NO gesture validated and acknowledged by backend.");
      } else if (res.data?.status === "PENDING_DISPATCH_CONFIRMATION") {
        setSimulatorStatus(`✓ ${cmd.displayLabel || cmd.label} detected. Awaiting patient confirmation.`);
      } else if (res.data?.status === "NEW" || cmd.alarm) {
        setHasActiveCall(true);
        setSimulatorStatus(`✓ ${cmd.displayLabel || cmd.label} sent to nurse station.`);
      } else {
        setSimulatorStatus(`✓ ${cmd.displayLabel || cmd.label} received.`);
      }

      // Sync state immediately
      if (selectedPatientCode) {
        const commRes = await apiClient.getPatientCommunicationState(selectedPatientCode);
        if (commRes.data) {
          setHandshakeStatus(commRes.data.handshakeStatus);
          setCommunicationMode(commRes.data.communicationMode);
        }
      } else if (selectedDeviceId) {
        const commRes = await apiClient.getDeviceCommunicationState(selectedDeviceId);
        if (commRes.data) {
          setHandshakeStatus(commRes.data.handshakeStatus);
          setCommunicationMode(commRes.data.communicationMode);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Check device connection";
      setSimulatorStatus(`✕ Failed to send: ${msg}`);
    } finally {
      setSimulatorLoading(null);
    }
  };

  // Re-acquire wake lock if page becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isSpeakerActive) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isSpeakerActive, requestWakeLock]);

  // Load available devices and patients for dropdown picker
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [devRes, ptRes] = await Promise.all([
          apiClient.getDevices(),
          apiClient.getPatients({ limit: 50 }),
        ]);
        if (devRes.data) setDevices(devRes.data);
        if (ptRes.data) setPatients(ptRes.data);
      } catch (e) {
        console.warn("Error loading devices/patients:", e);
      }
    }
    loadMetadata();
  }, []);

  // Sync selected device/patient from URL if provided
  useEffect(() => {
    if (urlDeviceId) setSelectedDeviceId(urlDeviceId);
    if (urlPatientCode) setSelectedPatientCode(urlPatientCode);
  }, [urlDeviceId, urlPatientCode]);

  // Countdown timer for active confirmation
  useEffect(() => {
    if (!activePrompt) {
      setSecondsLeft(0);
      return;
    }

    const targetTime = new Date(activePrompt.expiresAt).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setActivePrompt(null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activePrompt]);

  // Handle incoming Bedside Audio events
  const handleAudioEvent = useCallback((event: {
    type: string;
    mode?: "DISPATCH_CONFIRMATION" | "RESOLUTION_CONFIRMATION";
    requestId: string;
    deviceId?: string;
    patientCode?: string;
    patientName?: string;
    bedLabel?: string;
    speechPrompt: string;
    confirmGesture?: string;
    rejectGesture?: string;
    expiresAt: string;
    action?: string;
    actionLabel?: string;
    resolved?: boolean;
    [key: string]: unknown;
  }) => {
    if (event.type === "DISPATCH_CONFIRMATION_REQUESTED") {
      const prompt: ActiveConfirmationState = {
        mode: "DISPATCH_CONFIRMATION",
        requestId: event.requestId,
        deviceId: event.deviceId,
        patientCode: event.patientCode,
        patientName: event.patientName,
        bedLabel: event.bedLabel,
        action: event.action,
        actionLabel: event.actionLabel || event.action?.replace(/_/g, " "),
        ruleId: (event.ruleId as string) || (event.gestureId as string),
        gesture: (event.gesture as string) || (event.actionLabel as string) || event.action,
        counts: event.counts as { eog: number; emgLeft: number; emgRight: number; together?: number } | undefined,
        urgent: Boolean(event.urgent),
        alarm: Boolean(event.alarm),
        speechPrompt: event.speechPrompt,
        confirmGesture: event.confirmGesture || "YES",
        rejectGesture: event.rejectGesture || "NO",
        expiresAt: event.expiresAt,
        secondsRemaining: 15,
      };

      setActivePrompt(prompt);

      if (isSpeakerActive && !spokenRequestIdsRef.current.has(event.requestId)) {
        spokenRequestIdsRef.current.add(event.requestId);
        playChime("prompt");
        setTimeout(() => {
          speak(event.speechPrompt);
        }, 300);
      }
    } else if (event.type === "REQUEST_DISPATCHED") {
      setActivePrompt(null);
      setHasActiveCall(true);

      if (isSpeakerActive) {
        playChime("success");
        setTimeout(() => {
          speak(event.speechPrompt || "Your request has been sent.");
        }, 300);
      }
    } else if (event.type === "REQUEST_CANCELLED") {
      setActivePrompt(null);
      setHasActiveCall(false);

      if (isSpeakerActive) {
        setTimeout(() => {
          speak(event.speechPrompt || "Request cancelled.");
        }, 200);
      }
    } else if (event.type === "PATIENT_CONFIRMATION_REQUESTED") {
      const prompt: ActiveConfirmationState = {
        mode: "RESOLUTION_CONFIRMATION",
        requestId: event.requestId,
        deviceId: event.deviceId,
        patientCode: event.patientCode,
        patientName: event.patientName,
        bedLabel: event.bedLabel,
        speechPrompt: event.speechPrompt,
        confirmGesture: event.confirmGesture || "DOUBLE_SQUEEZE_RIGHT",
        rejectGesture: event.rejectGesture || "SINGLE_SQUEEZE_LEFT",
        expiresAt: event.expiresAt,
        secondsRemaining: 45,
      };

      setActivePrompt(prompt);

      if (isSpeakerActive && !spokenRequestIdsRef.current.has(event.requestId)) {
        spokenRequestIdsRef.current.add(event.requestId);
        playChime("prompt");
        setTimeout(() => {
          speak(event.speechPrompt);
        }, 300);
      }
    } else if (event.type === "PATIENT_CONFIRMATION_RESULT") {
      setActivePrompt(null);
      if (event.resolved) {
        setHasActiveCall(false);
      } else {
        setHasActiveCall(true);
      }

      if (isSpeakerActive) {
        if (event.resolved) {
          playChime("success");
          setTimeout(() => {
            speak(event.speechPrompt || "Thank you. Call marked as resolved.");
          }, 350);
        } else {
          playChime("alert");
          setTimeout(() => {
            speak(event.speechPrompt || "Assistance not confirmed. Alerting nurse station.");
          }, 350);
        }
      }
    } else if (event.type === "REQUEST_LIMIT_REACHED") {
      setHasActiveCall(true);

      if (isSpeakerActive) {
        playChime("alert");
        setTimeout(() => {
          speak(event.speechPrompt || "Active call in progress. Please wait for nursing staff, or trigger emergency if urgent.");
        }, 300);
      }
    } else if (event.type === "HANDSHAKE_UPDATED") {
      if (event.handshakeStatus) {
        setHandshakeStatus(event.handshakeStatus as HandshakeStatus);
        if (event.handshakeStatus === "WAITING_FOR_NO" || event.handshakeStatus === "COMPLETED") {
          setYesSent(true);
        }
        if (event.handshakeStatus === "WAITING_FOR_YES" || event.handshakeStatus === "COMPLETED") {
          setNoSent(true);
        }
      }
      if (event.communicationMode) {
        setCommunicationMode(event.communicationMode as CommunicationMode);
      }
      if (event.yesSentAt) setYesSent(true);
      if (event.noSentAt) setNoSent(true);

      if (isSpeakerActive && event.speechPrompt) {
        playChime(event.handshakeStatus === "COMPLETED" ? "success" : "prompt");
        setTimeout(() => {
          speak(event.speechPrompt);
        }, 300);
      }
    }
  }, [isSpeakerActive, playChime, speak]);

  // SSE Stream Connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackPollInterval: NodeJS.Timeout | null = null;

    try {
      const baseApi = getResolvedApiBase();
      let sseUrl: URL;
      try {
        sseUrl = new URL(`${baseApi}/care-requests/bedside-audio-events`);
      } catch {
        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        sseUrl = new URL(`/api/care-requests/bedside-audio-events`, origin);
      }
      if (selectedDeviceId) sseUrl.searchParams.set("deviceId", selectedDeviceId);
      if (selectedPatientCode) sseUrl.searchParams.set("patientCode", selectedPatientCode);

      eventSource = new EventSource(sseUrl.toString());

      eventSource.onopen = () => {
        setConnectionStatus("connected");
      };

      eventSource.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === "CONNECTED") {
            setConnectionStatus("connected");
            return;
          }
          handleAudioEvent(data);
        } catch {
          // ignore keep-alive or ping
        }
      };

      eventSource.onerror = () => {
        setConnectionStatus("disconnected");
      };
    } catch {
      setConnectionStatus("disconnected");
    }

    // Polling fallback every 4 seconds to ensure state sync even on unstable Wi-Fi
    const pollStatus = async () => {
      try {
        const res = await apiClient.getBedsideAudioStatus({
          deviceId: selectedDeviceId || undefined,
          patientCode: selectedPatientCode || undefined,
        });
        if (res.data) {
          setConnectionStatus("connected");
          const item = res.data;
          setActivePrompt((prev) => {
            if (!prev || prev.requestId !== item.requestId) {
              if (isSpeakerActive && !spokenRequestIdsRef.current.has(item.requestId)) {
                spokenRequestIdsRef.current.add(item.requestId);
                playChime("prompt");
                setTimeout(() => speak(item.speechPrompt), 300);
              }
            }
            return {
              mode: item.mode || (item.action ? "DISPATCH_CONFIRMATION" : "RESOLUTION_CONFIRMATION"),
              ...item,
            };
          });
        } else if (res.status === "success") {
          // Server reachable, idle status
          setConnectionStatus("connected");
        }

        // Check for active open calls for this patient/device
        if (selectedPatientCode || selectedDeviceId) {
          try {
            const reqs = await apiClient.getCareRequests({
              patientCode: selectedPatientCode || undefined,
              deviceId: selectedDeviceId || undefined,
              limit: 5,
            });
            if (reqs?.data) {
              const active = reqs.data.some(
                (r) => r.status === "NEW" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
              );
              setHasActiveCall(active);
            }
          } catch {
            // ignore
          }
        }
        if (selectedPatientCode) {
          const commRes = await apiClient.getPatientCommunicationState(selectedPatientCode);
          if (commRes.data) {
            setHandshakeStatus(commRes.data.handshakeStatus);
            setCommunicationMode(commRes.data.communicationMode);
            if (commRes.data.handshakeStatus === "WAITING_FOR_NO" || commRes.data.handshakeStatus === "COMPLETED" || commRes.data.yesSentAt) {
              setYesSent(true);
            }
            if (commRes.data.handshakeStatus === "WAITING_FOR_YES" || commRes.data.handshakeStatus === "COMPLETED" || commRes.data.noSentAt) {
              setNoSent(true);
            }
          }
        } else if (selectedDeviceId) {
          const commRes = await apiClient.getDeviceCommunicationState(selectedDeviceId);
          if (commRes.data) {
            setHandshakeStatus(commRes.data.handshakeStatus);
            setCommunicationMode(commRes.data.communicationMode);
            if (commRes.data.handshakeStatus === "WAITING_FOR_NO" || commRes.data.handshakeStatus === "COMPLETED" || commRes.data.yesSentAt) {
              setYesSent(true);
            }
            if (commRes.data.handshakeStatus === "WAITING_FOR_YES" || commRes.data.handshakeStatus === "COMPLETED" || commRes.data.noSentAt) {
              setNoSent(true);
            }
          }
        }
      } catch {
        // ignore polling failures
      }
    };

    pollStatus();
    fallbackPollInterval = setInterval(pollStatus, 4000);

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackPollInterval) clearInterval(fallbackPollInterval);
    };
  }, [selectedDeviceId, selectedPatientCode, handleAudioEvent, isSpeakerActive, playChime, speak]);

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 font-sans transition-colors duration-150 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-slate-300 px-4 py-3 bg-white/95 backdrop-blur-md sticky top-0 z-20 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-800">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight flex items-center gap-1.5 text-slate-900">
                Bedside Speaker
              </h1>
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {connectionStatus === "connected" ? "Connected" : "Connecting..."}
                {wakeLockActive && <span className="text-[10px] text-emerald-600 font-mono">· Awake</span>}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto w-full flex-1 p-4 flex flex-col gap-3">
        {/* Bed & Device Selector */}
        <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-xs">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Bed / Patient
              </label>
              <select
                value={selectedPatientCode}
                onChange={(e) => setSelectedPatientCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                <option value="">(All Patients)</option>
                {patients.map((p) => (
                  <option key={p._id} value={p.patientCode}>
                    {p.displayName} {p.bedLabel ? `(${p.bedLabel})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Gateway Device
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                <option value="">(All Devices)</option>
                {devices.map((d) => (
                  <option key={d._id} value={d.deviceId}>
                    {d.name || d.deviceId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Speaker Power Card */}
        {!isSpeakerActive ? (
          <div className="bg-white border border-slate-300 rounded-xl p-4 text-center shadow-xs flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-800">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Bedside Voice Speaker</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tap below to activate voice announcements</p>
            </div>
            <button
              onClick={activateSpeaker}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs transition shadow-xs flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              <span>Enable Speaker</span>
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs shadow-xs">
            <span className="font-semibold text-emerald-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Speaker Active
            </span>
            <button
              onClick={() => {
                playChime("prompt");
                speak("Bedside speaker is online.");
              }}
              className="text-[11px] text-teal-800 hover:underline flex items-center gap-1 font-medium"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test Audio</span>
            </button>
          </div>
        )}

        {/* ACTIVE CONFIRMATION PROMPT (Hero UI for Dispatch OR Resolution) */}
        {activePrompt ? (
          <div className="bg-white border-2 border-teal-600 rounded-xl p-4 shadow-sm flex flex-col gap-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {activePrompt.mode === "DISPATCH_CONFIRMATION" ? "Confirm Call" : "Care Completed?"}
              </span>
              <span className="font-mono text-xs font-bold text-teal-800">{secondsLeft}s</span>
            </div>

            <div className="text-center py-2">
              <div className="text-base font-bold text-slate-900">
                {activePrompt.actionLabel || activePrompt.action || "Nurse Request"}
              </div>
              <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{activePrompt.speechPrompt}&rdquo;</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={async () => {
                  if (activePrompt.mode === "DISPATCH_CONFIRMATION") {
                    await apiClient.confirmDispatch(activePrompt.requestId);
                    setActivePrompt(null);
                    playChime("success");
                    speak("Your request has been sent.");
                    setHasActiveCall(true);
                    setSimulatorStatus("✓ Request confirmed and sent to nurse.");
                  } else {
                    await sendTestCommand(liveYesRule);
                  }
                }}
                className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>YES (Send)</span>
              </button>
              <button
                onClick={async () => {
                  if (activePrompt.mode === "DISPATCH_CONFIRMATION") {
                    await apiClient.cancelDispatch(activePrompt.requestId);
                    setActivePrompt(null);
                    playChime("alert");
                    speak("Request cancelled.");
                    setHasActiveCall(false);
                    setSimulatorStatus("✓ Request cancelled. Not sent to nurse dashboard.");
                  } else {
                    await sendTestCommand(liveNoRule);
                  }
                }}
                className="py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <X className="w-4 h-4" />
                <span>NO (Cancel)</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* ACTIVE CALL LOCK BANNER (Requirement 1) */}
        {hasActiveCall && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <div className="font-bold">Call in progress</div>
                <div className="text-[11px] text-amber-800">Commands paused until nurse resolves current call.</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold shrink-0">
              ACTIVE
            </span>
          </div>
        )}

        {/* Handshake Status & Patient Commands */}
        <div className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-xs flex flex-col gap-3">
          {/* Handshake Status Row */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-700" />
              <span>Handshake</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold inline-flex items-center gap-1 ${
                handshakeStatus === "COMPLETED"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                  : handshakeStatus === "WAITING_FOR_NO"
                  ? "bg-teal-50 text-teal-800 border border-teal-300"
                  : handshakeStatus === "WAITING_FOR_YES"
                  ? "bg-teal-50 text-teal-800 border border-teal-300"
                  : "bg-amber-50 text-amber-800 border border-amber-300"
              }`}
            >
              {handshakeStatus === "COMPLETED"
                ? "COMPLETED"
                : handshakeStatus === "WAITING_FOR_NO"
                ? "WAITING FOR NO (YES ✓)"
                : handshakeStatus === "WAITING_FOR_YES"
                ? "WAITING FOR YES (NO ✓)"
                : "PENDING (YES & NO NEEDED)"}
            </span>
          </div>

          {/* Feedback Status Pill */}
          {simulatorStatus && (
            <div
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${
                simulatorStatus.startsWith("✓")
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              {simulatorStatus}
            </div>
          )}

          {/* Mandatory Commands */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Mandatory Signals
            </span>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* YES */}
              <button
                disabled={simulatorLoading === "yes"}
                onClick={() => {
                  const yesCmd = effectiveCommands.find((c) => c.ruleId === "yes") || {
                    ruleId: "yes",
                    label: "YES",
                    action: "YES",
                    gesture: "3–4 blinks (Forehead EOG)",
                    countSummary: "EOG:3",
                    counts: { eog: 3, emgLeft: 0, emgRight: 0, together: 0 },
                    speechTemplate: "yes",
                    urgent: false,
                    alarm: false,
                    isMandatory: true,
                  };
                  sendTestCommand(yesCmd);
                }}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-center flex flex-col items-center justify-between gap-1 transition disabled:opacity-50"
              >
                <span className="font-bold text-slate-900 text-xs">YES</span>
                <span className="text-[10px] text-teal-800 font-medium">3–4 blinks</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  {yesSent || handshakeStatus === "WAITING_FOR_NO" || handshakeStatus === "COMPLETED" ? "Ready" : "Transmit"}
                </span>
              </button>

              {/* NO */}
              <button
                disabled={simulatorLoading === "no"}
                onClick={() => {
                  const noCmd = effectiveCommands.find((c) => c.ruleId === "no") || {
                    ruleId: "no",
                    label: "NO",
                    action: "NO",
                    gesture: "1–2 squeezes (Both hands)",
                    countSummary: "Together:1",
                    counts: { eog: 0, emgLeft: 1, emgRight: 1, together: 1 },
                    speechTemplate: "no",
                    urgent: false,
                    alarm: false,
                    isMandatory: true,
                  };
                  sendTestCommand(noCmd);
                }}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-center flex flex-col items-center justify-between gap-1 transition disabled:opacity-50"
              >
                <span className="font-bold text-slate-900 text-xs">NO</span>
                <span className="text-[10px] text-teal-800 font-medium">1–2 squeezes</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  {noSent || handshakeStatus === "WAITING_FOR_YES" || handshakeStatus === "COMPLETED" ? "Ready" : "Transmit"}
                </span>
              </button>

              {/* EMERGENCY */}
              <button
                disabled={simulatorLoading === "emergency"}
                onClick={() => {
                  const emergCmd = effectiveCommands.find((c) => c.ruleId === "emergency") || {
                    ruleId: "emergency",
                    label: "EMERGENCY",
                    action: "EMERGENCY",
                    gesture: "3+ squeezes (Both wrists)",
                    countSummary: "Together:3",
                    counts: { eog: 0, emgLeft: 3, emgRight: 3, together: 3 },
                    speechTemplate: "Emergency alert",
                    urgent: true,
                    alarm: true,
                    isMandatory: true,
                  };
                  sendTestCommand(emergCmd);
                }}
                className="bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg p-2.5 text-center flex flex-col items-center justify-between gap-1 transition disabled:opacity-50"
              >
                <span className="font-bold text-rose-950 text-xs">EMERGENCY</span>
                <span className="text-[10px] text-rose-800 font-medium">3+ squeezes</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold">
                  Alarm
                </span>
              </button>
            </div>
          </div>

          {/* Assistance Commands */}
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Assistance Calls
            </span>

            {communicationMode !== "NORMAL_COMMUNICATION" ? (
              <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs text-center">
                <Lock className="w-3.5 h-3.5 inline-block mr-1 text-amber-700" />
                Locked until initial YES &amp; NO handshake completes
              </div>
            ) : hasActiveCall ? (
              <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs text-center">
                <Clock className="w-3.5 h-3.5 inline-block mr-1 text-amber-700" />
                Paused while current call is active
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {effectiveCommands
                  .filter((c) => c.ruleId !== "yes" && c.ruleId !== "no" && c.ruleId !== "emergency")
                  .map((cmd) => (
                    <button
                      key={cmd.ruleId}
                      disabled={simulatorLoading === cmd.ruleId || hasActiveCall}
                      onClick={() => sendTestCommand(cmd)}
                      className="bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-300 rounded-lg p-2.5 text-center flex flex-col items-center justify-between gap-1 transition disabled:opacity-50 shadow-xs"
                    >
                      <span className="font-semibold text-slate-900 text-xs">
                        {cmd.displayLabel || cmd.label}
                      </span>
                      <span className="text-[10px] text-teal-800">{cmd.gesture}</span>
                      <span className="text-[9px] font-semibold text-teal-700">Send &rarr;</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Audio Settings */}
        <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-xs">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-teal-800" />
              <span>Voice Settings</span>
              {currentVoiceName && (
                <span className="text-[10px] text-slate-500 font-normal">
                  ({currentVoiceName.replace(/Microsoft|Online|\(Natural\)|Google/g, "").trim()})
                </span>
              )}
            </span>
            <span className="text-[11px] text-teal-800 font-mono">
              {showSettings ? "Hide" : "Show"}
            </span>
          </button>

          {showSettings && (
            <div className="grid grid-cols-3 gap-3 text-xs mt-3 pt-3 border-t border-slate-200">
              <div>
                <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                  <span>Volume</span>
                  <span className="font-mono">{Math.round(voiceVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                  className="w-full accent-teal-700 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                  <span>Speed</span>
                  <span className="font-mono">{voiceRate}x</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={voiceRate}
                  onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                  className="w-full accent-teal-700 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                  <span>Pitch</span>
                  <span className="font-mono">{voicePitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.02"
                  value={voicePitch}
                  onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                  className="w-full accent-teal-700 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-300 px-4 py-2 bg-white text-[11px] text-center text-slate-500">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span>Bedside Audio Node</span>
          {lastSpokenAt && <span>{lastSpokenAt}</span>}
        </div>
      </footer>
    </div>
  );
}

export default function BedsideAudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center text-xs text-slate-500">
          Initializing Bedside Speaker...
        </div>
      }
    >
      <BedsideAudioContent />
    </Suspense>
  );
}
