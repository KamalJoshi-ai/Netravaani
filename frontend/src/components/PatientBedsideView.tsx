"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient, PatientItem, CareRequestItem, CommandRuleItem } from "@/lib/api";
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

export interface DisplayGesture {
  id: string;
  label: string;
  displayLabel: string;
  instruction: string;
  eogText?: string;
  emgText?: string;
  speechPhrase: string;
  urgent?: boolean;
  alarm?: boolean;
}

export const ALL_STANDARD_GESTURES: DisplayGesture[] = [
  {
    id: "yes",
    label: "YES",
    displayLabel: "YES / Affirmative",
    instruction: "Blink 2 times and pause to confirm yes or affirmative.",
    eogText: "2–3 blinks, pause",
    speechPhrase: 'Station hears: "Patient is saying YES"',
  },
  {
    id: "water",
    label: "WATER",
    displayLabel: "Drinking Water",
    instruction: "Blink 4 or more rapid times to request drinking water.",
    eogText: "4+ rapid blinks",
    speechPhrase: 'Station hears: "Patient wants water"',
  },
  {
    id: "no",
    label: "NO",
    displayLabel: "NO / Negative",
    instruction: "Squeeze both hands together firmly once to indicate negative or decline.",
    emgText: "Both hands paired squeeze once",
    speechPhrase: 'Station hears: "Patient is saying NO"',
  },
  {
    id: "call_nurse",
    label: "CALL NURSE",
    displayLabel: "Call Bedside Nurse",
    instruction: "Squeeze left hand 3 distinct times to summon attending nurse.",
    emgText: "Left hand 3 distinct squeezes",
    urgent: true,
    speechPhrase: 'Station hears: "Patient is requesting call nurse"',
  },
  {
    id: "adjustment",
    label: "ADJUSTMENT",
    displayLabel: "Bed / Posture Adjustment",
    instruction: "Squeeze right hand 3 distinct times to request bed, back, or pillow adjustment.",
    emgText: "Right hand 3 distinct squeezes",
    speechPhrase: 'Station hears: "Patient wants an adjustment"',
  },
  {
    id: "emergency",
    label: "EMERGENCY / SEVERE PAIN",
    displayLabel: "Emergency / Severe Pain",
    instruction: "Squeeze both hands together 3 rapid times for acute emergency & pain alert.",
    emgText: "Both hands 3+ times together",
    urgent: true,
    alarm: true,
    speechPhrase: 'Station hears: "Patient is in emergency or severe pain"',
  },
];

