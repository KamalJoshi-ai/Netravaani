"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient, PatientItem, CareRequestItem, CommandRuleItem, MAX_ACTIVE_REQUESTS_PER_PATIENT } from "@/lib/api";
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
  User,
} from "@/lib/noIcons";

export interface DisplayGesture {
  id: string;
  gesture: string;
  blinks: string;
  left: string;
  right: string;
  together: boolean;
  name: string;
  urgency: "Standard" | "Urgent" | "Urgent, Alarm (RGB LEDs flash red)";
}

export const ALL_STANDARD_GESTURES: DisplayGesture[] = [
  {
    id: "yes",
    gesture: "3–4 blinks naturally",
    blinks: "3–4",
    left: "0",
    right: "0",
    together: false,
    name: "YES",
    urgency: "Standard",
  },
  {
    id: "no",
    gesture: "1–2 squeezes with both hands together",
    blinks: "0",
    left: "1–2",
    right: "1–2",
    together: true,
    name: "NO",
    urgency: "Standard",
  },
  {
    id: "water",
    gesture: "5+ blinks rapidly",
    blinks: "5+",
    left: "0",
    right: "0",
    together: false,
    name: "WATER",
    urgency: "Standard",
  },
  {
    id: "call_nurse",
    gesture: "3+ left wrist squeezes",
    blinks: "0",
    left: "3+",
    right: "0",
    together: false,
    name: "CALL NURSE",
    urgency: "Urgent",
  },
  {
    id: "adjustment",
    gesture: "3+ right wrist squeezes",
    blinks: "0",
    left: "0",
    right: "3+",
    together: false,
    name: "ADJUSTMENT",
    urgency: "Standard",
  },
  {
    id: "emergency",
    gesture: "3+ squeezes with both hands together",
    blinks: "0",
    left: "3+",
    right: "3+",
    together: true,
    name: "EMERGENCY / SEVERE PAIN",
    urgency: "Urgent, Alarm (RGB LEDs flash red)",
  },
];

interface PatientBedsideViewProps {
  patientCode?: string;
  onClose?: () => void;
}

export const formatCount = (range?: [number, number]): string => {
  if (!range) return "0";
  const [lo, hi] = range;
  if (lo === 0 && hi === 0) return "0";
  if (hi >= 20 && lo < 20) return `${lo}+`;
  if (lo === hi) return `${lo}`;
  return `${lo}–${hi}`;
};

export const describeGestureRule = (r: CommandRuleItem): string => {
  const b = formatCount(r.eog);
  const l = formatCount(r.emgLeft);
  const right = formatCount(r.emgRight);

  if (r.simultaneous && r.emgLeft[0] > 0 && r.emgRight[0] > 0) {
    return `${l} squeeze${l === "1" ? "" : "s"} with both hands together`;
  }
  const parts: string[] = [];
  if (r.eog[0] > 0 || r.eog[1] > 0) parts.push(`${b} blink${b === "1" ? "" : "s"}`);
  if (r.emgLeft[0] > 0 || r.emgLeft[1] > 0) parts.push(`${l} left squeeze${l === "1" ? "" : "s"}`);
  if (r.emgRight[0] > 0 || r.emgRight[1] > 0) parts.push(`${right} right squeeze${right === "1" ? "" : "s"}`);
  return parts.join(", then ") || "Rest / Still";
};

