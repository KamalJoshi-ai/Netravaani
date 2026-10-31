"use client";

/**
 * Voice announcements for the nurse station, using the browser's built-in
 * speech engine (Web Speech API). No network calls and no extra packages.
 *
 * Sentence: "Patient on bed <bed> <phrase>", where <phrase> is the command's
 * speech template with {command} replaced, e.g. "wants water".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CareRequestItem } from "./api";

/* Keep in sync with backend/src/shared/speechDefaults.ts */
export const DEFAULT_SPEECH_TEMPLATES: Record<string, string> = {
  yes: "is saying {command}",
  no: "is saying {command}",
  water: "wants {command}",
  call_nurse: "is calling for the nurse",
  adjustment: "wants an {command}",
  emergency: "is in {command}",
};
export const GENERIC_SPEECH_TEMPLATE = "is saying {command}";

/** Quick choices in the editor; "{command}" is filled in when spoken. */
export const SPEECH_PRESETS = ["is saying {command}", "wants {command}", "is in {command}", "needs {command}", "is asking for {command}"];

/** Older requests without a rule (fixed firmware actions) */
const LEGACY_ACTION_TEMPLATES: Record<string, string> = {
  YES: "is saying yes",
  NO: "is saying no",
  WATER: "wants water",
  NEED_WATER: "wants water",
  CALL_NURSE: "is calling for the nurse",
  NEED_ASSISTANCE: "needs assistance",
  EMERGENCY: "is in an emergency",
  PAIN: "is in pain",
  PAIN_DISCOMFORT: "is in pain or discomfort",
  REPOSITION: "wants to be repositioned",
};

export function speechTemplateFor(ruleId: string | undefined, custom?: string | null): string {
  const own = custom?.trim();
  if (own) return own;
  return (ruleId && DEFAULT_SPEECH_TEMPLATES[ruleId]) || GENERIC_SPEECH_TEMPLATE;
}

