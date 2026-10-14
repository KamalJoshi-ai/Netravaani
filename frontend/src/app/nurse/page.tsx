"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  apiClient,
  CareRequestItem,
  CareRequestStatus,
  PatientItem,
  PredefinedCommandItem,
} from "@/lib/api";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Bed,
  Check,
  Play,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ArrowLeft,
  UserPlus,
  Radio,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

interface StepConfirmData {
  request: CareRequestItem;
  nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED";
  stepTitle: string;
  stepDescription: string;
  actionButtonLabel: string;
  actionButtonColor: string;
}

const ACTION_CONFIG: Record<
  string,
  {
    label: string;
    badge: string;
    border: string;
    bgTint: string;
    gestureDescription: string;
    serial: string;
  }
> = {
  YES: {
    label: "YES",
    badge: "bg-[#E8E2D7] text-[#1C140F] border-[#D6C7B7] font-bold",
    border: "border-[#D6C7B7]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "2 blinks, wait",
    serial: "[cmd] YES",
  },
  WATER: {
    label: "WATER",
    badge: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7] font-bold",
    border: "border-[#D6C7B7]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "4+ blinks",
    serial: "[cmd] WATER",
  },
  NO: {
    label: "NO",
    badge: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C] font-bold",
    border: "border-[#DFBA9C]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "Squeeze both hands together, once",
    serial: "[cmd] NO",
  },
  CALL_NURSE: {
    label: "CALL NURSE",
    badge: "bg-[#E5DFD7] text-[#1C140F] border-[#CEBEB0] font-bold",
    border: "border-[#CEBEB0]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "Squeeze left hand 3 times",
    serial: "[cmd] CALL NURSE",
  },
  EMERGENCY: {
    label: "EMERGENCY, LEDs 1–4 flash red",
    badge: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29] font-black",
    border: "border-[#C56845]",
    bgTint: "bg-[#EED9CD]/35",
    gestureDescription: "Squeeze both hands together, 3 times",
    serial: "[cmd] EMERGENCY / SEVERE PAIN",
  },
  // Legacy action fallbacks:
  NEED_WATER: {
    label: "WATER",
    badge: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7] font-bold",
    border: "border-[#D6C7B7]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "4+ blinks",
    serial: "[cmd] WATER",
  },
  NEED_ASSISTANCE: {
    label: "CALL NURSE",
    badge: "bg-[#E8E2D7] text-[#1C140F] border-[#D6C7B7] font-bold",
    border: "border-[#D6C7B7]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "Squeeze left hand 3 times",
    serial: "[cmd] CALL NURSE",
  },
  PAIN_DISCOMFORT: {
    label: "PAIN / DISCOMFORT",
    badge: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C] font-bold",
    border: "border-[#DFBA9C]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "Eyebrow Raise (2s)",
    serial: "[cmd] PAIN",
  },
  REPOSITION: {
    label: "REPOSITION",
    badge: "bg-[#E5DFD7] text-[#1C140F] border-[#CEBEB0] font-bold",
    border: "border-[#CEBEB0]",
    bgTint: "bg-[#FFFCF7]",
    gestureDescription: "Head Nod Up",
    serial: "[cmd] REPOSITION",
  },
};