export default function PatientBedsideView({ patientCode: propCode, onClose }: PatientBedsideViewProps) {
  const { user, logout } = useAuth();
  const [patient, setPatient] = useState<PatientItem | null>(null);
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [deviceRules, setDeviceRules] = useState<CommandRuleItem[]>([]);
  const [, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  const activeCallsCount = requests.filter(
    (r) => r.status !== "RESOLVED" && r.status !== "CANCELLED"
  ).length;
  const isRequestLimitReached = activeCallsCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT;

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
            const reqRes = await apiClient.getCareRequests({ patientCode: res.data.patientCode, limit: 100 });
            if (reqRes?.data) {
              setRequests(reqRes.data);
            }
          } catch {
            // silent ignore
          }
        }
        if (res.data.currentAssignment?.device?.deviceId) {
          try {
            const rulesRes = await apiClient.getCommandRules(res.data.currentAssignment.device.deviceId);
            if (rulesRes?.data?.rules && rulesRes.data.rules.length > 0) {
              setDeviceRules(rulesRes.data.rules);
            }
          } catch {
            // fallback to standard gestures
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
        apiClient.getCareRequests({ patientCode: code, limit: 100 }),
      ]);
      if (pRes?.data) {
        setPatient(pRes.data);
        if (pRes.data.currentAssignment?.device?.deviceId) {
          apiClient.getCommandRules(pRes.data.currentAssignment.device.deviceId)
            .then((rulesRes) => {
              if (rulesRes?.data?.rules && rulesRes.data.rules.length > 0) {
                setDeviceRules(rulesRes.data.rules);
              }
            })
            .catch(() => {});
        }
      }
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
              const rRes = await apiClient.getCareRequests({ patientCode: res.data.patientCode, limit: 100 });
              if (rRes?.data) setRequests(rRes.data);
            } catch {
              // silent ignore
            }
          }
          if (res.data.currentAssignment?.device?.deviceId) {
            apiClient.getCommandRules(res.data.currentAssignment.device.deviceId)
              .then((rulesRes) => {
                if (rulesRes?.data?.rules && rulesRes.data.rules.length > 0) {
                  setDeviceRules(rulesRes.data.rules);
                }
              })
              .catch(() => {});
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

  // Periodic poll for bed, device assignment, and care link updates
  const activePatientCode =
    patient?.patientCode ||
    propCode ||
    user?.patientCode ||
    (typeof window !== "undefined" ? localStorage.getItem("nv_patient_code") : null);

  useEffect(() => {
    if (!activePatientCode) return;

    const fetchPatientData = async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          apiClient.getPatient(activePatientCode),
          apiClient.getCareRequests({ patientCode: activePatientCode, limit: 50 }),
        ]);
        if (pRes?.data) {
          setPatient(pRes.data);
          // If device was unassigned, clear deviceRules so stale rules are cleared
          if (!pRes.data.currentAssignment) {
            setDeviceRules([]);
          } else if (pRes.data.currentAssignment.device?.deviceId) {
            try {
              const rulesRes = await apiClient.getCommandRules(pRes.data.currentAssignment.device.deviceId);
              if (rulesRes?.data?.rules && rulesRes.data.rules.length > 0) {
                setDeviceRules(rulesRes.data.rules);
              }
            } catch {
              // silent ignore
            }
          }
        }
        if (rRes?.data) {
          setRequests(rRes.data);
        }
      } catch {
        // silent background poll
      }
    };

    const interval = setInterval(fetchPatientData, 2500);
    return () => clearInterval(interval);
  }, [activePatientCode]);

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

  const displayedGestures: DisplayGesture[] = useMemo(() => {
    if (deviceRules && deviceRules.length > 0) {
      return deviceRules.map((rule) => {
        let urgency: "Standard" | "Urgent" | "Urgent, Alarm (RGB LEDs flash red)" = "Standard";
        if (rule.alarm) {
          urgency = "Urgent, Alarm (RGB LEDs flash red)";
        } else if (rule.urgent) {
          urgency = "Urgent";
        }
        return {
          id: rule.id,
          gesture: describeGestureRule(rule),
          blinks: formatCount(rule.eog),
          left: formatCount(rule.emgLeft),
          right: formatCount(rule.emgRight),
          together: Boolean(rule.simultaneous),
          name: (rule.displayLabel?.trim() || rule.label || rule.id).toUpperCase(),
          urgency,
        };
      });
    }

    return ALL_STANDARD_GESTURES;
  }, [deviceRules]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-6 text-slate-900">
        <div className="flex items-center gap-3 bg-white border border-slate-300 shadow-xs rounded-xl px-5 py-3 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
          <span className="text-sm font-medium text-slate-800">Connecting to Patient Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 flex flex-col font-sans transition-colors duration-150">
      {/* Top Header */}
      <header className="border-b border-slate-300 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Identity & Role Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-700  text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {patient?.bedLabel ? patient.bedLabel.slice(0, 3).toUpperCase() : "BED"}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Bedside Terminal
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200  uppercase">
                  PATIENT
                </span>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                  {patient?.patientCode || "PT-ACTIVE"}
                </span>
              </div>
              <div className="text-xs text-slate-600 font-normal flex items-center gap-2 mt-0.5 flex-wrap">
                <span>Account: <strong className="text-slate-800 font-medium">{patient?.displayName || user?.name}</strong></span>
                {user?.username && <span>(@{user.username})</span>}
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isCommandsEnabled ? "bg-emerald-600" : "bg-amber-600"}`} />
                  <span className={isCommandsEnabled ? "text-emerald-700  font-medium" : "text-amber-700  font-medium"}>
                    {isCommandsEnabled ? "Commands Operational" : "Commands Locked"}
                  </span>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1.5" title="Attending nurse station link status">
                  <span className={`w-1.5 h-1.5 rounded-full ${nurseReq?.status === "APPROVED" ? "bg-emerald-600" : "bg-slate-400"}`} />
                  <span className={nurseReq?.status === "APPROVED" ? "text-emerald-700  font-medium" : "text-slate-600 font-medium"}>
                    {nurseReq?.status === "APPROVED" ? `Nurse: ${nurseReq.nurseName || "Linked"}` : "Nurse: Unlinked"}
                  </span>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1.5" title="NPG hardware gateway allocation status">
                  <span className={`w-1.5 h-1.5 rounded-full ${hasActiveDevice ? "bg-emerald-600" : "bg-slate-400"}`} />
                  <span className={hasActiveDevice ? "text-emerald-700  font-medium" : "text-slate-600 font-medium"}>
                    {hasActiveDevice ? `Gateway: ${assignedDevice?.deviceId}` : "Gateway: Unassigned"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <ThemeToggle />

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white  border border-slate-300 text-slate-800 hover:bg-slate-50 :bg-slate-700 transition shadow-xs"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-teal-600" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition shadow-xs"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white  border border-slate-300 text-slate-700 hover:text-red-600 hover:border-red-200 transition shadow-xs"
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
            className={`p-3 rounded-lg text-xs font-medium leading-relaxed border flex items-center justify-between shadow-xs ${
              notice.isError
                ? "bg-red-50 border-red-200 text-red-700   "
                : "bg-emerald-50 border-emerald-200 text-emerald-800   "
            }`}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="p-1 hover:opacity-75 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">

        {/* SECTION 1: BED STATUS & BED ASSIGNMENT APPROVAL */}
        <section className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-slate-100 text-teal-800 shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                  Bed Allocation &amp; Assignment
                </h2>
                <p className="text-xs text-slate-600">
                  Hospital bed registration requires explicit patient authorization before confirmation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasConfirmedBed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200   ">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmed: {patient?.bedLabel}</span>
                </span>
              ) : hasPendingBedProposal ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200   ">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Pending Patient Approval</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200  border-slate-300 ">
                  <span>No Bed Assigned</span>
                </span>
              )}
            </div>
          </div>

          {/* Pending Bed Assignment Banner (Approve / Reject Action) */}
          {hasPendingBedProposal && (
            <div className="p-4 rounded-xl bg-[#FBF5EC]  border border-[#F0DCBE]  space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#A86B24] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-[#28211B] ">
                    Proposed Bed Assignment: <span className="text-[#A86B24] font-mono text-base font-bold">{patient?.pendingBedLabel}</span>
                  </h3>
                  <p className="text-xs text-[#6F6256]  leading-relaxed">
                    Your clinical nurse has proposed Bed <strong className="text-[#28211B] ">{patient?.pendingBedLabel}</strong>.
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
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#183A4A] hover:bg-[#122C38]  :bg-[#2A5256] text-white transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{actionInProgress === "approve_bed" ? "Approving..." : `Approve Bed ${patient?.pendingBedLabel}`}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectBed}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-rose-300  text-rose-700  hover:bg-rose-50 :bg-rose-950/40 transition disabled:opacity-50"
                >
                  {actionInProgress === "reject_bed" ? "Declining..." : "Decline"}
                </button>
              </div>
            </div>
          )}

          {/* Confirmed Bed Details Summary */}
          {!hasPendingBedProposal && hasConfirmedBed && (
            <div className="p-3.5 rounded-xl bg-slate-50  border border-slate-300 shadow-xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Current Confirmed Bed: <strong className="text-slate-900 font-mono">{patient?.bedLabel}</strong></span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded   ">
                OCCUPIED &bull; ACTIVE
              </span>
            </div>
          )}

          {/* Nurse Link Authorization Banner if pending */}
          {nurseReq?.status === "PENDING" && (
            <div className="p-4 rounded-xl bg-teal-50/50  border border-teal-200  space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-teal-800 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    <span>Care Link Request from Nurse: {nurseReq.nurseName || "Staff Nurse"}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800   border border-amber-200 ">
                      AWAITING PATIENT APPROVAL
                    </span>
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Nurse <strong>{nurseReq.nurseName}</strong> has sent a care link request to connect with your bedside station
                    {patient?.pendingBedLabel ? (
                      <> for bed <strong className="font-mono text-slate-900 ">{patient.pendingBedLabel}</strong></>
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
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{actionInProgress === "approve_nurse" ? "Approving..." : "Approve Care Request"}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectNurse}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 shadow-xs text-slate-700 hover:text-red-600 hover:border-red-200 transition"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Nurse Care Link Confirmed Banner */}
          {nurseReq?.status === "APPROVED" && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200  flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-white  text-emerald-700  border border-emerald-200  shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-slate-900">
                      Attending Nurse: <span className="font-semibold text-emerald-700 ">{nurseReq.nurseName || "Assigned Nurse"}</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100  text-emerald-800 ">
                      CONNECTED
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Care link is active. Your bedside requests and alerts dispatch directly to {nurseReq.nurseName || "your attending nurse"}&apos;s station.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span className="text-xs text-emerald-700  font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Online</span>
                </span>
              </div>
            </div>
          )}

          {/* Nurse Unlinked / Care Link Inactive Banner */}
          {(!nurseReq || nurseReq.status === "NONE" || nurseReq.status === "REJECTED") && (
            <div className="p-3.5 rounded-xl bg-slate-50  border border-slate-300 shadow-xs flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700">
                <Shield className="w-4 h-4 text-slate-400" />
                <span>Attending Nurse: <strong className="text-slate-800">Unlinked</strong> &bull; <span className="italic">Awaiting care link from attending nurse station</span></span>
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-100 border border-slate-300">
                UNLINKED
              </span>
            </div>
          )}
        </section>

        {/* SECTION 2: ALLOCATED NPG DEVICE STATUS */}
        <section className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-slate-100 text-teal-800 shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                  NPG Device Allocation
                </h2>
                <p className="text-xs text-slate-600">
                  Strict 1-to-1 bedside hardware gateway assignment
                </p>
              </div>
            </div>

            {hasActiveDevice ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200   ">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>DEVICE ALLOCATED</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200  border-slate-300 ">
                <span>NO DEVICE ASSIGNED</span>
              </span>
            )}
          </div>

          {hasActiveDevice && assignedDevice ? (
            <div className="p-4 rounded-xl bg-slate-50  border border-slate-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Gateway: <span className="font-mono text-teal-800">{assignedDevice.name || assignedDevice.deviceId}</span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  ID: <span className="font-mono">{assignedDevice.deviceId}</span> &bull; Status: <span className="text-emerald-700  font-medium">{assignedDevice.status}</span> &bull; Telemetry: <span className="text-slate-800 font-medium">{assignedDevice.connectivityStatus || "ONLINE"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {assignedDevice.connectivityStatus === "ONLINE" && assignedDevice.batteryLevel !== undefined && assignedDevice.batteryLevel !== null && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight inline-flex items-center gap-1 ${
                      assignedDevice.batteryLevel > 50
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                        : assignedDevice.batteryLevel > 20
                        ? "bg-amber-50 text-amber-800 border border-amber-200   "
                        : "bg-red-50 text-red-800 border border-red-200   "
                    }`}
                    title={`Battery: ${assignedDevice.batteryLevel}%`}
                  >
                    <span>{assignedDevice.batteryLevel}%</span>
                  </span>
                )}
                <span className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium   ">
                  Operational
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200  text-xs text-amber-800  space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>No NPG Gateway Assigned Yet</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-700 ">
                Bedside gaze &amp; gesture triggers require an active NPG hardware device. Please ask your attending nurse to allocate an available online device to your bedside.
              </p>
            </div>
          )}
        </section>

        {/* SECTION 3: BEDSIDE GAZE & GESTURE COMMANDS */}
        <section className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Bedside Gaze &amp; Gesture Commands
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                  {displayedGestures.length} Total Gestures
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Calibrated sensor triggers detected by EOG forehead blinks &amp; wrist EMG sensors
              </p>
            </div>

            {isCommandsEnabled ? (
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5    self-start sm:self-auto">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Commands Active &bull; Live Telemetry</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1.5  border-slate-300  self-start sm:self-auto">
                <Lock className="w-3.5 h-3.5" />
                <span>Commands Locked (Preview Mode)</span>
              </span>
            )}
          </div>

          {/* Prerequisite status notice if commands are locked */}
          {!isCommandsEnabled && (
            <div className="p-4 rounded-xl bg-slate-50  border border-slate-300 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Lock className="w-4 h-4 text-slate-500" />
                <span>Commands Activation Prerequisites (Reference Mode)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`p-2.5 rounded-lg border ${hasConfirmedBed ? "bg-emerald-50 border-emerald-200 text-emerald-800   " : "bg-white border-slate-300 text-slate-700"}`}>
                  <div className="font-semibold flex items-center gap-1.5">
                    {hasConfirmedBed ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-red-600" />}
                    <span>1. Hospital Bed Confirmation</span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {hasConfirmedBed ? `Confirmed on Bed ${patient?.bedLabel}` : "Requires approved bed assignment by nurse"}
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${hasActiveDevice ? "bg-emerald-50 border-emerald-200 text-emerald-800   " : "bg-white border-slate-300 text-slate-700"}`}>
                  <div className="font-semibold flex items-center gap-1.5">
                    {hasActiveDevice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-red-600" />}
                    <span>2. NPG Hardware Gateway Link</span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {hasActiveDevice ? `Linked to ${assignedDevice?.name || assignedDevice?.deviceId}` : "Nurse must allocate an online NPG device"}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                All gestures below are calibrated and will instantly become functional once both prerequisites are confirmed.
              </p>
            </div>
          )}

          {/* ACTIVE REQUEST LIMIT REACHED BANNER */}
          {isRequestLimitReached && (
            <div className="p-3.5 rounded-xl bg-red-50  border border-red-200  text-red-800  text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
              <div>
                <strong>Active Request Limit Reached ({MAX_ACTIVE_REQUESTS_PER_PATIENT} Calls Pending):</strong> Please wait for nursing staff to handle and resolve your existing requests. Only <strong>Emergency</strong> alerts can be sent until pending requests are resolved.
              </div>
            </div>
          )}

          {/* 7 GESTURES CLEAN TABLE */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50  text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 font-mono">ID</th>
                  <th className="py-2.5 px-3">Hardware Gesture Trigger</th>
                  <th className="py-2.5 px-3 text-center">Blinks (EOG)</th>
                  <th className="py-2.5 px-3 text-center">Left Squeezes (EMG)</th>
                  <th className="py-2.5 px-3 text-center">Right Squeezes (EMG)</th>
                  <th className="py-2.5 px-3 text-center">Hands Together</th>
                  <th className="py-2.5 px-3 font-bold">Action / Command</th>
                  <th className="py-2.5 px-3">Urgency &amp; Alarm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100  text-slate-800">
                {displayedGestures.map((item) => {
                  const isAlarm = item.urgency.includes("Alarm");
                  const isUrgent = item.urgency.startsWith("Urgent");

                  return (
                    <tr
                      key={item.id}
                      className={`transition hover:bg-slate-50/70 :bg-slate-800/40 ${
                        isAlarm ? "bg-red-50/40 " : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-teal-800 ">
                        {item.id}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900">
                        {item.gesture}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-center text-teal-700 ">
                        {item.blinks}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-center">
                        {item.left}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-center">
                        {item.right}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {item.together ? (
                          <span className="font-semibold text-emerald-700 ">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold font-mono tracking-wide text-slate-900">
                        {item.name}
                      </td>
                      <td className="py-3 px-3">
                        {isAlarm ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50  text-red-700  border border-red-200 ">
                            <span>Urgent, Alarm (RGB Flash)</span>
                          </span>
                        ) : isUrgent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800  border border-amber-200 ">
                            <span>Urgent</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-300">
                            Standard
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-600 pt-1">
            <span>Every gesture must be completed within 5 seconds.</span>
            <span>Channel map: Blinks (CH3) &bull; Left Squeezes (CH1) &bull; Right Squeezes (CH2)</span>
          </div>
        </section>

        {/* SECTION 4: MY CARE REQUEST LEDGER */}
        <section className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                My Care Request Ledger
              </h2>
              <p className="text-xs text-slate-600">
                Complete audit history of all bedside gestures transmitted to the nursing station
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                {requests.length} Total Calls
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100  max-h-[600px] overflow-y-auto pr-1">
            {requests.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-600">
                No care calls recorded yet. Commands triggered via your bedside gateway will appear here in real-time.
              </div>
            ) : (
              requests.map((req) => (
                <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 :bg-slate-800/40 px-2 rounded-lg transition">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        req.status === "RESOLVED"
                          ? "bg-emerald-600"
                          : req.status === "IN_PROGRESS"
                          ? "bg-teal-600"
                          : req.status === "ACKNOWLEDGED"
                          ? "bg-amber-500"
                          : "bg-red-500 animate-pulse"
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                        {new Date(req.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })} &bull; Gateway: {req.device?.name || req.device?.deviceId || "Gateway"}
                      </div>
                      {req.patientDisputedAt && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600  font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>You reported care was NOT received — Nurse re-alerted</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      req.status === "RESOLVED"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                        : req.status === "IN_PROGRESS"
                        ? req.patientDisputedAt
                          ? "bg-red-50 text-red-800 border border-red-200    animate-pulse"
                          : "bg-slate-100 text-slate-700 border border-slate-200   border-slate-300"
                        : req.status === "ACKNOWLEDGED"
                        ? "bg-amber-50 text-amber-800 border border-amber-200   "
                        : "bg-red-50 text-red-800 border border-red-200   "
                    }`}
                  >
                    {req.status === "IN_PROGRESS" && req.patientDisputedAt ? "DISPUTED / REJECTED" : req.status}
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