/** Makes a command name pleasant to hear: "EMERGENCY / SEVERE PAIN" -> "emergency or severe pain". */
export function spokenCommand(name: string): string {
  // All-caps names are often spelled out letter by letter ("NO" -> "N O"), so lower-case them
  const allCaps = /[A-Z]/.test(name) && name === name.toUpperCase();
  const text = (allCaps ? name.toLowerCase() : name)
    .replace(/\s*\/\s*/g, " or ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

/** "Patient on bed ICU-04 wants water." */
export function buildSentence(bed: string | undefined, template: string, command: string): string {
  const phrase = template.includes("{command}") ? template.replace(/\{command\}/g, spokenCommand(command)) : template;
  const place = bed?.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  // "ICU-Bed-04" already says "bed": "Patient on ICU Bed 04", not "on bed ICU Bed 04"
  const who = !place ? "Patient" : /\bbed\b/i.test(place) ? `Patient on ${place}` : `Patient on bed ${place}`;
  return `${who} ${phrase.trim()}.`;
}

export function announcementFor(req: CareRequestItem): string {
  const bed = req.patient?.bedLabel;
  let sentence: string;
  if (req.ruleId) {
    const name = req.displayLabel || req.label || req.ruleId;
    sentence = buildSentence(bed, speechTemplateFor(req.ruleId, req.speechTemplate), name);
  } else {
    const t = LEGACY_ACTION_TEMPLATES[req.action] || `is requesting ${spokenCommand(req.action)}`;
    sentence = buildSentence(bed, t, "");
  }
  if (req.alarm) return `Emergency alert. ${sentence}`;
  if (req.urgent) return `Urgent. ${sentence}`;
  return sentence;
}

/* ---------------- speaking ---------------- */

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Global reference to prevent premature garbage collection in Chrome/Edge,
 * which causes speech synthesis to silently stop or produce no sound.
 */
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function isSpeaking(): boolean {
  return activeUtterance !== null || (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking);
}

/**
 * Pinned single female voice for all voice commands and announcements.
 * Selected once from the browser's available voices and strictly locked.
 */
let lockedFemaleVoice: SpeechSynthesisVoice | null = null;

export function getSingleFemaleVoice(voicesList?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const voices = voicesList && voicesList.length > 0 ? voicesList : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return undefined;

  if (lockedFemaleVoice && voices.some((v) => v.name === lockedFemaleVoice?.name)) {
    return lockedFemaleVoice;
  }

  // Priority order for the single chosen female voice:
  // 1. Natural Indian Female Voice: Neerja (English India)
  const neerja = voices.find((v) => v.name.toLowerCase().includes("neerja"));
  if (neerja) {
    lockedFemaleVoice = neerja;
    return neerja;
  }

  // 2. Swara (Natural Indian/Hindi)
  const swara = voices.find((v) => v.name.toLowerCase().includes("swara"));
  if (swara) {
    lockedFemaleVoice = swara;
    return swara;
  }

  // 3. Indian English / Hindi female voices (Heera, Kavya, Aditi, Lekha, Kalpana, Google हिन्दी)
  const indianFemale = voices.find((v) => {
    const name = v.name.toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    const isIndian = lang.includes("in") || lang.startsWith("hi");
    const isFemale =
      name.includes("heera") ||
      name.includes("kavya") ||
      name.includes("aditi") ||
      name.includes("lekha") ||
      name.includes("kalpana") ||
      name.includes("priya") ||
      name.includes("female");
    const isMale = name.includes("male") || name.includes("madhur") || name.includes("hemant") || name.includes("ravi");
    return isIndian && isFemale && !isMale;
  });
  if (indianFemale) {
    lockedFemaleVoice = indianFemale;
    return indianFemale;
  }

  // 4. Any en-IN female / natural voice
  const enInFemale = voices.find((v) => {
    const lang = (v.lang || "").toLowerCase();
    const name = v.name.toLowerCase();
    return (lang.startsWith("en-in") || lang.includes("in")) && !name.includes("male") && !name.includes("ravi");
  });
  if (enInFemale) {
    lockedFemaleVoice = enInFemale;
    return enInFemale;
  }

  // 5. Standard Windows / Edge / Chrome / Mac female voice (Microsoft Zira, Aria, Jenny, Samantha, Victoria)
  const standardFemale = voices.find((v) => {
    const name = v.name.toLowerCase();
    return (
      name.includes("zira") ||
      name.includes("aria") ||
      name.includes("jenny") ||
      name.includes("samantha") ||
      name.includes("victoria") ||
      name.includes("female")
    );
  });
  if (standardFemale) {
    lockedFemaleVoice = standardFemale;
    return standardFemale;
  }

  // 6. Any non-male voice
  const anyFemale = voices.find((v) => {
    const name = v.name.toLowerCase();
    return !name.includes("male") && !name.includes("david") && !name.includes("mark") && !name.includes("george");
  });
  if (anyFemale) {
    lockedFemaleVoice = anyFemale;
    return anyFemale;
  }

  // 7. Fallback
  lockedFemaleVoice = voices[0];
  return lockedFemaleVoice;
}

export function pickVoice(_text?: string, voicesList?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return getSingleFemaleVoice(voicesList);
}

export function speak(
  text: string,
  opts: {
    rate?: number;
    pitch?: number;
    volume?: number;
    interrupt?: boolean;
    onEnd?: () => void;
  } = {}
): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;

  // If previous speech is active and interrupt is requested, cancel and unpause
  if (opts.interrupt) {
    synth.cancel();
  }

  // Chrome bug fix: resume if queue is stalled or paused
  if (synth.paused) {
    synth.resume();
  }

  const u = new SpeechSynthesisUtterance(text);
  activeUtterance = u; // Keep reference to prevent GC bug in Chromium

  const isDevanagari = /[ऀ-ॿ]/.test(text);
  const voice = pickVoice(text);

  if (voice) {
    u.voice = voice;
    // CRITICAL: Set language to match the text so browser speech engine doesn't reject it
    if (isDevanagari) {
      u.lang = "hi-IN";
    } else if (voice.lang && voice.lang.toLowerCase().startsWith("en")) {
      u.lang = voice.lang;
    } else {
      u.lang = "en-IN";
    }
  } else {
    u.lang = isDevanagari ? "hi-IN" : "en-IN";
  }

  u.volume = opts.volume ?? 1.0;
  // Seductive, warm Indian female delivery: gentle cadence (0.92x) and melodic feminine pitch (1.10x)
  u.rate = opts.rate ?? 0.92;
  u.pitch = opts.pitch ?? 1.10;

  u.onend = () => {
    activeUtterance = null;
    if (opts.onEnd) opts.onEnd();
  };

  u.onerror = (err) => {
    console.warn("SpeechSynthesis error with selected voice, falling back to default voice:", err);
    activeUtterance = null;
    // Bulletproof fallback: retry without voice restrictions so audio is never silent
    if (u.voice) {
      try {
        const fallback = new SpeechSynthesisUtterance(text);
        fallback.volume = 1.0;
        fallback.rate = 0.95;
        fallback.pitch = 1.0;
        if (opts.onEnd) fallback.onend = opts.onEnd;
        activeUtterance = fallback;
        synth.speak(fallback);
      } catch (e) {
        console.error("SpeechSynthesis fallback failed:", e);
      }
    }
  };

  synth.speak(u);

  // Chrome sometimes pauses immediately upon speaking
  if (synth.paused) {
    synth.resume();
  }
}

/* ---------------- nurse-station hook ---------------- */

const STORAGE_KEY = "nv_voice_alerts";
const ALARM_REPEAT_MS = 30_000;

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Announces new care requests once, alarms first. Open alarms are repeated
 * every 30 seconds until someone acknowledges them. Requests already present
 * when the page loads are not read out.
 *
 * Browsers only allow speech after the user has clicked or pressed a key on
 * the page, so `needsClick` is true until that happens.
 */
export function useVoiceAlerts(requests: CareRequestItem[]) {
  const [enabled, setEnabledState] = useState(false);
  const [activated, setActivated] = useState(false);
  const [supported, setSupported] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const lastAlarmSpoken = useRef(new Map<string, number>());

  useEffect(() => {
    setSupported(speechSupported());
    setEnabledState(readSetting());
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    if (nav.userActivation?.hasBeenActive) setActivated(true);
    const mark = () => setActivated(true);
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    // Voices load asynchronously in Chrome
    const onVoicesChanged = () => {
      if (speechSupported()) window.speechSynthesis.getVoices();
    };
    if (speechSupported()) {
      const synth = window.speechSynthesis;
      synth.getVoices();
      if (typeof synth.addEventListener === "function") {
        synth.addEventListener("voiceschanged", onVoicesChanged);
      } else {
        synth.onvoiceschanged = onVoicesChanged;
      }
    }
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      if (speechSupported()) {
        const synth = window.speechSynthesis;
        if (typeof synth.removeEventListener === "function") {
          synth.removeEventListener("voiceschanged", onVoicesChanged);
        } else if (synth.onvoiceschanged === onVoicesChanged) {
          synth.onvoiceschanged = null;
        }
      }
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setActivated(true); // the toggle click itself counts as permission
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      /* private mode: setting lasts for this session only */
    }
    if (on) speak("Voice alerts are on. Station ready.", { interrupt: true });
    else if (speechSupported()) window.speechSynthesis.cancel();
  }, []);

  // Announce requests that are new since the last poll
  useEffect(() => {
    const ids = new Set(requests.map((r) => r._id));
    if (seen.current === null) {
      seen.current = ids; // first load: do not read out the backlog
      return;
    }
    const fresh = requests.filter((r) => !seen.current!.has(r._id) && r.status === "NEW");
    seen.current = ids;
    if (!enabled || !activated || fresh.length === 0) return;
    const ordered = [...fresh].sort((a, b) => Number(Boolean(b.alarm)) - Number(Boolean(a.alarm)));
    const now = Date.now();
    for (const r of ordered) {
      speak(announcementFor(r));
      if (r.alarm) lastAlarmSpoken.current.set(r._id, now);
    }
  }, [requests, enabled, activated]);

  // Repeat open alarms until they are acknowledged
  useEffect(() => {
    if (!enabled || !activated) return;
    const t = setInterval(() => {
      const now = Date.now();
      for (const r of requests) {
        if (!r.alarm || r.status !== "NEW") continue;
        const last = lastAlarmSpoken.current.get(r._id) ?? 0;
        if (now - last >= ALARM_REPEAT_MS) {
          speak(announcementFor(r));
          lastAlarmSpoken.current.set(r._id, now);
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [requests, enabled, activated]);

  return {
    supported,
    enabled,
    setEnabled,
    needsClick: enabled && !activated,
    testVoice: () => {
      setActivated(true);
      speak("Voice alert test. Nurse station speaker verified.", { interrupt: true });
    },
    announce: (r: CareRequestItem) => speak(announcementFor(r), { interrupt: true }),
  };
}
