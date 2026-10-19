"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiClient, PatientItem, CareRequestItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Bell,
  Bed,
  Shield,
  LogOut,
  RefreshCw,
  Clock,
} from "@/lib/noIcons";

interface PatientBedsideViewProps {
  patientCode?: string;
  onClose?: () => void;
}

export default function PatientBedsideView({ patientCode: propCode, onClose }: PatientBedsideViewProps) {
  const { user, logout } = useAuth();
  const [patient, setPatient] = useState<PatientItem | null>(null);
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ALL");
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [bedInput, setBedInput] = useState("");
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  const showNotice = (text: string, isError = false) => {
    setNotice({ text, isError });
    setTimeout(() => setNotice(null), 4500);
  };

  const loadPatientData = useCallback(async (codeOrIdentifier: string) => {
    try {
      setLoading(true);
      const res = await apiClient.getPatient(codeOrIdentifier);
      if (res?.data) {
        setPatient(res.data);
        if (res.data.patientCode) {
          try {
            const reqRes = await apiClient.getCareRequests({ patientCode: res.data.patientCode, limit: 50 });
            if (reqRes?.data) {
              setRequests(reqRes.data);
            }
          } catch {
            // silent ignore
          }
        }
      }
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Unable to load patient bedside ledger", true);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  const handleManualRefresh = async () => {
    const code = patient?.patientCode || propCode || user?.patientCode;
    if (!code) return;
    setIsRefreshing(true);
    try {
      const [pRes, rRes] = await Promise.all([
        apiClient.getPatient(code),
        apiClient.getCareRequests({ patientCode: code, limit: 50 }),
      ]);
      if (pRes?.data) setPatient(pRes.data);
      if (rRes?.data) setRequests(rRes.data);
      showNotice("Bedside care requests updated in real-time");
    } catch {
      showNotice("Failed to refresh care calls", true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    // 1. If explicit prop passed
    if (propCode) {
      loadPatientData(propCode);
      return;
    }

    // 2. If user has patientCode
    if (user?.patientCode) {
      loadPatientData(user.patientCode);
      return;
    }

    // 3. If patient code in local storage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("nv_patient_code");
      if (stored) {
        loadPatientData(stored);
        return;
      }
    }

    // 4. Try getPatientMe() API endpoint
    apiClient.getPatientMe().then(async (res) => {
      if (res?.data) {
        setPatient(res.data);
        if (res.data.patientCode && typeof window !== "undefined") {
          localStorage.setItem("nv_patient_code", res.data.patientCode);
        }
        if (res.data.patientCode) {
          try {
            const rRes = await apiClient.getCareRequests({ patientCode: res.data.patientCode, limit: 50 });
            if (rRes?.data) setRequests(rRes.data);
          } catch {
            // silent ignore
          }
        }
        setInitialLoading(false);
      } else if (user) {
        const identifier = user.email || user.username || user.name;
        if (identifier) {
          loadPatientData(identifier);
        } else {
          setInitialLoading(false);
        }
      } else {
        setInitialLoading(false);
      }
    }).catch(() => {
      if (user) {
        const identifier = user.email || user.username || user.name;
        if (identifier) {
          loadPatientData(identifier);
        } else {
          setInitialLoading(false);
        }
      } else {
        setInitialLoading(false);
      }
    });
  }, [propCode, user, loadPatientData]);

  // Periodic poll for nurse assignment updates and patient's care requests
  useEffect(() => {
    if (!patient?.patientCode) return;

    const fetchPatientData = async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          apiClient.getPatient(patient.patientCode),
          apiClient.getCareRequests({ patientCode: patient.patientCode, limit: 50 }),
        ]);
        if (pRes?.data) {
          setPatient(pRes.data);
        }
        if (rRes?.data) {
          setRequests(rRes.data);
        }
      } catch {
        // silent background poll
      }
    };

    fetchPatientData();
    const interval = setInterval(fetchPatientData, 3000);
    return () => clearInterval(interval);
  }, [patient?.patientCode]);

  useEffect(() => {
    if (patient?.bedLabel && !bedInput) {
      setBedInput(patient.bedLabel);
    }
  }, [patient?.bedLabel, bedInput]);

  const handleApproveNurse = async () => {
    if (!patient) return;
    try {
      setLoading(true);
      const res = await apiClient.approveNurseAssignment(patient.patientCode, bedInput.trim());
      setPatient(res.data);
      showNotice("Nurse care assignment approved successfully with bed allocation!");
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
      showNotice("Nurse care link request declined.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] flex items-center justify-center p-6 text-[#211C19]">
        <div className="flex items-center gap-3 bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl px-5 py-3 shadow-subtle">
          <span className="w-2.5 h-2.5 rounded-full bg-[#AD5D3D] animate-ping" />
          <span className="text-sm font-semibold font-sans">Connecting to Bedside Portal...</span>
        </div>
      </div>
    );
  }

  const nurseReq = patient?.nurseAssignment;

  return (
    <div className="min-h-screen bg-[#F5F1E9] text-[#211C19] flex flex-col font-sans selection:bg-[#AD5D3D]/20">
      {/* Top Header */}
      <header className="border-b border-[#E5D9CA] bg-[#FFFCF7] sticky top-0 z-40 shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#211C19] text-[#FFFCF7] flex items-center justify-center font-heading font-black text-sm shrink-0 shadow-xs">
              PT
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading text-lg sm:text-xl font-extrabold text-[#211C19]">
                  {patient?.displayName || user?.name || "Patient Bedside"}
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F5ECE6] text-[#AD5D3D] border border-[#E2C7B8]">
                  {patient?.patientCode || "ACTIVE"}
                </span>
              </div>
              <span className="text-xs text-[#76685F] font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#42765A] animate-pulse" />
                Bedside Terminal &bull; Bed: <strong className="text-[#211C19]">{patient?.bedLabel || "Active"}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#211C19] hover:bg-[#3D3530] text-white transition shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Nurse Station</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  if (typeof window !== "undefined") {
                    window.location.href = "/";
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-[#E5D9CA] text-[#76685F] hover:text-[#B42318] hover:border-[#FECDCA] hover:bg-[#FEF3F2] transition shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Notice Alert */}
      {notice && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 w-full">
          <div
            className={`p-3 rounded-xl text-xs font-semibold leading-relaxed border flex items-center justify-between ${
              notice.isError
                ? "bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]"
                : "bg-[#EDF5F0] border-[#C5DDCF] text-[#42765A]"
            }`}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Bedside Workspace */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        
        {/* 1. NURSE CARE ASSIGNMENT APPROVAL SECTION */}
        <section className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#FFFCF7] to-[#F2F8F4] border border-[#CDE2D5] p-5 sm:p-6 rounded-2xl shadow-subtle space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#42765A] via-[#5EA780] to-[#42765A]" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5D9CA]/80 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#FAF0E6] text-[#AD5D3D] border border-[#E2C7B8] shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-heading font-bold text-[#211C19]">
                  Nurse Care Link Status
                </h2>
                <p className="text-xs text-[#76685F] font-medium">
                  Bedside nurse allocation requires explicit patient authorization
                </p>
              </div>
            </div>

            <div>
              {nurseReq?.status === "APPROVED" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]">
                  <CheckCircle2 className="w-4 h-4" />
                  Approved by Patient
                </span>
              ) : nurseReq?.status === "PENDING" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FAF0E6] text-[#AD5D3D] border border-[#E2C7B8] animate-pulse">
                  <AlertTriangle className="w-4 h-4" />
                  Awaiting Patient Approval
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F1E9] text-[#76685F] border border-[#E5D9CA]">
                  No Nurse Assigned
                </span>
              )}
            </div>
          </div>

          {/* Pending approval action prompt */}
          {nurseReq?.status === "PENDING" ? (
            <div className="bg-[#FAF0E6] border border-[#E2C7B8] rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#AD5D3D] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-heading font-bold text-sm text-[#211C19]">
                    Nurse Connection Request: {nurseReq.nurseName || "Bedside Nurse Station"}
                  </h3>
                  <p className="text-xs text-[#76685F] leading-relaxed">
                    Nurse <strong>{nurseReq.nurseName || "Staff Nurse"}</strong> has requested care telemetry authorization for this bedside.
                  </p>
                </div>
              </div>

              {/* Bed Number Input on Approval */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-[#76685F] uppercase tracking-wider">
                  Confirm Bed Number
                </label>
                <div className="flex items-center gap-2 max-w-sm">
                  <div className="p-2 rounded-lg bg-white border border-[#E5D9CA] text-[#AD5D3D]">
                    <Bed className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Bed 04, ICU-2, Room 102"
                    value={bedInput}
                    onChange={(e) => setBedInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E5D9CA] text-[#211C19] focus:outline-none focus:ring-2 focus:ring-[#42765A]/30 focus:border-[#42765A]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleApproveNurse}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#42765A] hover:bg-[#355F49] text-white transition shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve Nurse Care Link</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRejectNurse}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FFFCF7] border border-[#E5D9CA] text-[#B42318] hover:bg-[#FEF3F2] transition"
                >
                  Decline
                </button>
              </div>
            </div>
          ) : nurseReq?.status === "APPROVED" ? (
            <div className="text-xs text-[#42765A] font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Active nurse link confirmed: {nurseReq.nurseName || "Nurse Station"}. Care telemetry stream verified.</span>
            </div>
          ) : (
            <p className="text-xs text-[#76685F]">
              No pending nurse requests. The Nurse Station will dispatch a connection request when allocating a nurse to this patient.
            </p>
          )}
        </section>

        {/* 2. BEDSIDE GESTURE DISPLAY MATRIX (5 Calibrated Clinical Commands - Display Only) */}
        <section className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#FFFCF7] to-[#F2F8F4] border border-[#CDE2D5] p-5 sm:p-6 rounded-2xl shadow-subtle space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#42765A] via-[#5EA780] to-[#42765A]" />
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-[#211C19]">
              Bedside Gaze &amp; Gesture Commands
            </h2>
            <p className="text-xs text-[#76685F] font-medium mt-0.5">
              Firmware-calibrated triggers detected automatically by bedside hardware sensors:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* YES */}
            <div
              className="p-4 rounded-xl border border-[#A3D1B4] bg-gradient-to-br from-[#FFFCF7] to-[#EDF5F0] text-left space-y-1.5 shadow-xs select-none"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#211C19]">
                  YES / Affirmative
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]">
                  [cmd] YES
                </span>
              </div>
              <p className="text-xs text-[#76685F]">2 blinks, wait</p>
            </div>

            {/* WATER */}
            <div
              className="p-4 rounded-xl border border-[#A8CEF0] bg-gradient-to-br from-[#FFFCF7] to-[#EBF3FB] text-left space-y-1.5 shadow-xs select-none"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#211C19]">
                  Drinking Water
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#EBF3FB] text-[#2B6CB0] border border-[#BEE3F8]">
                  [cmd] WATER
                </span>
              </div>
              <p className="text-xs text-[#76685F]">4+ rapid blinks</p>
            </div>

            {/* NO */}
            <div
              className="p-4 rounded-xl border border-[#D8CEBF] bg-gradient-to-br from-[#FFFCF7] to-[#F5F1E9] text-left space-y-1.5 shadow-xs select-none"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#211C19]">
                  NO / Negative
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#F5F1E9] text-[#76685F] border border-[#E5D9CA]">
                  [cmd] NO
                </span>
              </div>
              <p className="text-xs text-[#76685F]">Squeeze both hands together, once</p>
            </div>

            {/* CALL NURSE */}
            <div
              className="p-4 rounded-xl border border-[#E2C7B8] bg-gradient-to-br from-[#FFFCF7] to-[#FAF0E6] text-left space-y-1.5 shadow-xs select-none"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#AD5D3D]">
                  CALL NURSE
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FFFCF7] text-[#AD5D3D] border border-[#E2C7B8]">
                  [cmd] CALL NURSE
                </span>
              </div>
              <p className="text-xs text-[#76685F]">Squeeze left hand 3 times</p>
            </div>

            {/* EMERGENCY */}
            <div
              className="p-4 rounded-xl border border-[#FECDCA] bg-gradient-to-br from-[#FFFCF7] to-[#FEF3F2] text-left space-y-1.5 shadow-xs col-span-1 sm:col-span-2 lg:col-span-1 select-none"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#B42318] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#B42318]" />
                  <span>EMERGENCY / PAIN</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#B42318] text-white">
                  PRIORITY
                </span>
              </div>
              <p className="text-xs text-[#76685F]">Squeeze both hands together, 3 times (Acute alert)</p>
            </div>
          </div>
        </section>

        {/* 3. PATIENT'S RECENT CARE REQUESTS */}
        <section className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#FFFCF7] to-[#F2F8F4] border border-[#CDE2D5] p-5 sm:p-6 rounded-2xl shadow-subtle space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#42765A] via-[#5EA780] to-[#42765A]" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5D9CA]/80 pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-heading font-bold text-[#211C19]">
                  My Bedside Requests &amp; Care Calls
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]">
                  {requests.length} Total
                </span>
              </div>
              <p className="text-xs text-[#76685F] font-medium mt-0.5">
                Real-time tracking of all gesture triggers and calls transmitted to the nurse station
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FFFCF7] border border-[#E5D9CA] text-[#76685F] hover:text-[#211C19] hover:border-[#42765A] transition shadow-xs"
                title="Refresh Requests"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#42765A]" : ""}`} />
                <span>{isRefreshing ? "Syncing..." : "Sync Ledger"}</span>
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterStatus === "ALL"
                  ? "bg-[#211C19] text-[#FFFCF7] shadow-xs"
                  : "bg-white/60 text-[#76685F] border border-[#E5D9CA] hover:bg-white"
              }`}
            >
              All Calls ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("ACTIVE")}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                filterStatus === "ACTIVE"
                  ? "bg-[#AD5D3D] text-white shadow-xs"
                  : "bg-white/60 text-[#76685F] border border-[#E5D9CA] hover:bg-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#AD5D3D] animate-ping" />
              Active ({requests.filter((r) => r.status === "NEW" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("RESOLVED")}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterStatus === "RESOLVED"
                  ? "bg-[#42765A] text-white shadow-xs"
                  : "bg-white/60 text-[#76685F] border border-[#E5D9CA] hover:bg-white"
              }`}
            >
              Resolved ({requests.filter((r) => r.status === "RESOLVED").length})
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-3 bg-[#FFFCF7] rounded-xl border border-[#E5D9CA]/60">
              <div className="w-12 h-12 rounded-full bg-[#EDF5F0] text-[#42765A] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#211C19]">No Bedside Requests Logged Yet</p>
                <p className="text-xs text-[#76685F] max-w-md mx-auto leading-relaxed">
                  When your bedside sensors detect your gestures (such as blinking for water or squeezing for nurse assistance), the dispatched call will appear here with live nurse response status.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#E5D9CA]/70 max-h-[450px] overflow-y-auto pr-1 space-y-2.5">
              {requests
                .filter((r) => {
                  if (filterStatus === "ACTIVE") {
                    return r.status === "NEW" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS";
                  }
                  if (filterStatus === "RESOLVED") {
                    return r.status === "RESOLVED";
                  }
                  return true;
                })
                .map((req) => {
                  const isEmergency = req.action === "EMERGENCY" || Boolean(req.urgent);
                  const createdDate = req.createdAt ? new Date(req.createdAt) : null;
                  const timeString = createdDate
                    ? createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                    : "Just now";
                  const dateString = createdDate
                    ? createdDate.toLocaleDateString([], { month: "short", day: "numeric" })
                    : "";

                  return (
                    <div
                      key={req._id}
                      className="pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-[#E5D9CA]/80 shadow-xs hover:border-[#42765A]/40 transition"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-xs ${
                            isEmergency
                              ? "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]"
                              : req.action === "WATER"
                              ? "bg-[#EBF3FB] text-[#2B6CB0] border border-[#BEE3F8]"
                              : req.action === "CALL_NURSE"
                              ? "bg-[#FAF0E6] text-[#AD5D3D] border border-[#E2C7B8]"
                              : "bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]"
                          }`}
                        >
                          {req.action === "WATER" ? "💧" : isEmergency ? "🚨" : req.action === "CALL_NURSE" ? "🔔" : "📢"}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-extrabold text-sm text-[#211C19]">
                              {req.action.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#F5F1E9] text-[#76685F] border border-[#E5D9CA]">
                              {req.gesture || req.gestureId}
                            </span>
                            {req.eventId && (
                              <span className="text-[9px] font-mono text-[#A89F91]">
                                ref: {req.eventId.slice(-8)}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-[11px] text-[#76685F] font-medium flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#AD5D3D]" />
                              <span>{dateString} at {timeString}</span>
                            </span>

                            {req.status === "ACKNOWLEDGED" && req.acknowledgedAt && (
                              <span className="text-[#2B6CB0]">
                                &bull; Acknowledged {new Date(req.acknowledgedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}

                            {req.status === "IN_PROGRESS" && req.inProgressAt && (
                              <span className="text-[#42765A]">
                                &bull; Attending since {new Date(req.inProgressAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}

                            {req.status === "RESOLVED" && req.resolvedAt && (
                              <span className="text-[#42765A]">
                                &bull; Completed {new Date(req.resolvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="self-end md:self-center shrink-0">
                        {req.status === "NEW" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#FAF0E6] text-[#AD5D3D] border border-[#E2C7B8] animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-[#AD5D3D]" />
                            Calling Nurse Station
                          </span>
                        ) : req.status === "ACKNOWLEDGED" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#EBF3FB] text-[#2B6CB0] border border-[#BEE3F8]">
                            <span className="w-2 h-2 rounded-full bg-[#2B6CB0]" />
                            Nurse Acknowledged
                          </span>
                        ) : req.status === "IN_PROGRESS" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF] animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-[#42765A]" />
                            Nurse Attending Bedside
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#F5F1E9] text-[#76685F] border border-[#E5D9CA]">
                            <Check className="w-3.5 h-3.5 text-[#42765A]" />
                            Resolved / Closed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
