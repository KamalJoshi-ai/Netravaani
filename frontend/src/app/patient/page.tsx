"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiClient, PatientItem, PredefinedCommandItem } from "@/lib/api";
import {
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Bed,
  Radio,
  ArrowLeft,
  Bell,
} from "@/lib/noIcons";

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
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center font-serif text-lg font-bold text-[#30251F]">
        Loading Bedside Portal...
      </div>
    );
  }

  // ========================================================
  // PATIENT LOGIN VIEW
  // ========================================================
  if (!patient) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] text-[#30251F] flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8 selection:bg-[#EED9CD]">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
          <div className="inline-flex items-center gap-2 border-b-2 border-[#E7DFD4] pb-1 mb-2">
            <span className="text-[11px] uppercase font-mono tracking-widest font-extrabold text-[#75665D]">
              Bedside Terminal &bull; Patient Care Portal
            </span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-extrabold text-[#1C140F] tracking-tight">
            NetraVaani
          </h1>
          <p className="font-serif italic text-base font-bold text-[#75665D]">
            Patient Self-Service &amp; Nurse Assignment Approval
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-[#FFFCF7] py-8 px-6 sm:px-10 rounded-2xl border-2 border-[#E7DFD4] shadow-md space-y-6">
            <div className="border-b-2 border-[#E7DFD4] pb-3 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-[#1C140F]">Bedside Patient Sign In</h2>
              <span className="text-xs font-mono font-extrabold text-[#C56845] bg-[#EED9CD]/60 px-2.5 py-1 rounded-full border border-[#D6C7B7]">
                Patient Mode
              </span>
            </div>

            {notice && (
              <div
                className={`p-3.5 rounded-xl text-xs font-bold leading-relaxed border-2 ${
                  notice.isError
                    ? "bg-[#F9ECE7] border-[#C56845] text-[#8C3A1E]"
                    : "bg-[#EED9CD]/70 border-[#D6C7B7] text-[#1C140F]"
                }`}
              >
                {notice.text}
              </div>
            )}

            {/* Quick Demo Selector */}
            {availablePatients.length > 0 && (
              <div className="space-y-1.5 bg-[#F5F0E8] p-3 rounded-xl border border-[#E7DFD4]">
                <label className="text-[10px] uppercase font-mono tracking-widest font-extrabold text-[#75665D] block">
                  Quick Select Active Patient:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availablePatients.slice(0, 3).map((p) => (
                    <button
                      key={p.patientCode}
                      type="button"
                      onClick={() => {
                        setPatientCode(p.patientCode);
                        setPassword("patient123");
                      }}
                      className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                        patientCode === p.patientCode
                          ? "bg-[#30251F] text-[#FFFCF7] border-[#30251F]"
                          : "bg-[#FFFCF7] text-[#30251F] border-[#E7DFD4] hover:bg-[#EED9CD]"
                      }`}
                    >
                      {p.displayName} ({p.patientCode})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handlePatientLogin} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider font-extrabold text-[#30251F]">
                  Patient Identification Code
                </label>
                <div className="mt-1.5">
                  <input
                    type="text"
                    required
                    value={patientCode}
                    onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PT-101001"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#F5F0E8] border-2 border-[#E7DFD4] rounded-xl text-[#1C140F] font-mono text-base font-bold placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-extrabold text-[#30251F]">
                  Patient PIN / Password
                </label>
                <div className="mt-1.5">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#F5F0E8] border-2 border-[#E7DFD4] rounded-xl text-[#1C140F] text-base font-bold placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] transition"
                  />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-[#75665D]">
                  Default key: <code className="bg-[#EED9CD]/60 font-bold px-1.5 py-0.5 rounded text-[#1C140F]">patient123</code> or patient code
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-extrabold text-[#FFFCF7] bg-[#C56845] hover:bg-[#B05534] shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Authenticating Patient..." : "Access Bedside Portal"}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t-2 border-[#E7DFD4] flex items-center justify-between text-xs font-bold text-[#75665D]">
              <Link href="/nurse" className="text-[#C56845] hover:underline">
                &larr; Nurse Station
              </Link>
              <Link href="/" className="hover:underline">
                Platform Registry
              </Link>
            </div>
          </div>
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
    <div className="min-h-screen bg-[#F5F0E8] text-[#30251F] flex flex-col font-sans selection:bg-[#EED9CD]">
      {/* Top Editorial Masthead Navigation */}
      <header className="border-b-2 border-[#E7DFD4] bg-[#FFFCF7]/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#30251F] text-[#FFFCF7] flex items-center justify-center font-serif font-black text-base shadow-sm border border-[#30251F]">
              PT
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-serif text-2xl font-black tracking-tight text-[#1C140F]">
                  {patient.displayName}
                </span>
                <span className="text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  {patient.patientCode}
                </span>
              </div>
              <span className="text-xs text-[#75665D] font-serif italic font-bold">
                Bedside Terminal &bull; Bed: {patient.bedLabel || "ICU-General"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/nurse"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F5F0E8] hover:bg-[#EED9CD] border border-[#E7DFD4] text-[#30251F] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C56845]" />
              <span>Nurse Station</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-bold text-[#75665D] hover:text-[#C56845] px-3 py-1.5 rounded-xl border border-[#E7DFD4] hover:bg-[#EED9CD]/50 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      {notice && (
        <div className="max-w-7xl mx-auto px-6 pt-4 w-full">
          <div
            className={`p-3.5 rounded-xl text-xs font-bold leading-relaxed border-2 shadow-xs flex items-center justify-between ${
              notice.isError
                ? "bg-[#F9ECE7] border-[#C56845] text-[#8C3A1E]"
                : "bg-[#EED9CD]/80 border-[#D6C7B7] text-[#1C140F]"
            }`}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="text-[#30251F] font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full space-y-6">
        {/* ======================================================== */}
        {/* 1. NURSE ASSIGNMENT APPROVAL CALLOUT */}
        {/* ======================================================== */}
        <section className="bg-[#FFFCF7] border-2 border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b-2 border-[#E7DFD4] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#EED9CD] text-[#C56845] border border-[#D6C7B7]">
                <Bell className="w-5 h-5 text-[#C56845]" />
              </div>
              <div>
                <h2 className="text-xl font-serif font-extrabold text-[#1C140F]">
                  Nurse Care Assignment Status
                </h2>
                <p className="text-xs text-[#75665D] font-serif italic font-bold">
                  Bedside nurse allocation requires patient consent &amp; approval
                </p>
              </div>
            </div>

            <div>
              {nurseReq?.status === "APPROVED" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  <CheckCircle2 className="w-4 h-4 text-[#C56845]" />
                  Approved by Patient
                </span>
              ) : nurseReq?.status === "PENDING" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C] animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-[#C56845]" />
                  Awaiting Patient Approval
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
                  No Active Request
                </span>
              )}
            </div>
          </div>

          {/* Pending Nurse Request Approval Box */}
          {nurseReq?.status === "PENDING" && (
            <div className="p-4 rounded-xl bg-[#F9ECE7] border-2 border-[#C56845] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-serif font-black text-[#8C3A1E]">
                    Nurse Care Request Pending: {nurseReq.nurseName}
                  </h3>
                  <p className="text-xs font-bold text-[#30251F] mt-0.5">
                    Attending nurse <strong>{nurseReq.nurseName}</strong> has requested to be allocated as your primary bedside caregiver for {patient.bedLabel || "your bed"}.
                  </p>
                  <span className="text-[11px] font-mono font-extrabold text-[#75665D] block mt-1">
                    Requested on: {nurseReq.requestedAt ? new Date(nurseReq.requestedAt).toLocaleTimeString() : "Just now"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApproveNurse}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider font-extrabold bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7] shadow-sm transition disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Approve Nurse Request
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectNurse}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs uppercase tracking-wider font-bold bg-[#FFFCF7] text-[#75665D] hover:text-[#30251F] border border-[#E7DFD4] transition"
                  >
                    <X className="w-4 h-4" />
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {nurseReq?.status === "APPROVED" && (
            <div className="p-3.5 rounded-xl bg-[#EED9CD]/50 border border-[#D6C7B7] flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#1C140F]">
                  Assigned Caregiver: <strong>{nurseReq.nurseName}</strong>
                </p>
                <p className="text-xs text-[#75665D] font-mono font-bold mt-0.5">
                  Approval Confirmed on: {nurseReq.approvedAt ? new Date(nurseReq.approvedAt).toLocaleTimeString() : "Session Active"}
                </p>
              </div>
              <span className="text-xs font-mono font-extrabold text-[#7A361E]">
                ✓ Active Bedside Care
              </span>
            </div>
          )}

          {nurseReq?.status === "NONE" && (
            <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs font-bold text-[#75665D]">
              No nurse assignment request currently pending. When a nurse requests allocation, your confirmation modal will appear here immediately.
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 2. ALLOCATED DEVICE STATUS (SINGLE 1-TO-1 ALLOCATION) */}
        {/* ======================================================== */}
        <section className="bg-[#FFFCF7] border-2 border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b-2 border-[#E7DFD4] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#EED9CD] text-[#C56845] border border-[#D6C7B7]">
                <Cpu className="w-5 h-5 text-[#C56845]" />
              </div>
              <div>
                <h2 className="text-xl font-serif font-extrabold text-[#1C140F]">
                  Allocated Bedside Hardware
                </h2>
                <p className="text-xs text-[#75665D] font-serif italic font-bold">
                  Strict 1-to-1 Device Allocation Invariant
                </p>
              </div>
            </div>

            {activeAssignment ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                <Radio className="w-3.5 h-3.5 text-[#C56845]" />
                Single Device Allocated
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
                No Device Assigned
              </span>
            )}
          </div>

          {activeAssignment ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4]">
                <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-[#75665D] block">
                  Allocated Device
                </span>
                <span className="text-sm font-serif font-black text-[#1C140F] block mt-0.5">
                  {activeAssignment.device.name}
                </span>
                <span className="text-[11px] font-mono font-bold text-[#75665D]">
                  {activeAssignment.device.deviceId}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4]">
                <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-[#75665D] block">
                  Connectivity
                </span>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-extrabold text-[#7A361E]">
                    <span className="w-2 h-2 rounded-full bg-[#C56845]" />
                    {activeAssignment.device.connectivityStatus || "ONLINE"}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4]">
                <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-[#75665D] block">
                  MAC / Hardware ID
                </span>
                <span className="text-xs font-mono font-black text-[#1C140F] block mt-0.5 truncate">
                  {activeAssignment.device.hardwareId || "ESP32-S3-WIFI"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4]">
                <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-[#75665D] block">
                  Firmware Version
                </span>
                <span className="text-xs font-mono font-bold text-[#1C140F] block mt-0.5">
                  {activeAssignment.device.firmwareVersion || "v1.2.0-esp32"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs font-bold text-[#75665D]">
              No bedside device currently allocated to this bed. Nurses can allocate a single NPG Lite / ESP32 device from the Registry view.
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 3. PREDEFINED COMMANDS MATRIX (EXACT SPECIFICATION) */}
        {/* ======================================================== */}
        <section className="bg-[#FFFCF7] border-2 border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#E7DFD4] pb-3">
            <div>
              <h2 className="text-xl font-serif font-black text-[#1C140F]">
                Bedside Gesture &amp; Physical Triggers Matrix
              </h2>
              <p className="text-xs text-[#75665D] font-serif italic font-bold">
                Predefined clinical trigger commands active in the bedside firmware
              </p>
            </div>

            {lastDispatched && (
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                Last Transmitted: <strong>{lastDispatched}</strong>
              </span>
            )}
          </div>

          {/* Editorial Command Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#E7DFD4] bg-[#F5F0E8]/70">
                  <th className="py-3 px-4 font-mono uppercase tracking-wider text-[11px] font-black text-[#30251F]">
                    Do This (Physical Action)
                  </th>
                  <th className="py-3 px-4 font-mono uppercase tracking-wider text-[11px] font-black text-[#30251F]">
                    Serial Shows
                  </th>
                  <th className="py-3 px-4 font-mono uppercase tracking-wider text-[11px] font-black text-[#30251F]">
                    Dashboard Shows
                  </th>
                  <th className="py-3 px-4 font-mono uppercase tracking-wider text-[11px] font-black text-[#30251F] text-right">
                    Bedside Trigger Test
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y border-b border-[#E7DFD4]">
                {commands.map((cmd) => {
                  const isBusy = triggeringAction === cmd.action;
                  const isEmerg = cmd.isEmergency;

                  return (
                    <tr
                      key={cmd.action}
                      className={`hover:bg-[#F5F0E8]/50 transition ${
                        isEmerg ? "bg-[#F9ECE7]/30" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 font-bold text-sm text-[#1C140F]">
                        {cmd.gestureName}
                        <p className="text-[11px] font-serif italic font-normal text-[#75665D] mt-0.5">
                          {cmd.instruction}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <code className="px-2 py-1 rounded-md font-mono text-xs font-black bg-[#F5F0E8] border border-[#E7DFD4] text-[#30251F]">
                          {cmd.serialCommand}
                        </code>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-xl text-xs font-mono font-extrabold border-2 ${
                            cmd.badgeColor || "bg-[#F5F0E8] text-[#30251F] border-[#E7DFD4]"
                          }`}
                        >
                          {cmd.dashboardLabel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleTriggerCommand(cmd.action, cmd.serialCommand)}
                          disabled={isBusy}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition shadow-xs disabled:opacity-50 ${
                            isEmerg
                              ? "bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7]"
                              : "bg-[#FFFCF7] text-[#30251F] border-2 border-[#E7DFD4] hover:bg-[#EED9CD]"
                          }`}
                        >
                          {isBusy ? "Triggering..." : `Trigger ${cmd.action}`}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Editorial Footer */}
      <footer className="border-t-2 border-[#E7DFD4] bg-[#FFFCF7] py-6 text-center text-xs font-bold text-[#75665D] mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-serif italic font-black">
            NetraVaani &bull; Bedside Assistive Clinical Protocol
          </span>
          <span className="font-mono text-[11px] font-extrabold">
            Patient Code: {patient.patientCode} &bull; Bed: {patient.bedLabel || "General"}
          </span>
        </div>
      </footer>
    </div>
  );
}