export default function NurseDashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [commandsList, setCommandsList] = useState<PredefinedCommandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"ALL" | CareRequestStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CareRequestItem | null>(null);

  // In-place confirmation dialog state (does NOT jump to top)
  const [stepConfirm, setStepConfirm] = useState<StepConfirmData | null>(null);
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});
  const [nurseAssignLoading, setNurseAssignLoading] = useState<Record<string, boolean>>({});

  // Floating Toast notifications (bottom-right so page layout height never shifts)
  const [toastMsg, setToastMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => {
      setToastMsg((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  const fetchRequests = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await apiClient.getCareRequests();
      setRequests(res.data);
      if (isManual) {
        showToast("Care requests refreshed successfully.");
      }
    } catch (err: unknown) {
      if (isManual) {
        showToast(
          err instanceof Error ? err.message : "Failed to load requests from backend",
          true
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchPatientsAndCommands = useCallback(async () => {
    try {
      const [ptRes, cmdRes] = await Promise.all([
        apiClient.getPatients(),
        apiClient.getPredefinedCommands().catch(() => ({ data: [] })),
      ]);
      setPatients(ptRes.data);
      if (cmdRes.data?.length) {
        setCommandsList(cmdRes.data);
      }
    } catch {
      // Background fetch
    }
  }, []);

  useEffect(() => {
    fetchRequests(false);
    fetchPatientsAndCommands();

    // Silent background poll every 2.5s without jumping or refreshing screen
    const interval = setInterval(() => {
      fetchRequests(false);
      fetchPatientsAndCommands();
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchRequests, fetchPatientsAndCommands]);

  // Request assignment of nurse to patient
  const handleRequestPatientAssignment = async (patientCode: string) => {
    setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: true }));
    try {
      await apiClient.requestNurseAssignment(patientCode, {
        nurseName: user?.name || "Nurse on Duty",
        nurseId: user?.email || user?.name || "nurse",
        nurseRole: user?.role || "NURSE",
      });
      showToast(`Assignment request sent to patient ${patientCode}. Awaiting bedside approval.`);
      fetchPatientsAndCommands();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to request patient assignment",
        true
      );
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: false }));
    }
  };

  // Open the in-place confirmation dialog for a specific step
  const promptStepConfirmation = (
    req: CareRequestItem,
    nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED"
  ) => {
    const patientDisplay = req.patient?.displayName || "Bedside Patient";
    const bedDisplay = req.patient?.bedLabel || "Bed Unassigned";

    if (nextStep === "ACKNOWLEDGED") {
      setStepConfirm({
        request: req,
        nextStep: "ACKNOWLEDGED",
        stepTitle: "Confirm Next Step: Acknowledge Request",
        stepDescription: `Acknowledge bedside request for ${patientDisplay} (${bedDisplay})? This confirms to the station and bedside unit that nursing staff has registered the call.`,
        actionButtonLabel: "Confirm Acknowledgement",
        actionButtonColor: "bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7]",
      });
    } else if (nextStep === "IN_PROGRESS") {
      setStepConfirm({
        request: req,
        nextStep: "IN_PROGRESS",
        stepTitle: "Confirm Next Step: Start Handling (In Progress)",
        stepDescription: `Mark this request as In-Progress for ${patientDisplay} (${bedDisplay})? This notifies all staff that you are actively responding.`,
        actionButtonLabel: "Confirm In-Progress",
        actionButtonColor: "bg-[#EED9CD] hover:bg-[#DFBA9C] text-[#7A361E] border border-[#D6C7B7]",
      });
    } else if (nextStep === "RESOLVED") {
      setStepConfirm({
        request: req,
        nextStep: "RESOLVED",
        stepTitle: "Confirm Next Step: Resolve Care Request",
        stepDescription: `Mark this bedside care request as Resolved for ${patientDisplay} (${bedDisplay})? This will complete the clinical care lifecycle record.`,
        actionButtonLabel: "Confirm Resolution",
        actionButtonColor: "bg-[#30251F] hover:bg-[#45362E] text-[#FFFCF7]",
      });
    }
  };

  // Execute confirmation in-place WITHOUT jumping to top
  const handleConfirmNextStep = async () => {
    if (!stepConfirm) return;
    const { request, nextStep } = stepConfirm;
    const reqId = request._id;

    // Capture exact viewport scroll position to guarantee the page stays right there
    const savedScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    setActionLoadingMap((prev) => ({ ...prev, [reqId]: true }));

    try {
      let updatedRes: CareRequestItem | undefined;
      if (nextStep === "ACKNOWLEDGED") {
        const res = await apiClient.acknowledgeCareRequest(reqId);
        updatedRes = res.data;
        showToast(`Request acknowledged for ${request.patient?.displayName || "Patient"}.`);
      } else if (nextStep === "IN_PROGRESS") {
        const res = await apiClient.startHandlingCareRequest(reqId);
        updatedRes = res.data;
        showToast(`Request moved to In-Progress for ${request.patient?.displayName || "Patient"}.`);
      } else if (nextStep === "RESOLVED") {
        const res = await apiClient.resolveCareRequest(reqId);
        updatedRes = res.data;
        showToast(`Request marked as Resolved for ${request.patient?.displayName || "Patient"}.`);
      }

      if (updatedRes) {
        setRequests((prev) => prev.map((r) => (r._id === reqId ? updatedRes! : r)));
        if (selectedRequest?._id === reqId) {
          setSelectedRequest(updatedRes);
        }
      }

      setStepConfirm(null);

      // Restore scroll position instantly so the user does NOT get pulled to top of page
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollY, behavior: "instant" });
        });
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to execute next step", true);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [reqId]: false }));
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete all care request records from history?")) return;
    try {
      const res = await apiClient.clearAllCareRequests();
      showToast(`Cleared all ${res.data?.deletedCount || 0} care requests.`);
      setSelectedRequest(null);
      await fetchRequests(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to clear requests", true);
    }
  };

  const handleResolveAll = async () => {
    try {
      const res = await apiClient.resolveAllCareRequests();
      showToast(`All ${res.data?.modifiedCount || 0} open requests marked as RESOLVED.`);
      await fetchRequests(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to resolve open requests", true);
    }
  };

  // Sort and filter requests
  const sortedAndFilteredRequests = useMemo(() => {
    return requests
      .filter((req) => {
        if (filter !== "ALL" && req.status !== filter) return false;
        if (!searchQuery.trim()) return true;

        const q = searchQuery.toLowerCase();
        const pName = req.patient?.displayName?.toLowerCase() || "";
        const pCode = req.patient?.patientCode?.toLowerCase() || "";
        const pBed = req.patient?.bedLabel?.toLowerCase() || "";
        const dId = req.device?.deviceId?.toLowerCase() || "";
        const act = req.action.toLowerCase();
        const gest = (req.gesture || "").toLowerCase();

        return (
          pName.includes(q) ||
          pCode.includes(q) ||
          pBed.includes(q) ||
          dId.includes(q) ||
          act.includes(q) ||
          gest.includes(q)
        );
      })
      .sort((a, b) => {
        // Keep order predictable so cards don't jump around
        if (a.status === "NEW" && b.status !== "NEW") return -1;
        if (a.status !== "NEW" && b.status === "NEW") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [requests, filter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    return {
      all: requests.length,
      new: requests.filter((r) => r.status === "NEW").length,
      acknowledged: requests.filter((r) => r.status === "ACKNOWLEDGED").length,
      inProgress: requests.filter((r) => r.status === "IN_PROGRESS").length,
      resolved: requests.filter((r) => r.status === "RESOLVED").length,
    };
  }, [requests]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center text-[#1C140F] font-serif font-bold text-lg tracking-wide">
        Authenticating clinical session...
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1C140F] flex flex-col font-sans selection:bg-[#EED9CD] selection:text-[#1C140F]">
      {/* Top Editorial Masthead Header */}
      <header className="border-b border-[#E7DFD4] bg-[#FFFCF7]/95 backdrop-blur-md sticky top-0 z-40 shadow-[0_1px_4px_rgba(48,37,31,0.06)]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-[#1C140F] text-[#FFFCF7] flex items-center justify-center font-serif font-black text-lg shadow-sm border border-[#1C140F]">
              NV
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-serif text-2xl font-black tracking-tight text-[#1C140F]">
                  NetraVaani
                </span>
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  Clinical Nurse Station
                </span>
              </div>
              <span className="text-xs text-[#30251F] block font-serif font-semibold italic">
                Bedside Care Requests &amp; In-Place Rapid Response Ledger
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pr-2 border-r border-[#E7DFD4]">
              <span className="text-xs font-mono font-bold text-[#1C140F] bg-[#F5F0E8] border border-[#E7DFD4] px-2.5 py-1 rounded-lg">
                {user.name} ({user.role})
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-xs font-bold text-[#75665D] hover:text-[#C56845] px-2 py-1 rounded-lg hover:bg-[#EED9CD]/40 transition"
              >
                Sign out
              </button>
            </div>

            {/* Bedside Patient Portal Direct Link */}
            <Link
              href="/patient"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#EED9CD] text-[#7A361E] hover:bg-[#DFBA9C] border border-[#D6C7B7] transition shadow-xs"
              title="Open Bedside Patient Portal"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Bedside Portal</span>
            </Link>

            {/* Bulk Actions */}
            {requests.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleResolveAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#FFFCF7] text-[#7A361E] hover:bg-[#EED9CD]/60 border border-[#D6C7B7] transition shadow-xs"
                  title="Mark all active requests as resolved"
                >
                  Resolve All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#FFFCF7] text-[#75665D] hover:text-[#C56845] hover:bg-[#EED9CD]/30 border border-[#E7DFD4] transition shadow-xs"
                  title="Delete all request history"
                >
                  Clear All
                </button>
              </>
            )}

            {/* Manual Refresh */}
            <button
              onClick={() => fetchRequests(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FFFCF7] text-[#1C140F] hover:bg-[#F5F0E8] border border-[#E7DFD4] transition shadow-xs disabled:opacity-50"
              title="Manual refresh"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#C56845] ${refreshing ? "animate-spin" : ""}`}
              />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>

            {/* Registry link */}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F5F0E8] hover:bg-[#EED9CD]/50 border border-[#E7DFD4] text-[#1C140F] transition shadow-xs"
              title="Open Device & Patient Registry"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C56845]" />
              <span>Registry</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full space-y-6">
        {/* KPI Counter Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            onClick={() => setFilter("NEW")}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              filter === "NEW"
                ? "bg-[#FFFCF7] border-[#C56845] ring-2 ring-[#C56845] shadow-md"
                : "bg-[#FFFCF7] border-[#E7DFD4] hover:border-[#D6C7B7]"
            }`}
          >
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#C56845] block">
                New Requests
              </span>
              <div className="text-3xl font-serif font-black text-[#1C140F] mt-0.5">
                {counts.new}
              </div>
            </div>
            {counts.new > 0 && (
              <span className="h-3 w-3 rounded-full bg-[#C56845] animate-ping" />
            )}
          </div>

          <div
            onClick={() => setFilter("IN_PROGRESS")}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              filter === "IN_PROGRESS"
                ? "bg-[#FFFCF7] border-[#DFBA9C] ring-2 ring-[#DFBA9C] shadow-md"
                : "bg-[#FFFCF7] border-[#E7DFD4] hover:border-[#D6C7B7]"
            }`}
          >
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#8C4318] block">
              In Progress
            </span>
            <div className="text-3xl font-serif font-black text-[#1C140F] mt-0.5">
              {counts.inProgress}
            </div>
          </div>

          <div
            onClick={() => setFilter("ACKNOWLEDGED")}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              filter === "ACKNOWLEDGED"
                ? "bg-[#FFFCF7] border-[#D6C7B7] ring-2 ring-[#D6C7B7] shadow-md"
                : "bg-[#FFFCF7] border-[#E7DFD4] hover:border-[#D6C7B7]"
            }`}
          >
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#7A361E] block">
              Acknowledged
            </span>
            <div className="text-3xl font-serif font-black text-[#1C140F] mt-0.5">
              {counts.acknowledged}
            </div>
          </div>

          <div
            onClick={() => setFilter("RESOLVED")}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              filter === "RESOLVED"
                ? "bg-[#FFFCF7] border-[#CEBEB0] ring-2 ring-[#CEBEB0] shadow-md"
                : "bg-[#FFFCF7] border-[#E7DFD4] hover:border-[#D6C7B7]"
            }`}
          >
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#75665D] block">
              Resolved
            </span>
            <div className="text-3xl font-serif font-black text-[#75665D] mt-0.5">
              {counts.resolved}
            </div>
          </div>
        </section>

        {/* SECTION: Patient Bedside Authorization & Nurse Assignment */}
        <section className="bg-[#FFFCF7] border border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-3">
            <div>
              <h3 className="font-serif font-bold text-lg text-[#1C140F] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#C56845]" />
                Patient Bedside Care Assignment &amp; Approval Flow
              </h3>
              <p className="text-xs text-[#30251F] font-serif font-medium italic mt-0.5">
                Nurses must be authorized by the patient. When requested, the patient approves on their bedside screen.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
              {patients.filter((p) => p.status === "ACTIVE").length} Active Patients
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {patients.map((p) => {
              const na = p.nurseAssignment;
              const isApproved = na?.status === "APPROVED";
              const isPending = na?.status === "PENDING";
              const isAssignedToCurrent = na?.nurseName === user?.name;
              const isBusy = nurseAssignLoading[p.patientCode] || false;

              return (
                <div
                  key={p.patientCode}
                  className="p-3.5 rounded-xl border border-[#E7DFD4] bg-[#F5F0E8] flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-serif font-bold text-[#1C140F] text-base">
                        {p.displayName}
                      </h4>
                      <p className="text-xs font-mono text-[#30251F] font-semibold">
                        Code: {p.patientCode} &bull; Bed: {p.bedLabel || "General"}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                        isApproved
                          ? "bg-[#FFFCF7] text-[#1C140F] border border-[#D6C7B7]"
                          : isPending
                          ? "bg-[#EED9CD] text-[#7A361E] border border-[#C56845]"
                          : "bg-[#FFFCF7] text-[#75665D] border border-[#E7DFD4]"
                      }`}
                    >
                      {na?.status || "UNASSIGNED"}
                    </span>
                  </div>

                  {/* Assignment Status details */}
                  <div className="text-xs font-medium">
                    {isApproved ? (
                      <div className="p-2 rounded-lg bg-[#FFFCF7] border border-[#D6C7B7] text-[#1C140F] space-y-0.5">
                        <div className="font-bold text-[#7A361E] flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-[#C56845]" />
                          Assigned Nurse: {na?.nurseName}
                        </div>
                        {na?.approvedAt && (
                          <div className="text-[10px] font-mono text-[#75665D]">
                            Patient Approved: {new Date(na.approvedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    ) : isPending ? (
                      <div className="p-2 rounded-lg bg-[#EED9CD]/60 border border-[#D6C7B7] text-[#7A361E] space-y-0.5">
                        <div className="font-bold flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C56845]" />
                          Awaiting Patient Approval
                        </div>
                        <div className="text-[10px] font-mono text-[#30251F]">
                          Requested for: {na?.nurseName}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[#75665D] text-[11px] font-serif italic">
                        No active nurse assignment. Request patient approval to link care.
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <div>
                    {!isApproved ? (
                      <button
                        onClick={() => handleRequestPatientAssignment(p.patientCode)}
                        disabled={isBusy}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7] shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <UserPlus className="w-3 h-3" />
                        )}
                        <span>Request Care Assignment</span>
                      </button>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-[#1C140F]">
                        <span className="font-bold">Active Care Link</span>
                        <Link
                          href={`/patient`}
                          target="_blank"
                          className="text-[11px] font-mono font-bold text-[#C56845] hover:underline"
                        >
                          View Bedside &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION: Predefined Hardware Commands Matrix */}
        <section className="bg-[#FFFCF7] border border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-2.5">
            <div>
              <h3 className="font-serif font-bold text-lg text-[#1C140F] flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#C56845]" />
                Predefined Bedside Gesture Commands Matrix
              </h3>
              <p className="text-xs text-[#30251F] font-serif font-medium italic mt-0.5">
                Exact physical actions, serial messages, and clinical dashboard displays currently active.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]">
              5 Predefined Actions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7DFD4] bg-[#F5F0E8] text-[#1C140F] font-mono font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Do this (Physical Action)</th>
                  <th className="py-2.5 px-3">Serial Shows</th>
                  <th className="py-2.5 px-3">Dashboard Shows</th>
                  <th className="py-2.5 px-3 text-right">Badge Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DFD4] font-medium text-[#1C140F]">
                <tr>
                  <td className="py-2.5 px-3 font-bold text-sm">2 blinks, wait</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#7A361E]">[cmd] YES</td>
                  <td className="py-2.5 px-3 font-serif font-black text-base text-[#1C140F]">YES</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]">
                      YES
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-sm">4+ blinks</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#7A361E]">[cmd] WATER</td>
                  <td className="py-2.5 px-3 font-serif font-black text-base text-[#1C140F]">WATER</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                      WATER
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-sm">Squeeze both hands together, once</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#8C4318]">[cmd] NO</td>
                  <td className="py-2.5 px-3 font-serif font-black text-base text-[#1C140F]">NO</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]">
                      NO
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-sm">Squeeze left hand 3 times</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#1C140F]">[cmd] CALL NURSE</td>
                  <td className="py-2.5 px-3 font-serif font-black text-base text-[#1C140F]">CALL NURSE</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#E5DFD7] text-[#1C140F] border border-[#CEBEB0]">
                      CALL NURSE
                    </span>
                  </td>
                </tr>
                <tr className="bg-[#EED9CD]/20">
                  <td className="py-2.5 px-3 font-bold text-sm text-[#C56845]">
                    Squeeze both hands together, 3 times
                  </td>
                  <td className="py-2.5 px-3 font-mono font-black text-[#C56845]">
                    [cmd] EMERGENCY / SEVERE PAIN
                  </td>
                  <td className="py-2.5 px-3 font-serif font-black text-base text-[#C56845]">
                    EMERGENCY, LEDs 1–4 flash red
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-black bg-[#C56845] text-[#FFFCF7] border border-[#A84A29]">
                      EMERGENCY
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="bg-[#FFFCF7] border border-[#E7DFD4] p-4 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1C140F] mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#C56845]" />
              Filter:
            </span>
            {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filter === st
                    ? "bg-[#1C140F] text-[#FFFCF7] shadow-xs"
                    : "bg-[#F5F0E8] hover:bg-[#EED9CD]/60 text-[#30251F] hover:text-[#1C140F] border border-[#E7DFD4]"
                }`}
              >
                {st === "ALL" ? `All (${counts.all})` : st.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#75665D] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search patient, bed, command, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F5F0E8] border border-[#E7DFD4] rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-[#1C140F] placeholder-[#75665D] focus:outline-none focus:border-[#C56845] focus:bg-[#FFFCF7] transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#75665D] hover:text-[#1C140F]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* Requests List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-serif font-black text-[#1C140F]">
              Care Queue Ledger ({sortedAndFilteredRequests.length})
            </h3>
            <span className="text-xs text-[#30251F] font-serif font-bold italic">
              Prioritizing new calls &bull; In-place approval confirmations
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-[#1C140F] font-bold text-sm bg-[#FFFCF7] rounded-2xl border border-[#E7DFD4] shadow-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-[#C56845] mx-auto mb-2" />
              Loading care requests from bedside devices...
            </div>
          ) : sortedAndFilteredRequests.length === 0 ? (
            <div className="p-16 rounded-2xl bg-[#FFFCF7] border border-[#E7DFD4] text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-[#C56845]/50 mx-auto" />
              <p className="text-[#1C140F] text-xl font-serif font-black">No matching care requests</p>
              <p className="text-xs text-[#30251F] max-w-sm mx-auto font-serif font-medium italic">
                {filter === "ALL"
                  ? "There are currently no care requests in the clinical queue. Bedside triggers will stream here automatically."
                  : `No requests with status ${filter.replace("_", " ")}.`}
              </p>
              {filter !== "ALL" && (
                <button
                  onClick={() => setFilter("ALL")}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F5F0E8] hover:bg-[#EED9CD]/60 text-[#1C140F] border border-[#E7DFD4] transition"
                >
                  View All Requests
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedAndFilteredRequests.map((req) => {
                const actionInfo = ACTION_CONFIG[req.action] || {
                  label: req.action,
                  badge: "bg-[#F5F0E8] text-[#1C140F] border-[#E7DFD4] font-bold",
                  border: "border-[#E7DFD4]",
                  bgTint: "bg-[#FFFCF7]",
                  gestureDescription: req.gesture || req.gestureId,
                  serial: `[cmd] ${req.action}`,
                };
                const isBusy = actionLoadingMap[req._id] || false;
                const isNew = req.status === "NEW";

                return (
                  <div
                    key={req._id}
                    className={`bg-[#FFFCF7] border rounded-2xl p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between ${
                      isNew
                        ? "border-[#C56845] ring-2 ring-[#C56845]/60 bg-[#EED9CD]/20"
                        : req.status === "IN_PROGRESS"
                        ? "border-[#DFBA9C]"
                        : req.status === "ACKNOWLEDGED"
                        ? "border-[#D6C7B7]"
                        : "border-[#E7DFD4] opacity-90"
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Top: Action Pill & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono border ${actionInfo.badge}`}
                        >
                          {actionInfo.label}
                        </span>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                            isNew
                              ? "bg-[#C56845] text-[#FFFCF7]"
                              : req.status === "ACKNOWLEDGED"
                              ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
                              : req.status === "IN_PROGRESS"
                              ? "bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]"
                              : "bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]"
                          }`}
                        >
                          {req.status.replace("_", " ")}
                        </span>
                      </div>

                      {/* Patient & Bed Info */}
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="font-serif font-black text-xl text-[#1C140F] leading-tight">
                            {req.patient?.displayName || "Unknown Patient"}
                          </h4>
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="text-xs font-bold text-[#C56845] hover:text-[#B05534] inline-flex items-center gap-0.5"
                          >
                            Details <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-xs text-[#30251F] font-mono font-bold flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1 font-serif text-[#1C140F] font-bold">
                            <Bed className="w-3.5 h-3.5 text-[#C56845]" />
                            {req.patient?.bedLabel || "Bed Unassigned"}
                          </span>
                          <span>&bull;</span>
                          <span className="text-[11px] text-[#75665D]">
                            {req.patient?.patientCode}
                          </span>
                        </div>
                      </div>

                      {/* Physical Action & Serial Mapping Display */}
                      <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[#75665D] font-mono font-bold uppercase text-[10px]">
                            Physical Action:
                          </span>
                          <strong className="text-[#1C140F] font-sans font-bold text-xs text-right">
                            {actionInfo.gestureDescription}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#75665D] font-mono font-bold uppercase text-[10px]">
                            Serial Shows:
                          </span>
                          <span className="font-mono font-bold text-[#7A361E]">
                            {actionInfo.serial}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#75665D] font-mono font-bold uppercase text-[10px]">
                            Device ID:
                          </span>
                          <span className="font-mono font-bold text-[#1C140F]">
                            {req.device?.deviceId || "N/A"}
                          </span>
                        </div>
                      </div>

                      {/* Time Details */}
                      <div className="text-[11px] font-mono font-bold text-[#30251F] space-y-0.5">
                        <div className="flex items-center gap-1 text-[#75665D]">
                          <Clock className="w-3 h-3 text-[#75665D] shrink-0" />
                          <span>Created: {new Date(req.createdAt).toLocaleTimeString()}</span>
                        </div>
                        {req.acknowledgedAt && (
                          <div className="text-[#7A361E]">
                            Acked: {new Date(req.acknowledgedAt).toLocaleTimeString()}
                          </div>
                        )}
                        {req.inProgressAt && (
                          <div className="text-[#8C4318]">
                            In-Progress: {new Date(req.inProgressAt).toLocaleTimeString()}
                          </div>
                        )}
                        {req.resolvedAt && (
                          <div className="text-[#75665D]">
                            Resolved: {new Date(req.resolvedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Action Buttons (Prompts in-place confirmation dialog!) */}
                    <div className="pt-3 border-t border-[#E7DFD4] mt-3">
                      {req.status === "NEW" && (
                        <button
                          type="button"
                          onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                          disabled={isBusy}
                          className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Acknowledge Request
                        </button>
                      )}

                      {req.status === "ACKNOWLEDGED" && (
                        <button
                          type="button"
                          onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                          disabled={isBusy}
                          className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#EED9CD] text-[#7A361E] hover:bg-[#DFBA9C] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 border border-[#D6C7B7]"
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-[#7A361E]" />
                          )}
                          Start Handling (In Progress)
                        </button>
                      )}

                      {req.status === "IN_PROGRESS" && (
                        <button
                          type="button"
                          onClick={() => promptStepConfirmation(req, "RESOLVED")}
                          disabled={isBusy}
                          className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#1C140F] text-[#FFFCF7] hover:bg-[#30251F] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Mark as Resolved
                        </button>
                      )}

                      {req.status === "RESOLVED" && (
                        <div className="py-1 text-center text-xs font-serif font-black text-[#75665D] flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-[#C56845]" />
                          Resolved ({new Date(req.resolvedAt || req.updatedAt).toLocaleTimeString()})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* IN-PLACE CONFIRMATION DIALOG (STAYS RIGHT THERE ONLY!) */}
      {stepConfirm && (
        <div className="fixed inset-0 z-50 bg-[#1C140F]/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFCF7] border-2 border-[#D6C7B7] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#EED9CD] text-[#C56845] border border-[#D6C7B7]">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <h3 className="font-serif font-black text-lg text-[#1C140F]">
                  {stepConfirm.stepTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="text-[#75665D] hover:text-[#1C140F] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase">Patient:</span>
                <span className="font-serif font-black text-[#1C140F] text-sm">
                  {stepConfirm.request.patient?.displayName || "Unknown Patient"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase">Bed / Location:</span>
                <span className="font-mono font-bold text-[#1C140F]">
                  {stepConfirm.request.patient?.bedLabel || "Bed Unassigned"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase">Action / Command:</span>
                <span className="font-mono font-black text-[#C56845]">
                  {stepConfirm.request.action}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase">Target Step:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  {stepConfirm.nextStep}
                </span>
              </div>
            </div>

            <p className="text-xs font-serif font-bold text-[#30251F] leading-relaxed">
              {stepConfirm.stepDescription}
            </p>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E7DFD4]">
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#75665D] hover:text-[#1C140F] border border-[#E7DFD4] hover:bg-[#F5F0E8] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNextStep}
                disabled={actionLoadingMap[stepConfirm.request._id]}
                className={`px-5 py-2 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 ${stepConfirm.actionButtonColor}`}
              >
                {actionLoadingMap[stepConfirm.request._id] ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{stepConfirm.actionButtonLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST DETAILS MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-[#1C140F]/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFCF7] border border-[#E7DFD4] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider ${
                    selectedRequest.status === "NEW"
                      ? "bg-[#C56845] text-[#FFFCF7]"
                      : selectedRequest.status === "ACKNOWLEDGED"
                      ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
                      : selectedRequest.status === "IN_PROGRESS"
                      ? "bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]"
                      : "bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]"
                  }`}
                >
                  {selectedRequest.status.replace("_", " ")}
                </span>
                <h3 className="font-serif font-black text-xl text-[#1C140F]">Request Details</h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-[#75665D] hover:text-[#1C140F] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Summary Box */}
            <div className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#75665D] font-mono font-bold uppercase tracking-wider">
                  Request Action
                </span>
                <span
                  className={`px-3 py-0.5 rounded-lg text-xs font-mono font-bold border ${
                    ACTION_CONFIG[selectedRequest.action]?.badge || "bg-[#FFFCF7]"
                  }`}
                >
                  {ACTION_CONFIG[selectedRequest.action]?.label || selectedRequest.action}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase tracking-wider">
                  Physical Action
                </span>
                <strong className="font-bold text-[#1C140F]">
                  {ACTION_CONFIG[selectedRequest.action]?.gestureDescription || selectedRequest.gesture || selectedRequest.gestureId}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#75665D] font-mono font-bold uppercase tracking-wider">
                  Serial Stream
                </span>
                <span className="font-mono font-bold text-[#7A361E]">
                  {ACTION_CONFIG[selectedRequest.action]?.serial || `[cmd] ${selectedRequest.action}`}
                </span>
              </div>
            </div>

            {/* Patient & Bed Information */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#75665D]">
                Patient &amp; Bed Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs bg-[#FFFCF7] p-3 rounded-xl border border-[#E7DFD4]">
                <div>
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Patient Name</span>
                  <strong className="text-[#1C140F] text-sm font-serif font-black">
                    {selectedRequest.patient?.displayName || "N/A"}
                  </strong>
                </div>
                <div>
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Bed Label</span>
                  <strong className="text-[#1C140F] text-sm font-serif font-black">
                    {selectedRequest.patient?.bedLabel || "Unassigned"}
                  </strong>
                </div>
                <div className="mt-1">
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Patient Code</span>
                  <span className="font-mono font-bold text-[#1C140F]">
                    {selectedRequest.patient?.patientCode || "N/A"}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Patient Status</span>
                  <span className="font-mono font-bold text-[#7A361E]">
                    {selectedRequest.patient?.status || "ACTIVE"}
                  </span>
                </div>
              </div>
            </div>

            {/* Device Information */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#75665D]">
                Assigned Device (1-to-1 Device Allocation)
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs bg-[#FFFCF7] p-3 rounded-xl border border-[#E7DFD4]">
                <div>
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Device Name</span>
                  <span className="font-serif font-black text-[#1C140F]">
                    {selectedRequest.device?.name || "NPG Lite"}
                  </span>
                </div>
                <div>
                  <span className="text-[#75665D] block text-[11px] font-mono font-bold">Device Identifier</span>
                  <span className="font-mono font-bold text-[#1C140F]">
                    {selectedRequest.device?.deviceId || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Lifecycle Audit Timeline */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#75665D]">
                Lifecycle Audit Timestamps
              </h4>
              <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs space-y-2">
                <div className="flex items-center justify-between text-[#1C140F]">
                  <span className="flex items-center gap-1.5 text-[#75665D] font-bold">
                    <Clock className="w-3.5 h-3.5 text-[#75665D]" />
                    Created:
                  </span>
                  <span className="font-mono font-bold">{new Date(selectedRequest.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[#1C140F]">
                  <span className="flex items-center gap-1.5 text-[#75665D] font-bold">
                    <Check className="w-3.5 h-3.5 text-[#C56845]" />
                    Acknowledged:
                  </span>
                  <span className="font-mono font-bold">
                    {selectedRequest.acknowledgedAt
                      ? new Date(selectedRequest.acknowledgedAt).toLocaleString()
                      : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#1C140F]">
                  <span className="flex items-center gap-1.5 text-[#75665D] font-bold">
                    <Play className="w-3.5 h-3.5 text-[#8C4318] fill-[#8C4318]" />
                    In Progress:
                  </span>
                  <span className="font-mono font-bold">
                    {selectedRequest.inProgressAt
                      ? new Date(selectedRequest.inProgressAt).toLocaleString()
                      : "Not Started"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#1C140F]">
                  <span className="flex items-center gap-1.5 text-[#75665D] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#75665D]" />
                    Resolved:
                  </span>
                  <span className="font-mono font-bold">
                    {selectedRequest.resolvedAt
                      ? new Date(selectedRequest.resolvedAt).toLocaleString()
                      : "Unresolved"}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-[#E7DFD4]">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#75665D] hover:text-[#1C140F] border border-[#E7DFD4] hover:bg-[#F5F0E8] transition"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {selectedRequest.status === "NEW" && (
                  <button
                    onClick={() => {
                      promptStepConfirmation(selectedRequest, "ACKNOWLEDGED");
                    }}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Acknowledge Request
                  </button>
                )}

                {selectedRequest.status === "ACKNOWLEDGED" && (
                  <button
                    onClick={() => {
                      promptStepConfirmation(selectedRequest, "IN_PROGRESS");
                    }}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-[#EED9CD] text-[#7A361E] hover:bg-[#DFBA9C] transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 border border-[#D6C7B7]"
                  >
                    <Play className="w-3.5 h-3.5 fill-[#7A361E]" />
                    Start Handling
                  </button>
                )}

                {selectedRequest.status === "IN_PROGRESS" && (
                  <button
                    onClick={() => {
                      promptStepConfirmation(selectedRequest, "RESOLVED");
                    }}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-[#1C140F] text-[#FFFCF7] hover:bg-[#30251F] transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark as Resolved
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION (BOTTOM-RIGHT, NEVER DISRUPTS SCROLL) */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-bold ${
              toastMsg.isError
                ? "bg-[#EED9CD] border-[#C56845] text-[#7A361E]"
                : "bg-[#FFFCF7] border-[#D6C7B7] text-[#1C140F]"
            }`}
          >
            {toastMsg.isError ? (
              <AlertTriangle className="w-4 h-4 text-[#C56845] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#C56845] shrink-0" />
            )}
            <span>{toastMsg.text}</span>
            <button
              onClick={() => setToastMsg(null)}
              className="text-[#75665D] hover:text-[#1C140F] ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Editorial Footer */}
      <footer className="border-t border-[#E7DFD4] bg-[#FFFCF7] py-6 text-center text-xs text-[#30251F] font-bold mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <span className="font-serif font-black italic">
            NetraVaani Assistive HealthTech &bull; In-Place Clinical Response System
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C56845]"></span>
              Terracotta (#C56845)
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EED9CD]"></span>
              Soft Accent (#EED9CD)
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1C140F]"></span>
              Espresso (#1C140F)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
