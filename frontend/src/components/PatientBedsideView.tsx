"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiClient, PatientItem, CareRequestItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import {
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Bed,
  Shield,
  LogOut,
  RefreshCw,
  Radio,
  Lock,
} from "@/lib/noIcons";

interface PatientBedsideViewProps {
  patientCode?: string;
  onClose?: () => void;
}

export default function PatientBedsideView({ patientCode: propCode, onClose }: PatientBedsideViewProps) {
  const { user, logout } = useAuth();
  const [patient, setPatient] = useState<PatientItem | null>(null);
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
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
      showNotice(err instanceof Error ? err.message : "Unable to load patient bedside details", true);
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
      showNotice("Bedside status synchronized successfully");
    } catch {
      showNotice("Failed to refresh status", true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (propCode) {
      loadPatientData(propCode);
      return;
    }

    if (user?.patientCode) {
      loadPatientData(user.patientCode);
      return;
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("nv_patient_code");
      if (stored) {
        loadPatientData(stored);
        return;
      }
    }

    apiClient
      .getPatientMe()
      .then(async (res) => {
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
      })
      .catch(() => {
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

  // Periodic poll for bed and assignment updates
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

    const interval = setInterval(fetchPatientData, 3000);
    return () => clearInterval(interval);
  }, [patient?.patientCode]);

  // Handle Approve Proposed Bed
  const handleApproveBed = async () => {
    if (!patient?.patientCode) return;
    setActionInProgress("approve_bed");
    try {
      const res = await apiClient.approveBedAssignment(patient.patientCode);
      if (res?.data?.patient) {
        setPatient(res.data.patient);
      } else {
        const refetched = await apiClient.getPatient(patient.patientCode);
        if (refetched?.data) setPatient(refetched.data);
      }
      showNotice("Bed assignment approved! Your bed is now confirmed.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to approve bed assignment", true);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Reject Proposed Bed
  const handleRejectBed = async () => {
    if (!patient?.patientCode) return;
    setActionInProgress("reject_bed");
    try {
      const res = await apiClient.rejectBedAssignment(patient.patientCode);
      if (res?.data?.patient) {
        setPatient(res.data.patient);
      } else {
        const refetched = await apiClient.getPatient(patient.patientCode);
        if (refetched?.data) setPatient(refetched.data);
      }
      showNotice("Proposed bed declined. Retaining previous bed state.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Failed to decline bed assignment", true);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Approve Nurse Link (Only Patient Can Approve)
  const handleApproveNurse = async () => {
    if (!patient) return;
    setActionInProgress("approve_nurse");
    try {
      const res = await apiClient.approveNurseAssignment(
        patient.patientCode,
        patient.pendingBedLabel || patient.bedLabel
      );
      if (res?.data) {
        setPatient(res.data);
      }
      showNotice("Nurse care request link authorized and confirmed!");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Approval failed", true);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Reject Nurse Link
  const handleRejectNurse = async () => {
    if (!patient) return;
    setActionInProgress("reject_nurse");
    try {
      const res = await apiClient.rejectNurseAssignment(patient.patientCode);
      setPatient(res.data);
      showNotice("Nurse link request declined.");
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setActionInProgress(null);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-[#0F172A]">
        <div className="flex items-center gap-3 bg-white border border-[#E2E8F0] rounded-xl px-5 py-3 shadow-md">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] animate-ping" />
          <span className="text-sm font-semibold font-sans text-[#0F172A]">Connecting to Patient Dashboard...</span>
        </div>
      </div>
    );
  }

  // Strict Assignment Gating Conditions
  const hasConfirmedBed = Boolean(
    patient?.bedLabel &&
    patient?.bedStatus !== "PENDING_APPROVAL" &&
    patient?.status !== "PENDING_BED_APPROVAL"
  );
  const assignedDevice = patient?.currentAssignment?.device;
  const hasActiveDevice = Boolean(assignedDevice && assignedDevice.status !== "DISABLED");
  const isCommandsEnabled = hasConfirmedBed && hasActiveDevice;

  const hasPendingBedProposal = Boolean(patient?.pendingBedLabel);
  const nurseReq = patient?.nurseAssignment;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col font-sans transition-colors duration-150">
      {/* Top Header - Clean White with Solid Blue Accent */}
      <header className="border-b border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#131B2E] sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Identity & Role Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              PT
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-lg sm:text-xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
                  Patient Dashboard
                </span>
                {/* Prominent PATIENT Role Label */}
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#2563EB] text-white tracking-wider uppercase shadow-xs">
                  PATIENT
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-[#EFF6FF] dark:bg-[#1E3A8A] text-[#2563EB] dark:text-[#93C5FD] border border-[#BFDBFE] dark:border-[#3B82F6]">
                  {patient?.patientCode || "PT-ACTIVE"}
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] font-medium flex items-center gap-2 mt-0.5 flex-wrap">
                <span>Account: <strong className="text-[#0F172A] dark:text-[#F8FAFC]">{patient?.displayName || user?.name}</strong></span>
                {user?.username && <span>(@{user.username})</span>}
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isCommandsEnabled ? "bg-[#059669]" : "bg-[#D97706]"}`} />
                  <span className={isCommandsEnabled ? "text-[#059669] dark:text-[#34D399] font-bold" : "text-[#D97706] dark:text-[#FBBF24] font-semibold"}>
                    {isCommandsEnabled ? "Commands Operational" : "Awaiting Clinical Assignments"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
            {/* Theme Toggle (Light / Dark) */}
            <ThemeToggle />

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:border-[#2563EB] transition shadow-xs"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#2563EB]" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0F172A] hover:bg-[#334155] text-white transition shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return</span>
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] hover:border-[#FCA5A5] hover:bg-[#FEF2F2] transition shadow-xs"
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
            className={`p-3 rounded-xl text-xs font-semibold leading-relaxed border flex items-center justify-between shadow-xs ${
              notice.isError
                ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C]"
                : "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]"
            }`}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="p-1 hover:opacity-75">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">

        {/* SECTION 1: BED STATUS & BED ASSIGNMENT APPROVAL */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                  Bed Allocation &amp; Assignment
                </h2>
                <p className="text-xs text-[#64748B]">
                  Hospital bed registration requires explicit patient authorization before confirmation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasConfirmedBed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#ECFDF5] text-[#047857] border border-[#10B981]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmed: {patient?.bedLabel}</span>
                </span>
              ) : hasPendingBedProposal ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#FFFBEB] text-[#B45309] border border-[#F59E0B]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Pending Patient Approval</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]">
                  <span>No Bed Assigned</span>
                </span>
              )}
            </div>
          </div>

          {/* Pending Bed Assignment Banner (Approve / Reject Action) */}
          {hasPendingBedProposal && (
            <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#F59E0B] space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#0F172A]">
                    Proposed Bed Assignment: <span className="text-[#B45309] font-mono text-base font-extrabold">{patient?.pendingBedLabel}</span>
                  </h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Your clinical nurse has proposed Bed <strong>{patient?.pendingBedLabel}</strong>.
                    {hasConfirmedBed
                      ? ` Approving will atomically transfer you from your current bed (${patient?.bedLabel}) to ${patient?.pendingBedLabel}. Declining preserves your existing bed.`
                      : " Explicit patient approval is required to confirm this bed and complete your patient registration."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleApproveBed}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{actionInProgress === "approve_bed" ? "Approving..." : `Approve Bed ${patient?.pendingBedLabel}`}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectBed}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-white border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] transition disabled:opacity-50"
                >
                  {actionInProgress === "reject_bed" ? "Declining..." : "Decline"}
                </button>
              </div>
            </div>
          )}

          {/* Confirmed Bed Details Summary */}
          {!hasPendingBedProposal && hasConfirmedBed && (
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#475569]">
                <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                <span>Current Confirmed Bed: <strong className="text-[#0F172A] font-mono">{patient?.bedLabel}</strong></span>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-0.5 rounded">
                OCCUPIED &bull; ACTIVE
              </span>
            </div>
          )}

          {/* Nurse Link Authorization Banner if pending (Only patient can approve) */}
          {nurseReq?.status === "PENDING" && (
            <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#2563EB] space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#0F172A] flex items-center gap-2">
                    <span>Care Link Request from Nurse: {nurseReq.nurseName || "Staff Nurse"}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE]">
                      AWAITING PATIENT APPROVAL
                    </span>
                  </h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Nurse <strong>{nurseReq.nurseName}</strong> has sent a care link request to connect with your bedside station
                    {patient?.pendingBedLabel ? (
                      <> for bed <strong className="font-mono text-[#0F172A]">{patient.pendingBedLabel}</strong></>
                    ) : null}
                    . Only you (the patient) can approve this request.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleApproveNurse}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{actionInProgress === "approve_nurse" ? "Approving..." : "Approve Care Request"}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectNurse}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-[#CBD5E1] text-[#64748B] hover:text-[#DC2626] hover:border-[#FCA5A5] transition"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 2: ALLOCATED NPG DEVICE STATUS */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                  NPG Assistive Device Allocation
                </h2>
                <p className="text-xs text-[#64748B]">
                  Strict 1-to-1 bedside hardware gateway assignment
                </p>
              </div>
            </div>

            {hasActiveDevice ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#ECFDF5] text-[#047857] border border-[#10B981]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>DEVICE ALLOCATED</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]">
                <span>NO DEVICE ASSIGNED</span>
              </span>
            )}
          </div>

          {hasActiveDevice && assignedDevice ? (
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#0F172A]">
                  Gateway: <span className="font-mono text-[#2563EB]">{assignedDevice.name || assignedDevice.deviceId}</span>
                </div>
                <div className="text-xs text-[#64748B] mt-0.5">
                  ID: <span className="font-mono">{assignedDevice.deviceId}</span> &bull; Status: <span className="text-[#047857] font-bold">{assignedDevice.status}</span> &bull; Telemetry: <span className="text-[#2563EB] font-bold">{assignedDevice.connectivityStatus || "ONLINE"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded bg-[#ECFDF5] border border-[#10B981] text-[#047857] font-bold">
                  Operational
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#B45309] space-y-1">
              <div className="font-bold flex items-center gap-2 text-[#92400E]">
                <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                <span>No NPG Gateway Assigned Yet</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#78350F]">
                Bedside gaze &amp; gesture triggers require an active NPG hardware device. Please ask your attending nurse to allocate an available online device to your bedside.
              </p>
            </div>
          )}
        </section>

        {/* SECTION 3: BEDSIDE GAZE & GESTURE COMMANDS (Gated until bed confirmed AND device assigned) */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                Bedside Gaze &amp; Gesture Commands
              </h2>
              <p className="text-xs text-[#64748B]">
                Firmware-calibrated triggers detected by bedside sensors (Display Matrix)
              </p>
            </div>

            {isCommandsEnabled ? (
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#ECFDF5] text-[#047857] border border-[#10B981] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Commands Active</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Commands Locked</span>
              </span>
            )}
          </div>

          {isCommandsEnabled ? (
            /* Active Colorful Commands Grid - Solid Colors, No Gradients */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* YES - Solid Emerald Green */}
              <div className="p-4 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#047857]">
                    YES / Affirmative
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#059669] text-white">
                    [cmd] YES
                  </span>
                </div>
                <p className="text-xs text-[#065F46] font-medium">2 blinks, pause</p>
              </div>

              {/* WATER - Solid Blue */}
              <div className="p-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#1D4ED8]">
                    Drinking Water
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#2563EB] text-white">
                    [cmd] WATER
                  </span>
                </div>
                <p className="text-xs text-[#1E40AF] font-medium">4+ rapid blinks</p>
              </div>

              {/* NO - Solid Slate/Neutral */}
              <div className="p-4 rounded-xl border border-[#CBD5E1] bg-[#F1F5F9] space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#334155]">
                    NO / Negative
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#475569] text-white">
                    [cmd] NO
                  </span>
                </div>
                <p className="text-xs text-[#475569] font-medium">Squeeze both hands once</p>
              </div>

              {/* CALL NURSE - Solid Amber/Orange */}
              <div className="p-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#B45309]">
                    CALL NURSE
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#D97706] text-white">
                    [cmd] CALL NURSE
                  </span>
                </div>
                <p className="text-xs text-[#92400E] font-medium">Squeeze left hand 3 times</p>
              </div>

              {/* EMERGENCY - Solid Red */}
              <div className="p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] space-y-1.5 col-span-1 sm:col-span-2 lg:col-span-1 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#B91C1C] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                    <span>EMERGENCY / PAIN</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#DC2626] text-white">
                    PRIORITY
                  </span>
                </div>
                <p className="text-xs text-[#991B1B] font-medium">Squeeze both hands 3 times (Acute alert)</p>
              </div>
            </div>
          ) : (
            /* Clear Empty / Locked State */
            <div className="p-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#E2E8F0] text-[#64748B] flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Bedside Commands Currently Disabled
                </h3>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Bedside gaze and gesture commands remain disabled until both prerequisites are completed:
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left pt-2">
                <div className={`p-3 rounded-lg border text-xs ${hasConfirmedBed ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]" : "bg-white border-[#E2E8F0] text-[#64748B]"}`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {hasConfirmedBed ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <X className="w-3.5 h-3.5 text-[#DC2626]" />}
                    <span>1. Confirmed Bed Assignment</span>
                  </div>
                  <div className="text-[11px] mt-1 text-[#475569]">
                    {hasConfirmedBed
                      ? `Confirmed (${patient?.bedLabel})`
                      : hasPendingBedProposal
                      ? `Bed ${patient?.pendingBedLabel} pending your approval above`
                      : "No bed assigned by nurse"}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border text-xs ${hasActiveDevice ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]" : "bg-white border-[#E2E8F0] text-[#64748B]"}`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {hasActiveDevice ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <X className="w-3.5 h-3.5 text-[#DC2626]" />}
                    <span>2. Active NPG Device Link</span>
                  </div>
                  <div className="text-[11px] mt-1 text-[#475569]">
                    {hasActiveDevice
                      ? `Assigned (${assignedDevice?.deviceId})`
                      : "No NPG device allocated to patient"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 4: RECENT CARE CALLS HISTORY */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                My Care Request Ledger
              </h2>
              <p className="text-xs text-[#64748B]">
                Real-time tracking of calls and gestures transmitted to the nurse station
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              {requests.length} Total
            </span>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {requests.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                No care calls recorded yet. Commands triggered via your bedside gateway will appear here in real-time.
              </div>
            ) : (
              requests.slice(0, 8).map((req) => (
                <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        req.status === "RESOLVED"
                          ? "bg-[#059669]"
                          : req.status === "IN_PROGRESS"
                          ? "bg-[#2563EB]"
                          : req.status === "ACKNOWLEDGED"
                          ? "bg-[#D97706]"
                          : "bg-[#DC2626]"
                      }`}
                    />
                    <div>
                      <div className="font-bold text-[#0F172A]">
                        {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] text-[#64748B] font-mono">
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} &bull; Gateway: {req.device?.name || req.device?.deviceId || "Gateway"}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      req.status === "RESOLVED"
                        ? "bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]"
                        : req.status === "IN_PROGRESS"
                        ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
                        : req.status === "ACKNOWLEDGED"
                        ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                        : "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