interface PatientBedsideViewProps {
  patientCode?: string;
  onClose?: () => void;
}

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
      return deviceRules.map((r) => {
        let eogText: string | undefined;
        if (r.eog && (r.eog[0] > 0 || r.eog[1] > 0)) {
          eogText = r.eog[0] >= 4 ? `${r.eog[0]}+ rapid blinks` : `${r.eog[0]}–${r.eog[1]} blinks, pause`;
        }

        let emgText: string | undefined;
        if (r.simultaneous && r.emgLeft && r.emgRight && r.emgLeft[0] > 0 && r.emgRight[0] > 0) {
          emgText = `Both hands paired (${r.emgLeft[0]} squeeze${r.emgLeft[0] > 1 ? "s" : ""})`;
        } else if (r.emgLeft && r.emgLeft[0] > 0) {
          emgText = `Left hand (${r.emgLeft[0]} squeeze${r.emgLeft[0] > 1 ? "s" : ""})`;
        } else if (r.emgRight && r.emgRight[0] > 0) {
          emgText = `Right hand (${r.emgRight[0]} squeeze${r.emgRight[0] > 1 ? "s" : ""})`;
        }

        const instruction = [eogText, emgText].filter(Boolean).join(" and ") || "Firmware-calibrated gesture trigger";

        return {
          id: r.id || r.label,
          label: r.label,
          displayLabel: r.displayLabel?.trim() || r.label,
          instruction,
          eogText,
          emgText,
          speechPhrase: `Station hears: "${r.speechTemplate || "is saying {command}"}"`,
          urgent: r.urgent,
          alarm: r.alarm,
        };
      });
    }
    return ALL_STANDARD_GESTURES;
  }, [deviceRules]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] flex items-center justify-center p-6 text-[#28211B] dark:text-[#F2ECE1]">
        <div className="flex items-center gap-3 bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl px-5 py-3 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-[#8C4327] dark:bg-[#D49D4F] animate-pulse" />
          <span className="text-sm font-serif font-medium text-[#28211B] dark:text-[#F2ECE1]">Connecting to Patient Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] text-[#28211B] dark:text-[#F2ECE1] flex flex-col font-sans transition-colors duration-150">
      {/* Top Header */}
      <header className="border-b border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#0D0D0E] sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Identity & Role Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1D2D38] dark:bg-[#151C20] text-[#FAF6F0] flex items-center justify-center font-serif font-bold text-sm shrink-0 shadow-xs border border-[#8C4327]/30">
              PT
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-serif text-lg sm:text-xl font-bold text-[#28211B] dark:text-[#F2ECE1] tracking-tight">
                  Patient Dashboard
                </span>
                <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-md bg-[#8C4327] text-white tracking-wider uppercase shadow-xs">
                  PATIENT
                </span>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                  {patient?.patientCode || "PT-ACTIVE"}
                </span>
              </div>
              <div className="text-xs text-[#6F6256] dark:text-[#9E9689] font-normal flex items-center gap-2 mt-0.5 flex-wrap">
                <span>Account: <strong className="font-serif text-[#28211B] dark:text-[#F2ECE1] font-medium">{patient?.displayName || user?.name}</strong></span>
                {user?.username && <span>(@{user.username})</span>}
                <span>&bull;</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isCommandsEnabled ? "bg-[#2E6243]" : "bg-[#A36F1C]"}`} />
                  <span className={isCommandsEnabled ? "text-[#2E6243] dark:text-[#4AA86C] font-serif font-medium" : "text-[#A36F1C] dark:text-[#D49D4F] font-serif font-medium"}>
                    {isCommandsEnabled ? "Commands Operational" : "Awaiting Clinical Assignments"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
            <ThemeToggle />

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-serif font-medium bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] hover:border-[#8C4327] dark:hover:border-[#D49D4F] transition shadow-xs"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#8C4327] dark:text-[#D49D4F]" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#183A4A] hover:bg-[#122C38] text-white transition shadow-xs"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689] hover:text-[#B54747] hover:border-[#F2C4C4] hover:bg-[#FDF1F1] dark:hover:bg-[#1A1A1E] transition shadow-xs"
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
            className={`p-3 rounded-xl text-xs font-medium leading-relaxed border flex items-center justify-between shadow-xs ${
              notice.isError
                ? "bg-[#FDF1F1] border-[#F2C4C4] text-[#B54747]"
                : "bg-[#EAF3EF] border-[#BEDECE] text-[#287A59]"
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
        <section className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DCD2C0] dark:border-[#222226] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#ECE3D4] dark:bg-[#141416] text-[#183A4A] dark:text-[#B9D8D2] border border-[#DCD2C0] dark:border-[#222226] shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                  Bed Allocation &amp; Assignment
                </h2>
                <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                  Hospital bed registration requires explicit patient authorization before confirmation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasConfirmedBed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#EAF3EF] text-[#287A59] border border-[#BEDECE] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmed: {patient?.bedLabel}</span>
                </span>
              ) : hasPendingBedProposal ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#FBF5EC] text-[#A86B24] border border-[#F0DCBE] dark:bg-[#A86B24]/15 dark:border-[#A86B24]/30 dark:text-[#FBBF24]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Pending Patient Approval</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#ECE3D4] text-[#6F6256] border border-[#DCD2C0] dark:bg-[#141416] dark:border-[#222226] dark:text-[#9E9689]">
                  <span>No Bed Assigned</span>
                </span>
              )}
            </div>
          </div>

          {/* Pending Bed Assignment Banner (Approve / Reject Action) */}
          {hasPendingBedProposal && (
            <div className="p-4 rounded-xl bg-[#FBF5EC] dark:bg-[#141416] border border-[#F0DCBE] dark:border-[#222226] space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#A86B24] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-[#28211B] dark:text-[#F2ECE1]">
                    Proposed Bed Assignment: <span className="text-[#A86B24] font-mono text-base font-bold">{patient?.pendingBedLabel}</span>
                  </h3>
                  <p className="text-xs text-[#6F6256] dark:text-[#9E9689] leading-relaxed">
                    Your clinical nurse has proposed Bed <strong className="text-[#28211B] dark:text-white">{patient?.pendingBedLabel}</strong>.
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
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#183A4A] hover:bg-[#122C38] dark:bg-[#376B70] dark:hover:bg-[#2A5256] text-white transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{actionInProgress === "approve_bed" ? "Approving..." : `Approve Bed ${patient?.pendingBedLabel}`}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectBed}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#B54747] text-[#B54747] hover:bg-[#FDF1F1] dark:hover:bg-[#1A1A1E] transition disabled:opacity-50"
                >
                  {actionInProgress === "reject_bed" ? "Declining..." : "Decline"}
                </button>
              </div>
            </div>
          )}

          {/* Confirmed Bed Details Summary */}
          {!hasPendingBedProposal && hasConfirmedBed && (
            <div className="p-3.5 rounded-xl bg-[#ECE3D4]/50 dark:bg-[#050505] border border-[#DCD2C0] dark:border-[#222226] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#6F6256] dark:text-[#9E9689]">
                <CheckCircle2 className="w-4 h-4 text-[#287A59]" />
                <span>Current Confirmed Bed: <strong className="text-[#28211B] dark:text-[#F2ECE1] font-mono">{patient?.bedLabel}</strong></span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-[#287A59] bg-[#EAF3EF] border border-[#BEDECE] px-2.5 py-0.5 rounded dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]">
                OCCUPIED &bull; ACTIVE
              </span>
            </div>
          )}

          {/* Nurse Link Authorization Banner if pending */}
          {nurseReq?.status === "PENDING" && (
            <div className="p-4 rounded-xl bg-[#EAF0F3] dark:bg-[#141416] border border-[#C2D4DC] dark:border-[#222226] space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#183A4A] dark:text-[#B9D8D2] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-[#28211B] dark:text-[#F2ECE1] flex items-center gap-2">
                    <span>Care Link Request from Nurse: {nurseReq.nurseName || "Staff Nurse"}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ECE3D4] text-[#183A4A] dark:bg-[#141416] dark:text-[#B9D8D2] border border-[#DCD2C0] dark:border-[#222226]">
                      AWAITING PATIENT APPROVAL
                    </span>
                  </h3>
                  <p className="text-xs text-[#6F6256] dark:text-[#9E9689] leading-relaxed">
                    Nurse <strong>{nurseReq.nurseName}</strong> has sent a care link request to connect with your bedside station
                    {patient?.pendingBedLabel ? (
                      <> for bed <strong className="font-mono text-[#28211B] dark:text-white">{patient.pendingBedLabel}</strong></>
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
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#183A4A] hover:bg-[#122C38] dark:bg-[#376B70] dark:hover:bg-[#2A5256] text-white transition flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{actionInProgress === "approve_nurse" ? "Approving..." : "Approve Care Request"}</span>
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={handleRejectNurse}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689] hover:text-[#B54747] hover:border-[#F2C4C4] transition"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 2: ALLOCATED NPG DEVICE STATUS */}
        <section className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#ECE3D4] dark:bg-[#141416] text-[#183A4A] dark:text-[#B9D8D2] border border-[#DCD2C0] dark:border-[#222226] shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                  NPG Assistive Device Allocation
                </h2>
                <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                  Strict 1-to-1 bedside hardware gateway assignment
                </p>
              </div>
            </div>

            {hasActiveDevice ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#EAF3EF] text-[#287A59] border border-[#BEDECE] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>DEVICE ALLOCATED</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#ECE3D4] text-[#6F6256] border border-[#DCD2C0] dark:bg-[#141416] dark:border-[#222226] dark:text-[#9E9689]">
                <span>NO DEVICE ASSIGNED</span>
              </span>
            )}
          </div>

          {hasActiveDevice && assignedDevice ? (
            <div className="p-4 rounded-xl bg-[#ECE3D4]/40 dark:bg-[#050505] border border-[#DCD2C0] dark:border-[#222226] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                  Gateway: <span className="font-mono text-[#183A4A] dark:text-[#B9D8D2]">{assignedDevice.name || assignedDevice.deviceId}</span>
                </div>
                <div className="text-xs text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                  ID: <span className="font-mono">{assignedDevice.deviceId}</span> &bull; Status: <span className="text-[#287A59] font-medium">{assignedDevice.status}</span> &bull; Telemetry: <span className="text-[#376B70] dark:text-[#B9D8D2] font-medium">{assignedDevice.connectivityStatus || "ONLINE"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded bg-[#EAF3EF] border border-[#BEDECE] text-[#287A59] font-medium dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]">
                  Operational
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#FBF5EC] dark:bg-[#141416] border border-[#F0DCBE] dark:border-[#222226] text-xs text-[#A86B24] space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#A86B24]" />
                <span>No NPG Gateway Assigned Yet</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#6F6256] dark:text-[#9E9689]">
                Bedside gaze &amp; gesture triggers require an active NPG hardware device. Please ask your attending nurse to allocate an available online device to your bedside.
              </p>
            </div>
          )}
        </section>

        {/* SECTION 3: BEDSIDE GAZE & GESTURE COMMANDS */}
        <section className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DCD2C0] dark:border-[#222226] pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">
                  Bedside Gaze &amp; Gesture Commands
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                  {displayedGestures.length} Total Gestures
                </span>
              </div>
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                Calibrated sensor triggers detected by EOG forehead blinks &amp; wrist EMG sensors
              </p>
            </div>

            {isCommandsEnabled ? (
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EAF3EF] text-[#287A59] border border-[#BEDECE] flex items-center gap-1.5 dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80] self-start sm:self-auto">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Commands Active &bull; Live Telemetry</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#ECE3D4] text-[#6F6256] border border-[#DCD2C0] flex items-center gap-1.5 dark:bg-[#141416] dark:border-[#222226] dark:text-[#9E9689] self-start sm:self-auto">
                <Lock className="w-3.5 h-3.5" />
                <span>Commands Locked (Previewing Gestures)</span>
              </span>
            )}
          </div>

          {/* Prerequisite status notice if commands are locked */}
          {!isCommandsEnabled && (
            <div className="p-4 rounded-xl bg-[#ECE3D4]/40 dark:bg-[#141416]/60 border border-[#DCD2C0] dark:border-[#222226] space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8C4327] dark:text-[#D49D4F]">
                <Lock className="w-4 h-4" />
                <span>Commands Activation Prerequisites (Reference Mode)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`p-2.5 rounded-lg border ${hasConfirmedBed ? "bg-[#EAF3EF] border-[#BEDECE] text-[#287A59] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]" : "bg-[#FAF6F0] dark:bg-[#0D0D0E] border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689]"}`}>
                  <div className="font-serif font-semibold flex items-center gap-1.5">
                    {hasConfirmedBed ? <Check className="w-3.5 h-3.5 text-[#287A59]" /> : <X className="w-3.5 h-3.5 text-[#B54747]" />}
                    <span>1. Hospital Bed Confirmation</span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {hasConfirmedBed ? `Confirmed on Bed ${patient?.bedLabel}` : "Requires approved bed assignment by nurse"}
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${hasActiveDevice ? "bg-[#EAF3EF] border-[#BEDECE] text-[#287A59] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]" : "bg-[#FAF6F0] dark:bg-[#0D0D0E] border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689]"}`}>
                  <div className="font-serif font-semibold flex items-center gap-1.5">
                    {hasActiveDevice ? <Check className="w-3.5 h-3.5 text-[#287A59]" /> : <X className="w-3.5 h-3.5 text-[#B54747]" />}
                    <span>2. NPG Hardware Gateway Link</span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {hasActiveDevice ? `Linked to ${assignedDevice?.name || assignedDevice?.deviceId}` : "Nurse must allocate an online NPG device"}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[#6F6256] dark:text-[#9E9689]">
                All gestures below are calibrated and will instantly become functional once both prerequisites are confirmed.
              </p>
            </div>
          )}

          {/* ALL GESTURES GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {displayedGestures.map((r) => {
              const isAlarm = Boolean(r.alarm);
              const isUrgent = Boolean(r.urgent);

              return (
                <div
                  key={r.id || r.label}
                  className={`p-4 rounded-xl border space-y-2.5 transition shadow-xs flex flex-col justify-between ${
                    isAlarm
                      ? "border-[#F2C4C4] dark:border-[#B54747]/40 bg-[#FDF1F1]/70 dark:bg-[#201012]"
                      : isUrgent
                      ? "border-[#F0DCBE] dark:border-[#A86B24]/40 bg-[#FBF5EC]/70 dark:bg-[#1C160F]"
                      : "border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#0D0D0E] hover:border-[#8C4327]/50"
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Header: Label and Command Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-serif font-bold text-sm ${
                          isAlarm
                            ? "text-[#B54747] dark:text-[#F87171] flex items-center gap-1.5"
                            : isUrgent
                            ? "text-[#A86B24] dark:text-[#FBBF24]"
                            : "text-[#28211B] dark:text-[#F2ECE1]"
                        }`}
                      >
                        {isAlarm && <AlertTriangle className="w-4 h-4 text-[#B54747] shrink-0" />}
                        <span>{r.displayLabel || r.label}</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isAlarm
                            ? "bg-[#B54747] text-white"
                            : isUrgent
                            ? "bg-[#A86B24] text-white"
                            : "bg-[#ECE3D4] dark:bg-[#141416] text-[#6F6256] dark:text-[#9E9689] border border-[#DCD2C0] dark:border-[#222226]"
                        }`}
                      >
                        [cmd] {r.label}
                      </span>
                    </div>

                    {/* Plain English How-To Instruction */}
                    <p className="text-xs text-[#28211B] dark:text-[#F2ECE1] font-medium leading-relaxed">
                      {r.instruction}
                    </p>
                  </div>

                  {/* Technical Sensor Metrics & Speech Phrase */}
                  <div className="pt-2 border-t border-[#DCD2C0]/60 dark:border-[#222226] space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                      {r.eogText && (
                        <span className="px-1.5 py-0.5 rounded bg-[#ECE3D4] dark:bg-[#141416] text-[#376B70] dark:text-[#B9D8D2] border border-[#DCD2C0] dark:border-[#222226]">
                          Forehead: {r.eogText}
                        </span>
                      )}
                      {r.emgText && (
                        <span className="px-1.5 py-0.5 rounded bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                          Wrist EMG: {r.emgText}
                        </span>
                      )}
                      {isAlarm && (
                        <span className="px-1.5 py-0.5 rounded bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323] font-bold">
                          ALARM FLASH
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] italic">
                      {r.speechPhrase}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: MY CARE REQUEST LEDGER */}
        <section className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCD2C0] dark:border-[#222226] pb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">
                My Care Request Ledger
              </h2>
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Complete audit history of all bedside gestures transmitted to the nursing station
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                {requests.length} Total Calls (All Displayed)
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#DCD2C0] dark:divide-[#222226] max-h-[600px] overflow-y-auto pr-1">
            {requests.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689]">
                No care calls recorded yet. Commands triggered via your bedside gateway will appear here in real-time.
              </div>
            ) : (
              requests.map((req) => (
                <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-[#F5EFE6]/50 dark:hover:bg-[#141416]/50 px-2 rounded-lg transition">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        req.status === "RESOLVED"
                          ? "bg-[#287A59]"
                          : req.status === "IN_PROGRESS"
                          ? "bg-[#376B70]"
                          : req.status === "ACKNOWLEDGED"
                          ? "bg-[#A86B24]"
                          : "bg-[#B54747] animate-pulse"
                      }`}
                    />
                    <div>
                      <div className="font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">
                        {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] font-mono mt-0.5">
                        {new Date(req.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })} &bull; Gateway: {req.device?.name || req.device?.deviceId || "Gateway"}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      req.status === "RESOLVED"
                        ? "bg-[#EAF3EF] text-[#287A59] border border-[#BEDECE] dark:bg-[#287A59]/15 dark:border-[#287A59]/30 dark:text-[#4ADE80]"
                        : req.status === "IN_PROGRESS"
                        ? "bg-[#EAF0F3] text-[#183A4A] border border-[#C2D4DC] dark:bg-[#141416] dark:text-[#B9D8D2] dark:border-[#222226]"
                        : req.status === "ACKNOWLEDGED"
                        ? "bg-[#FBF5EC] text-[#A86B24] border border-[#F0DCBE] dark:bg-[#A86B24]/15 dark:border-[#A86B24]/30 dark:text-[#FBBF24]"
                        : "bg-[#FDF1F1] text-[#B54747] border border-[#F2C4C4] dark:bg-[#B54747]/15 dark:border-[#B54747]/30 dark:text-[#F87171]"
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
