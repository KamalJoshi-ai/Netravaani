"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiClient, PatientItem, PredefinedCommandItem } from "@/lib/api";
import dynamic from "next/dynamic";
import {
  AnimatePresence,
  motion,
  EASE_OUT,
  Reveal,
  TiltCard,
  Toast,
  staggerParent,
  staggerChild,
} from "@/components/ui/motion";
import AmbientBackdrop from "@/components/ui/AmbientBackdrop";
import BrandMark from "@/components/ui/BrandMark";
import { SessionLoader, SiteFooter } from "@/components/ui/Chrome";

const IrisScene = dynamic(() => import("@/components/ui/IrisScene"), { ssr: false });

export default function PatientPortalPage() {
  const [patient, setPatient] = useState<PatientItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Login credentials
  const [patientCode, setPatientCode] = useState("PT-101001");
  const [password, setPassword] = useState("patient123");
  const [availablePatients, setAvailablePatients] = useState<PatientItem[]>([]);

  // Commands & Live triggers
  const [commands, setCommands] = useState<PredefinedCommandItem[]>([]);
  const [triggeringAction, setTriggeringAction] = useState<string | null>(null);
  const [lastDispatched, setLastDispatched] = useState<string | null>(null);

  // Notifications
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  const showNotice = (text: string, isError = false) => {
    setNotice({ text, isError });
    setTimeout(() => setNotice(null), 4500);
  };

  const loadPatientsList = useCallback(async () => {
    try {
      const res = await apiClient.getPatients({ limit: 50 });
      setAvailablePatients(res.data);
      if (res.data.length > 0 && !patientCode) {
        setPatientCode(res.data[0].patientCode);
      }
    } catch {
      // ignore
    }
  }, [patientCode]);

  const loadCommands = useCallback(async () => {
    try {
      const res = await apiClient.getPredefinedCommands();
      setCommands(res.data);
    } catch {
      // fallback
    }
  }, []);

  const loadPatientData = useCallback(async (code: string) => {
    try {
      setLoading(true);
      const res = await apiClient.getPatient(code);
      setPatient(res.data);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to load patient records", true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check existing session or load initial patient
  useEffect(() => {
    loadPatientsList();
    loadCommands();

    const storedCode = typeof window !== "undefined" ? localStorage.getItem("nv_patient_code") : null;
    if (storedCode) {
      setPatientCode(storedCode);
      loadPatientData(storedCode).finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
  }, [loadPatientsList, loadCommands, loadPatientData]);

  // Periodic poll of patient status (e.g. nurse assignment requests)
  useEffect(() => {
    if (!patient?.patientCode) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiClient.getPatient(patient.patientCode);
        setPatient(res.data);
      } catch {
        // silent fail
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [patient?.patientCode]);

  const handlePatientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.patientLogin(patientCode, password);
      setPatient(res.data.patient);
      if (typeof window !== "undefined") {
        localStorage.setItem("nv_patient_code", res.data.patient.patientCode);
      }
      showNotice(`Authenticated as ${res.data.patient.displayName}`);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Invalid Patient Code or PIN", true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("nv_patient_code");
    }
    setPatient(null);
  };

  const handleApproveNurse = async () => {
    if (!patient) return;
    try {
      setLoading(true);
      const res = await apiClient.approveNurseAssignment(patient.patientCode);
      setPatient(res.data);
      showNotice("Nurse care assignment approved successfully!");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Approval failed", true);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectNurse = async () => {
    if (!patient) return;
    try {
      setLoading(true);
      const res = await apiClient.rejectNurseAssignment(patient.patientCode);
      setPatient(res.data);
      showNotice("Nurse care request declined.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCommand = async (action: string, serialCmd: string) => {
    if (!patient) return;
    setTriggeringAction(action);
    try {
      await apiClient.triggerPatientCommand(patient.patientCode, action);
      setLastDispatched(serialCmd);
      showNotice(`Command '${action}' (${serialCmd}) sent to Nurse Station!`);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to trigger command", true);
    } finally {
      setTriggeringAction(null);
    }
  };

  if (authLoading) {
    return <SessionLoader label="Loading Bedside Portal..." />;
  }

  // ========================================================
  // PATIENT LOGIN VIEW
  // ========================================================
  if (!patient) {
    return (
      <div className="relative min-h-screen text-[#30251F] flex flex-col justify-center py-14 px-4 sm:px-6 selection:bg-[#EED9CD] overflow-hidden">
        <AmbientBackdrop />

        <div className="relative z-10 mx-auto w-full max-w-md text-center">
          <div className="mx-auto h-[200px] w-[280px] mb-2">
            <IrisScene tone="light" className="h-full w-full" />
          </div>
          <Reveal>
            <span className="nv-eyebrow">Bedside Terminal &bull; Patient Care Portal</span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="nv-engraved mt-2 font-semibold text-5xl tracking-tight text-[#1C140F]">NetraVaani</h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-1 text-base text-[#75665D]">
              Patient Self-Service &amp; Nurse Assignment Approval
            </p>
          </Reveal>
        </div>

        <div className="relative z-10 mt-8 mx-auto w-full max-w-md [perspective:1400px]">
          <motion.div
            initial={{ opacity: 0, rotateX: 18, y: 30 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }}
            className="nv-card rounded-3xl p-6 sm:p-8 space-y-6"
            style={{ boxShadow: "var(--shadow-3)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold tracking-tight text-2xl text-[#1C140F]">Bedside Patient Sign In</h2>
              <span className="nv-chip text-[10px] font-medium uppercase tracking-wider text-[#C56845] bg-[#EED9CD]/60 px-2.5 py-1 rounded-full border border-[#D6C7B7]">
                Patient Mode
              </span>
            </div>

            <AnimatePresence>
              {notice && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`p-3.5 rounded-xl text-xs font-medium leading-relaxed border ${
 notice.isError
 ? "bg-[#F9ECE7] border-[#C56845] text-[#8C3A1E]"
 : "bg-[#EED9CD]/70 border-[#D6C7B7] text-[#1C140F]"
 }`}
                >
                  {notice.text}
                </motion.div>
              )}
            </AnimatePresence>

            {availablePatients.length > 0 && (
              <div className="nv-well space-y-2 p-3 rounded-2xl">
                <label className="nv-eyebrow block">Quick Select Active Patient</label>
                <div className="flex flex-wrap gap-1.5">
                  {availablePatients.slice(0, 3).map((p) => (
                    <motion.button
                      key={p.patientCode}
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setPatientCode(p.patientCode);
                        setPassword("patient123");
                      }}
                      className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${
 patientCode === p.patientCode ? "nv-btn-dark" : "nv-btn-ghost text-[#30251F]"
 }`}
                    >
                      {p.displayName} <span className="font-mono opacity-70">({p.patientCode})</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handlePatientLogin} className="space-y-4">
              <div>
                <label className="nv-eyebrow block">Patient Identification Code</label>
                <input
                  type="text"
                  required
                  value={patientCode}
                  onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PT-101001"
                  className="nv-input mt-1.5 appearance-none block w-full px-3.5 py-3 rounded-xl text-[#1C140F] font-mono text-lg tracking-wider placeholder-[#A2948B]"
                />
              </div>

              <div>
                <label className="nv-eyebrow block">Patient PIN / Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="nv-input mt-1.5 appearance-none block w-full px-3.5 py-3 rounded-xl text-[#1C140F] text-lg placeholder-[#A2948B]"
                />
                <p className="mt-1.5 text-xs text-[#75665D]">
                  Default key: <code className="bg-[#EED9CD]/60 px-1.5 py-0.5 rounded text-[#1C140F]">patient123</code> or patient code
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="nv-btn-primary w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-xs uppercase tracking-[0.14em] font-semibold disabled:opacity-50"
              >
                {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {loading ? "Authenticating Patient..." : "Access Bedside Portal"}
              </button>
            </form>

            <div className="nv-divider" />
            <div className="flex items-center justify-between text-xs font-medium text-[#75665D]">
              <Link href="/nurse" className="text-[#C56845] hover:underline">
                &larr; Nurse Station
              </Link>
              <Link href="/" className="hover:underline">
                Platform Registry
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ========================================================
  // AUTHENTICATED PATIENT BEDSIDE TERMINAL
  // ========================================================
  const activeAssignment = patient.currentAssignment;
  const nurseReq = patient.nurseAssignment;

  return (
    <div className="relative min-h-screen text-[#30251F] flex flex-col font-sans selection:bg-[#EED9CD]">
      <AmbientBackdrop />

      <header className="nv-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[76px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandMark size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-semibold text-xl sm:text-2xl tracking-tight text-[#1C140F] truncate">
                  {patient.displayName}
                </span>
                <span className="nv-chip text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  {patient.patientCode}
                </span>
              </div>
              <span className="text-xs text-[#75665D]">
                Bedside Terminal &bull; Bed: {patient.bedLabel || "ICU-General"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/nurse"
              className="nv-btn-ghost hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#30251F]"
            >
              &larr; Nurse Station
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="nv-btn-ghost text-xs font-medium text-[#75665D] hover:text-[#C56845] px-3 py-1.5 rounded-xl"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <Toast message={notice?.text ?? null} isError={notice?.isError} onClose={() => setNotice(null)} />

      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        {/* ======================================================== */}
        {/* 1. PREDEFINED COMMANDS — bedside keycaps (primary task)  */}
        {/* ======================================================== */}
        <Reveal>
          <section className="nv-espresso relative overflow-hidden rounded-3xl p-5 sm:p-7 space-y-5">
            <div className="pointer-events-none absolute -right-16 -top-20 h-[300px] w-[380px] opacity-70 hidden md:block">
              <IrisScene tone="dark" className="h-full w-full" interactive={false} />
            </div>
            <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <span className="font-medium text-[10px] uppercase tracking-[0.08em] text-[#EED9CD]/70">
                  Bedside Gesture &amp; Physical Triggers Matrix
                </span>
                <h2 className="mt-1 font-semibold text-3xl tracking-tight text-[#FFFCF7]">
                  Send a request
                </h2>
                <p className="text-sm text-[#EED9CD]/70">
                  Predefined clinical trigger commands active in the bedside firmware
                </p>
              </div>
              <AnimatePresence>
                {lastDispatched && (
                  <motion.span
                    key={lastDispatched}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="self-start sm:self-auto text-xs font-mono px-3 py-1.5 rounded-xl bg-[#FFFCF7]/10 text-[#EED9CD] border border-[#FFFCF7]/15 flex items-center gap-2"
                  >
                    <span className="nv-live-dot !w-1.5 !h-1.5" />
                    Last Transmitted: <strong className="text-[#FFFCF7]">{lastDispatched}</strong>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              variants={staggerParent}
              initial="hidden"
              animate="show"
              className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 [perspective:1200px]"
            >
              {commands.map((cmd) => (
                <motion.div key={cmd.action} variants={staggerChild}>
                  <CommandKey
                    cmd={cmd}
                    busy={triggeringAction === cmd.action}
                    onTrigger={() => handleTriggerCommand(cmd.action, cmd.serialCommand)}
                  />
                </motion.div>
              ))}
              {commands.length === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-2xl bg-[#FFFCF7]/5 border border-[#FFFCF7]/10 animate-pulse" />
                ))}
            </motion.div>
          </section>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ======================================================== */}
          {/* 2. NURSE ASSIGNMENT APPROVAL CALLOUT */}
          {/* ======================================================== */}
          <Reveal delay={0.08}>
            <section className="nv-card h-full rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="nv-eyebrow">Consent</span>
                  <h2 className="text-xl font-semibold tracking-tight text-[#1C140F]">Nurse Care Assignment Status</h2>
                  <p className="text-xs text-[#75665D]">
                    Bedside nurse allocation requires patient consent &amp; approval
                  </p>
                </div>
                {nurseReq?.status === "APPROVED" ? (
                  <span className="nv-chip shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium uppercase bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                    Approved by Patient
                  </span>
                ) : nurseReq?.status === "PENDING" ? (
                  <span className="nv-chip shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium uppercase bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]">
                    <span className="nv-live-dot !w-1.5 !h-1.5" />
                    Awaiting Approval
                  </span>
                ) : (
                  <span className="nv-chip shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium uppercase bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
                    No Active Request
                  </span>
                )}
              </div>
              <div className="nv-divider" />

              <AnimatePresence mode="wait">
                {nurseReq?.status === "PENDING" && (
                  <motion.div
                    key="pending"
                    initial={{ opacity: 0, rotateX: -20, y: 10 }}
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{ transformPerspective: 800 }}
                    className="relative p-4 rounded-2xl bg-[#F9ECE7] border border-[#C56845] space-y-3 overflow-hidden"
                  >
                    <motion.div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      animate={{ boxShadow: ["inset 0 0 0 0 rgba(197,104,69,.35)", "inset 0 0 0 6px rgba(197,104,69,0)"] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight text-[#8C3A1E]">Nurse Care Request Pending: {nurseReq.nurseName}</h3>
                      <p className="text-sm text-[#30251F] mt-1">
                        Attending nurse <strong>{nurseReq.nurseName}</strong> has requested to be allocated as your primary bedside caregiver for {patient.bedLabel || "your bed"}.
                      </p>
                      <span className="text-[11px] font-mono text-[#75665D] block mt-1">
                        Requested on: {nurseReq.requestedAt ? new Date(nurseReq.requestedAt).toLocaleTimeString() : "Just now"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApproveNurse}
                        disabled={loading}
                        className="nv-btn-primary inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-semibold disabled:opacity-50"
                      >
                        Approve Nurse Request
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectNurse}
                        disabled={loading}
                        className="nv-btn-ghost inline-flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs uppercase tracking-wider font-medium text-[#75665D] hover:text-[#30251F]"
                      >
                        Decline
                      </button>
                    </div>
                  </motion.div>
                )}

                {nurseReq?.status === "APPROVED" && (
                  <motion.div
                    key="approved"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="nv-well p-4 rounded-2xl flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm text-[#1C140F]">
                        Assigned Caregiver: <strong className="font-medium text-base">{nurseReq.nurseName}</strong>
                      </p>
                      <p className="text-xs text-[#75665D] font-mono mt-0.5">
                        Approval Confirmed on: {nurseReq.approvedAt ? new Date(nurseReq.approvedAt).toLocaleTimeString() : "Session Active"}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#7A361E] flex items-center gap-1.5 shrink-0">
                      <span className="nv-live-dot !w-1.5 !h-1.5" /> Active Bedside Care
                    </span>
                  </motion.div>
                )}

                {nurseReq?.status === "NONE" && (
                  <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="nv-well p-4 rounded-2xl text-sm text-[#75665D]">
                    No nurse assignment request currently pending. When a nurse requests allocation, your confirmation modal will appear here immediately.
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </Reveal>

          {/* ======================================================== */}
          {/* 3. ALLOCATED DEVICE STATUS */}
          {/* ======================================================== */}
          <Reveal delay={0.14}>
            <section className="nv-card h-full rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="nv-eyebrow">Hardware</span>
                  <h2 className="text-xl font-semibold tracking-tight text-[#1C140F]">Allocated Bedside Hardware</h2>
                  <p className="text-xs text-[#75665D]">Strict 1-to-1 Device Allocation Invariant</p>
                </div>
                {activeAssignment ? (
                  <span className="nv-chip shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium uppercase bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                    Single Device Allocated
                  </span>
                ) : (
                  <span className="nv-chip shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium uppercase bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
                    No Device Assigned
                  </span>
                )}
              </div>
              <div className="nv-divider" />

              {activeAssignment ? (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Stat label="Allocated Device">
                    <span className="text-base font-medium text-[#1C140F] block">{activeAssignment.device.name}</span>
                    <span className="text-[11px] font-mono text-[#75665D]">{activeAssignment.device.deviceId}</span>
                  </Stat>
                  <Stat label="Connectivity">
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#7A361E]">
                      <span className="nv-live-dot !w-1.5 !h-1.5" />
                      {activeAssignment.device.connectivityStatus || "ONLINE"}
                    </span>
                  </Stat>
                  <Stat label="MAC / Hardware ID">
                    <span className="text-xs font-mono text-[#1C140F] block truncate">
                      {activeAssignment.device.hardwareId || "ESP32-S3-WIFI"}
                    </span>
                  </Stat>
                  <Stat label="Firmware Version">
                    <span className="text-xs font-mono text-[#1C140F] block">
                      {activeAssignment.device.firmwareVersion || "v1.2.0-esp32"}
                    </span>
                  </Stat>
                </div>
              ) : (
                <div className="nv-well p-4 rounded-2xl text-sm text-[#75665D]">
                  No bedside device currently allocated to this bed. Nurses can allocate a single NPG Lite / ESP32 device from the Registry view.
                </div>
              )}
            </section>
          </Reveal>
        </div>
      </main>

      <SiteFooter
        left="NetraVaani · Bedside Assistive Clinical Protocol"
        right={`Patient Code: ${patient.patientCode} · Bed: ${patient.bedLabel || "General"}`}
      />
    </div>
  );
}

/* ====================================================================== */
/* Presentational helpers (UI only)                                        */
/* ====================================================================== */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="nv-well p-3 rounded-xl">
      <span className="nv-eyebrow !text-[9px] block mb-1">{label}</span>
      {children}
    </div>
  );
}

/**
 * Large physical "keycap" for a bedside command. It sits on a visible base,
 * tilts with the cursor and sinks when pressed, so it reads as a real button.
 */
function CommandKey({
  cmd,
  busy,
  onTrigger,
}: {
  cmd: PredefinedCommandItem;
  busy: boolean;
  onTrigger: () => void;
}) {
  const emerg = Boolean(cmd.isEmergency);
  return (
    <TiltCard intensity={7} glare className="rounded-2xl">
      <motion.button
        type="button"
        onClick={onTrigger}
        disabled={busy}
        whileTap={{ y: 5 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className="group relative block w-full text-left rounded-2xl disabled:opacity-70"
        style={{
          background: emerg
            ? "linear-gradient(180deg, #D97A52 0%, #C56845 55%, #B05534 100%)"
            : "linear-gradient(180deg, #FFFDF9 0%, #F6F0E8 100%)",
          border: emerg ? "1px solid #A84A29" : "1px solid #E7DFD4",
          boxShadow: emerg
            ? "0 1px 0 rgba(255,236,222,.45) inset, 0 6px 0 #8C3A1E, 0 18px 30px -12px rgba(197,104,69,.8)"
            : "0 1px 0 #fff inset, 0 6px 0 #CBB9A6, 0 18px 30px -14px rgba(0,0,0,.6)",
        }}
      >
        <div className="p-4 space-y-3" style={{ transform: "translateZ(20px)" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border ${
 emerg ? "bg-[#FFFCF7]/15 text-[#FFFCF7] border-[#FFFCF7]/30" : cmd.badgeColor || "bg-[#F5F0E8] text-[#30251F] border-[#E7DFD4]"
 }`}
            >
              {cmd.dashboardLabel}
            </span>
            <code
              className={`whitespace-nowrap px-2 py-0.5 rounded-md font-mono text-[10px] ${
 emerg ? "bg-[#1C140F]/20 text-[#FFFCF7]" : "bg-[#F2ECE3] text-[#75665D] border border-[#E7DFD4]"
 }`}
            >
              {cmd.serialCommand}
            </code>
          </div>

          <div>
            <p className={`font-semibold tracking-tight text-lg leading-snug ${emerg ? "text-[#FFFCF7]" : "text-[#1C140F]"}`}>
              {cmd.gestureName}
            </p>
            <p className={`text-xs mt-0.5 ${emerg ? "text-[#FFFCF7]/80" : "text-[#75665D]"}`}>
              {cmd.instruction}
            </p>
          </div>

          <div
            className={`flex items-center justify-between pt-2 border-t text-[11px] font-medium uppercase tracking-[0.08em] ${
 emerg ? "border-[#FFFCF7]/20 text-[#FFFCF7]" : "border-[#E7DFD4] text-[#C56845]"
 }`}
          >
            <span>{busy ? "Triggering..." : `Trigger ${cmd.action}`}</span>
            {busy ? (
              <span className={`h-3.5 w-3.5 rounded-full border-2 animate-spin ${emerg ? "border-white/40 border-t-white" : "border-[#C56845]/30 border-t-[#C56845]"}`} />
            ) : (
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            )}
          </div>
        </div>
      </motion.button>
    </TiltCard>
  );
}
