"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient, DeviceItem, PatientItem } from "@/lib/api";
import {
  Volume2,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Sliders,
  Bed,
  X,
  ArrowRight,
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
  speechPrompt: string;
  confirmGesture: string;
  rejectGesture: string;
  expiresAt: string;
  secondsRemaining: number;
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
  const [voiceRate, setVoiceRate] = useState<number>(0.95);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Active confirmation prompt (outgoing dispatch or incoming resolution)
  const [activePrompt, setActivePrompt] = useState<ActiveConfirmationState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [dispatchResult, setDispatchResult] = useState<{
    type: "DISPATCHED" | "CANCELLED";
    speechPrompt: string;
    timestamp: string;
  } | null>(null);
  const [resolutionResult, setResolutionResult] = useState<{
    resolved: boolean;
    speechPrompt: string;
    timestamp: string;
  } | null>(null);

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

  // Speech synthesis function
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = voiceVolume;
    utterance.rate = voiceRate;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Siri"))
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (naturalVoice) utterance.voice = naturalVoice;

    if (onEnd) {
      utterance.onend = onEnd;
    }

    window.speechSynthesis.speak(utterance);
    setLastSpokenAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [voiceVolume, voiceRate]);

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
        speechPrompt: event.speechPrompt,
        confirmGesture: event.confirmGesture || "DOUBLE_SQUEEZE_RIGHT",
        rejectGesture: event.rejectGesture || "SINGLE_SQUEEZE_LEFT",
        expiresAt: event.expiresAt,
        secondsRemaining: 15,
      };

      setActivePrompt(prompt);
      setDispatchResult(null);
      setResolutionResult(null);

      if (isSpeakerActive && !spokenRequestIdsRef.current.has(event.requestId)) {
        spokenRequestIdsRef.current.add(event.requestId);
        playChime("prompt");
        setTimeout(() => {
          speak(event.speechPrompt);
        }, 300);
      }
    } else if (event.type === "REQUEST_DISPATCHED") {
      setActivePrompt(null);
      setDispatchResult({
        type: "DISPATCHED",
        speechPrompt: event.speechPrompt || "Your request has been sent.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      if (isSpeakerActive) {
        playChime("success");
        setTimeout(() => {
          speak(event.speechPrompt || "Your request has been sent.");
        }, 300);
      }
    } else if (event.type === "REQUEST_CANCELLED") {
      setActivePrompt(null);
      setDispatchResult({
        type: "CANCELLED",
        speechPrompt: event.speechPrompt || "Request cancelled.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

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
      setResolutionResult(null);

      if (isSpeakerActive && !spokenRequestIdsRef.current.has(event.requestId)) {
        spokenRequestIdsRef.current.add(event.requestId);
        playChime("prompt");
        setTimeout(() => {
          speak(event.speechPrompt);
        }, 300);
      }
    } else if (event.type === "PATIENT_CONFIRMATION_RESULT") {
      setActivePrompt(null);
      setResolutionResult({
        resolved: Boolean(event.resolved),
        speechPrompt: event.speechPrompt || (event.resolved ? "Call resolved." : "Assistance not confirmed."),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

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
    }
  }, [isSpeakerActive, playChime, speak]);

  // SSE Stream Connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackPollInterval: NodeJS.Timeout | null = null;

    const baseApi = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const sseUrl = new URL(`${baseApi}/care-requests/bedside-audio-events`);
    if (selectedDeviceId) sseUrl.searchParams.set("deviceId", selectedDeviceId);
    if (selectedPatientCode) sseUrl.searchParams.set("patientCode", selectedPatientCode);

    try {
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

  // Current selected bed/patient summary
  const targetPatient = patients.find(
    (p) => p.patientCode.toUpperCase() === selectedPatientCode.toUpperCase()
  );
  const targetDevice = devices.find(
    (d) => d.deviceId.toLowerCase() === selectedDeviceId.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#0C0D0E] text-[#2C2825] dark:text-[#E8E6E3] font-sans transition-colors duration-200 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-[#EBE5DC] dark:border-[#222326] px-4 py-3 bg-[#FAF6F0] dark:bg-[#121316] sticky top-0 z-20 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#8C4327]/10 dark:bg-[#8C4327]/25 flex items-center justify-center text-[#8C4327]">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
                Bedside Speaker
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#8C4327]/10 text-[#8C4327] dark:bg-[#8C4327]/20">
                  Audio Node
                </span>
              </h1>
              <p className="text-[11px] text-[#7A7265] dark:text-[#9E9B95] flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    connectionStatus === "connected"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-amber-500"
                  }`}
                />
                {connectionStatus === "connected" ? "Live Connected" : "Connecting..."}
                {wakeLockActive && <span className="text-[10px] text-emerald-600 font-mono">· Screen Awake</span>}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto w-full flex-1 p-4 flex flex-col gap-4">
        {/* Scoping Selector Card */}
        <div className="bg-white dark:bg-[#16171B] border border-[#EBE5DC] dark:border-[#26282E] rounded-xl p-3 shadow-xs">
          <div className="text-xs font-semibold text-[#7A7265] dark:text-[#9E9B95] uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Bedside Node Assignment</span>
            <span className="text-[10px] font-mono text-[#8C4327]">
              {selectedDeviceId || selectedPatientCode ? "Scoped" : "All Beds"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] text-[#7A7265] dark:text-[#9E9B95] mb-1">
                Filter by Bed / Patient:
              </label>
              <select
                value={selectedPatientCode}
                onChange={(e) => setSelectedPatientCode(e.target.value)}
                className="w-full bg-[#FAF6F0] dark:bg-[#1E2025] border border-[#EBE5DC] dark:border-[#2C2F36] rounded-lg px-2 py-1.5 text-xs text-[#2C2825] dark:text-[#E8E6E3] focus:outline-none focus:ring-1 focus:ring-[#8C4327]"
              >
                <option value="">(All Patients / Any Bed)</option>
                {patients.map((p) => (
                  <option key={p._id} value={p.patientCode}>
                    {p.displayName} {p.bedLabel ? `(${p.bedLabel})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[#7A7265] dark:text-[#9E9B95] mb-1">
                Filter by Device ID:
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full bg-[#FAF6F0] dark:bg-[#1E2025] border border-[#EBE5DC] dark:border-[#2C2F36] rounded-lg px-2 py-1.5 text-xs text-[#2C2825] dark:text-[#E8E6E3] focus:outline-none focus:ring-1 focus:ring-[#8C4327]"
              >
                <option value="">(All NetraVaani Devices)</option>
                {devices.map((d) => (
                  <option key={d._id} value={d.deviceId}>
                    {d.name || d.deviceId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(targetPatient || targetDevice) && (
            <div className="mt-2.5 pt-2 border-t border-[#F2ECE2] dark:border-[#22242A] flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-[#554E45] dark:text-[#BAB6AF]">
                <Bed className="w-3.5 h-3.5 text-[#8C4327]" />
                <span className="font-medium">
                  {targetPatient?.bedLabel || targetDevice?.deviceId || "Bed Assigned"}
                </span>
                {targetPatient && <span>• {targetPatient.displayName}</span>}
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20">
                ACTIVE TARGET
              </span>
            </div>
          )}
        </div>

        {/* Audio Activation Banner / Button */}
        {!isSpeakerActive ? (
          <div className="bg-[#FAF3EA] dark:bg-[#201A15] border-2 border-[#8C4327]/30 dark:border-[#8C4327]/40 rounded-2xl p-5 text-center flex flex-col items-center gap-3 shadow-md">
            <div className="w-14 h-14 rounded-full bg-[#8C4327]/15 dark:bg-[#8C4327]/30 flex items-center justify-center text-[#8C4327] animate-pulse">
              <Volume2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#8C4327] dark:text-[#E48A64]">
                Activate Bedside Phone Speaker
              </h2>
              <p className="text-xs text-[#6B5F54] dark:text-[#B5A89A] mt-1 max-w-xs mx-auto leading-relaxed">
                Tap below to enable voice announcements for request dispatch confirmations and resolution verification.
              </p>
            </div>
            <button
              onClick={activateSpeaker}
              className="w-full max-w-xs py-3 px-5 rounded-xl bg-[#8C4327] hover:bg-[#77371F] text-white font-medium text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              <span>Tap to Enable Speaker & Speech</span>
            </button>
            <p className="text-[10px] text-[#8F8476] dark:text-[#9A9185]">
              Browsers require one tap before allowing voice audio playback.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                Bedside Speaker Active & Listening
              </span>
            </div>
            <button
              onClick={() => {
                playChime("prompt");
                speak("Speaker voice test verified.");
              }}
              className="text-[11px] font-medium text-[#8C4327] hover:underline px-2 py-1 rounded bg-[#8C4327]/10"
            >
              Test Voice
            </button>
          </div>
        )}

        {/* ACTIVE CONFIRMATION PROMPT (Hero UI for Dispatch OR Resolution) */}
        {activePrompt ? (
          <div className="bg-white dark:bg-[#17181D] border-2 border-[#8C4327] rounded-2xl p-5 shadow-lg flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#F0EAE1] dark:border-[#26282E] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {activePrompt.mode === "DISPATCH_CONFIRMATION"
                    ? "Confirm Outgoing Request to Nurse"
                    : "Patient Resolution Verification"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-[#8C4327]">
                <Clock className="w-4 h-4" />
                <span>{secondsLeft}s</span>
              </div>
            </div>

            {/* Requested Action Pill (if dispatch confirmation) */}
            {activePrompt.mode === "DISPATCH_CONFIRMATION" && activePrompt.action && (
              <div className="bg-[#8C4327]/10 dark:bg-[#8C4327]/20 border border-[#8C4327]/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#7A7265] dark:text-[#9E9B95] block">
                    Detected Request:
                  </span>
                  <span className="font-serif font-bold text-base text-[#8C4327] dark:text-[#E48A64]">
                    {activePrompt.actionLabel || activePrompt.action}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-500 text-white font-bold">
                  DRAFT • AWAITING CONFIRMATION
                </span>
              </div>
            )}

            {/* Spoken Speech Display */}
            <div className="bg-[#FAF6F0] dark:bg-[#1F2127] rounded-xl p-3.5 border border-[#E8DFD1] dark:border-[#2C2F36]">
              <div className="text-[10px] font-mono uppercase text-[#7A7265] dark:text-[#9E9B95] mb-1 flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-[#8C4327]" />
                Bedside Audio Prompt
              </div>
              <p className="text-sm font-semibold text-[#2C2825] dark:text-[#F0EAE1] italic leading-snug">
                &ldquo;{activePrompt.speechPrompt}&rdquo;
              </p>
              <button
                onClick={() => {
                  playChime("prompt");
                  speak(activePrompt.speechPrompt);
                }}
                className="mt-2 text-[11px] text-[#8C4327] hover:underline flex items-center gap-1 font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                Repeat Voice Prompt
              </button>
            </div>

            {/* Gesture Guides & Direct Action Buttons */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#7A7265] dark:text-[#9E9B95] uppercase tracking-wider flex items-center justify-between">
                <span>Waiting for Patient Signal:</span>
                {activePrompt.mode === "DISPATCH_CONFIRMATION" && (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-normal">
                    (Auto-sends to nurse on timeout)
                  </span>
                )}
              </div>

              {/* YES / CONFIRM Option */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {activePrompt.mode === "DISPATCH_CONFIRMATION"
                      ? "To Send Request to Nurse:"
                      : "To Confirm Resolution (\"YES\"):"}
                  </div>
                  <p className="text-xs text-emerald-950 dark:text-emerald-200 mt-0.5">
                    {activePrompt.confirmGesture === "DOUBLE_SQUEEZE_RIGHT"
                      ? "Double Squeeze Right Wrist (2 clicks)"
                      : activePrompt.confirmGesture.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-600 text-white font-bold">
                    RIGHT ×2
                  </span>
                  {activePrompt.mode === "DISPATCH_CONFIRMATION" && (
                    <button
                      onClick={async () => {
                        await apiClient.confirmDispatch(activePrompt.requestId);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1"
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>Send Now</span>
                    </button>
                  )}
                </div>
              </div>

              {/* NO / CANCEL Option */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    {activePrompt.mode === "DISPATCH_CONFIRMATION"
                      ? "To Cancel Request:"
                      : "To Reject / Needs More Help (\"NO\"):"}
                  </div>
                  <p className="text-xs text-amber-950 dark:text-amber-200 mt-0.5">
                    {activePrompt.rejectGesture === "SINGLE_SQUEEZE_LEFT"
                      ? "Single Squeeze Left Wrist (1 click)"
                      : activePrompt.rejectGesture.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-600 text-white font-bold">
                    LEFT ×1
                  </span>
                  {activePrompt.mode === "DISPATCH_CONFIRMATION" && (
                    <button
                      onClick={async () => {
                        await apiClient.cancelDispatch(activePrompt.requestId);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-700/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/10 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Simulated Band Triggers for Testing */}
            <div className="pt-2 border-t border-[#F0EAE1] dark:border-[#26282E] flex items-center justify-between text-[11px] text-[#7A7265] dark:text-[#9E9689]">
              <span>Testing without wrist band?</span>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (activePrompt.deviceId) {
                      await apiClient.sendDeviceEvent({
                        eventId: `sim-yes-${Date.now()}`,
                        deviceId: activePrompt.deviceId,
                        gestureId: "EMG_R_2",
                        configVersion: 1,
                      });
                    }
                  }}
                  className="px-2 py-1 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                >
                  Simulate Right ×2
                </button>
                <button
                  onClick={async () => {
                    if (activePrompt.deviceId) {
                      await apiClient.sendDeviceEvent({
                        eventId: `sim-no-${Date.now()}`,
                        deviceId: activePrompt.deviceId,
                        gestureId: "EMG_L_1",
                        configVersion: 1,
                      });
                    }
                  }}
                  className="px-2 py-1 rounded bg-rose-600 text-white font-medium hover:bg-rose-700"
                >
                  Simulate Left ×1
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Idle Card */
          <div className="bg-white dark:bg-[#16171B] border border-[#EBE5DC] dark:border-[#26282E] rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF6F0] dark:bg-[#1F2127] flex items-center justify-center text-[#7A7265] dark:text-[#9E9689]">
              <Radio className="w-6 h-6 text-[#8C4327]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#2C2825] dark:text-[#E8E6E3]">
                Bedside Audio Standby
              </h3>
              <p className="text-xs text-[#7A7265] dark:text-[#9E9689] mt-1 max-w-xs mx-auto">
                No active confirmation prompts at this moment. When a patient makes a gesture, the speaker will ask to confirm before dispatching to the nurse station.
              </p>
            </div>

            {/* Outgoing Dispatch Feedback Banner */}
            {dispatchResult && (
              <div
                className={`mt-2 w-full p-3 rounded-xl border text-left text-xs ${
                  dispatchResult.type === "DISPATCHED"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                    : "bg-stone-500/10 border-stone-500/30 text-stone-800 dark:text-stone-300"
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>
                    {dispatchResult.type === "DISPATCHED"
                      ? "✓ Your Request Has Been Sent to the Nurse Station"
                      : "✕ Request Cancelled by Patient"}
                  </span>
                  <span className="font-mono text-[10px]">{dispatchResult.timestamp}</span>
                </div>
                <p className="mt-1 italic">&ldquo;{dispatchResult.speechPrompt}&rdquo;</p>
              </div>
            )}

            {/* Resolution Feedback Banner */}
            {resolutionResult && (
              <div
                className={`mt-2 w-full p-3 rounded-xl border text-left text-xs ${
                  resolutionResult.resolved
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>{resolutionResult.resolved ? "✓ Call Verified & Resolved" : "⚠ Assistance Not Confirmed"}</span>
                  <span className="font-mono text-[10px]">{resolutionResult.timestamp}</span>
                </div>
                <p className="mt-1 italic">&ldquo;{resolutionResult.speechPrompt}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* Audio Output Settings Accordion */}
        <div className="bg-white dark:bg-[#16171B] border border-[#EBE5DC] dark:border-[#26282E] rounded-xl p-3 shadow-xs">
          <div className="text-xs font-semibold text-[#7A7265] dark:text-[#9E9689] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#8C4327]" />
            Speech Parameters
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
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
                className="w-full accent-[#8C4327]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
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
                className="w-full accent-[#8C4327]"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="border-t border-[#EBE5DC] dark:border-[#222326] px-4 py-3 bg-[#FAF6F0] dark:bg-[#121316] text-[11px] text-center text-[#7A7265] dark:text-[#9E9B95]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span>NetraVaani Bedside Audio Node</span>
          {lastSpokenAt && <span>Last announcement: {lastSpokenAt}</span>}
        </div>
      </footer>
    </div>
  );
}

export default function BedsideAudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#0C0D0E] flex items-center justify-center text-xs text-[#7A7265]">
          Initializing Bedside Speaker...
        </div>
      }
    >
      <BedsideAudioContent />
    </Suspense>
  );
}
