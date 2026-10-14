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
  UserPlus,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import dynamic from "next/dynamic";
import {
  AnimatePresence,
  motion,
  EASE_OUT,
  Reveal,
  TiltCard,
  Segmented,
  AnimatedNumber,
  MotionModal,
  Toast,
  staggerParent,
  staggerChild,
} from "@/components/ui/motion";
import AmbientBackdrop from "@/components/ui/AmbientBackdrop";
import BrandMark from "@/components/ui/BrandMark";
import { SessionLoader, SiteFooter } from "@/components/ui/Chrome";

const IrisScene = dynamic(() => import("@/components/ui/IrisScene"), { ssr: false });

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
    badge: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29] font-bold",
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
    return <SessionLoader label="Authenticating clinical session..." />;
  }

  if (!user) {
    return <LoginForm />;
  }

  const kpis = [
    { key: "NEW" as const, label: "New Requests", value: counts.new, tone: "text-[#C56845]", hot: counts.new > 0 },
    { key: "IN_PROGRESS" as const, label: "In Progress", value: counts.inProgress, tone: "text-[#8C4318]" },
    { key: "ACKNOWLEDGED" as const, label: "Acknowledged", value: counts.acknowledged, tone: "text-[#7A361E]" },
    { key: "RESOLVED" as const, label: "Resolved", value: counts.resolved, tone: "text-[#75665D]" },
  ];

  return (
    <div className="relative min-h-screen text-[#1C140F] flex flex-col font-sans selection:bg-[#EED9CD] selection:text-[#1C140F]">
      <AmbientBackdrop />

      {/* ================= Header ================= */}
      <header className="nv-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandMark size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold text-xl sm:text-2xl tracking-tight text-[#1C140F]">NetraVaani</span>
                <span className="hidden md:inline nv-chip text-[10px] font-medium uppercase tracking-[0.08em] px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  Clinical Nurse Station
                </span>
              </div>
              <span className="hidden sm:block text-xs text-[#75665D]">
                Bedside Care Requests &amp; In-Place Rapid Response Ledger
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-2 border-r border-[#E7DFD4]">
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-[#E7DFD4] bg-[#FFFCF7]/80 pl-1 pr-2.5 py-1">
                <span className="h-6 w-6 rounded-lg bg-[#30251F] text-[#FFFCF7] grid place-items-center text-[10px] font-mono">
                  {user.name?.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs text-[#30251F] leading-none">
                  {user.name}
                  <span className="ml-1 font-mono text-[10px] text-[#75665D]">{user.role}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-[#75665D] hover:text-[#C56845] px-2 py-1 rounded-lg hover:bg-[#EED9CD]/40 transition"
              >
                Sign out
              </button>
            </div>

            <Link
              href="/patient"
              target="_blank"
              className="nv-btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#7A361E]"
              title="Open Bedside Patient Portal"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Bedside Portal</span>
            </Link>

            {requests.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleResolveAll}
                  className="nv-btn-ghost px-3 py-1.5 rounded-xl text-xs font-mono text-[#7A361E]"
                  title="Mark all active requests as resolved"
                >
                  Resolve All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="nv-btn-ghost px-3 py-1.5 rounded-xl text-xs font-mono text-[#75665D] hover:text-[#C56845]"
                  title="Delete all request history"
                >
                  Clear All
                </button>
              </>
            )}

            <button
              onClick={() => fetchRequests(true)}
              disabled={refreshing || loading}
              className="nv-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#1C140F] disabled:opacity-50"
              title="Manual refresh"
            >
              <motion.span
                className="inline-block h-3 w-3 rounded-full border-[1.5px] border-[#C56845]/30 border-t-[#C56845]"
                animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { duration: 0.2 }}
              />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>

            <Link
              href="/"
              className="nv-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#1C140F]"
              title="Open Device & Patient Registry"
            >
              &larr; Registry
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        {/* ================= Hero + KPI tiles ================= */}
        <Reveal>
          <section className="nv-espresso relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-16 h-[340px] w-[440px] opacity-80 hidden md:block">
              <IrisScene tone="dark" className="h-full w-full" />
            </div>
            <div className="relative">
              <span className="font-medium text-[10px] uppercase tracking-[0.08em] text-[#EED9CD]/70 flex items-center gap-2">
                <span className="nv-live-dot !w-1.5 !h-1.5" /> Live queue &bull; auto-sync
              </span>
              <h2 className="mt-2 font-semibold text-3xl sm:text-4xl tracking-tight text-[#FFFCF7]">
                Rapid response ledger
              </h2>
              <p className="mt-1 text-sm text-[#EED9CD]/70">
                Tap a tile to filter the queue.
              </p>

              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl [perspective:1000px]">
                {kpis.map((k, i) => {
                  const active = filter === k.key;
                  return (
                    <motion.button
                      key={k.key}
                      type="button"
                      onClick={() => setFilter(k.key)}
                      initial={{ opacity: 0, rotateX: -35, y: 14 }}
                      animate={{ opacity: 1, rotateX: 0, y: 0 }}
                      whileHover={{ y: -4, rotateX: 6 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ delay: 0.12 + i * 0.07, type: "spring", stiffness: 260, damping: 22 }}
                      className={`text-left rounded-2xl border px-4 py-3.5 backdrop-blur-sm transition-colors ${
 active
 ? "bg-[#FFFCF7] border-[#FFFCF7] text-[#1C140F] shadow-[0_20px_40px_-20px_rgba(0,0,0,.6)]"
 : k.hot
 ? "border-[#C56845]/60 bg-[#C56845]/15 text-[#FFFCF7] shadow-[0_0_30px_-8px_rgba(197,104,69,.7)]"
 : "border-[#FFFCF7]/10 bg-[#FFFCF7]/[0.04] text-[#FFFCF7] hover:bg-[#FFFCF7]/[0.08]"
 }`}
                    >
                      <span
                        className={`font-medium text-[10px] uppercase tracking-[0.08em] flex items-center justify-between ${
 active ? k.tone : "text-[#EED9CD]/65"
 }`}
                      >
                        {k.label}
                        {k.hot && <span className="h-2 w-2 rounded-full bg-[#C56845] animate-ping" />}
                      </span>
                      <AnimatedNumber value={k.value} className="block font-semibold tracking-tight text-4xl mt-1" />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ================= Patient assignment ================= */}
        <Reveal delay={0.08}>
          <section className="nv-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <span className="nv-eyebrow">Consent flow</span>
                <h3 className="font-semibold tracking-tight text-xl text-[#1C140F]">Patient Bedside Care Assignment &amp; Approval Flow</h3>
                <p className="text-xs text-[#75665D] mt-0.5">
                  Nurses must be authorized by the patient. When requested, the patient approves on their bedside screen.
                </p>
              </div>
              <span className="nv-chip self-start sm:self-auto text-xs font-medium px-3 py-1 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                {patients.filter((p) => p.status === "ACTIVE").length} Active Patients
              </span>
            </div>
            <div className="nv-divider" />

            <motion.div
              variants={staggerParent}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 [perspective:1200px]"
            >
              {patients.map((p) => {
                const na = p.nurseAssignment;
                const isApproved = na?.status === "APPROVED";
                const isPending = na?.status === "PENDING";
                const isBusy = nurseAssignLoading[p.patientCode] || false;

                return (
                  <motion.div key={p.patientCode} variants={staggerChild} className="h-full">
                    <TiltCard intensity={4} className="nv-well h-full p-4 rounded-2xl flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-base text-[#1C140F]">{p.displayName}</h4>
                          <p className="text-[11px] font-mono text-[#75665D]">
                            {p.patientCode} &bull; Bed: {p.bedLabel || "General"}
                          </p>
                        </div>
                        <span
                          className={`nv-chip px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
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

                      <div className="text-xs">
                        {isApproved ? (
                          <div className="p-2 rounded-lg bg-[#FFFCF7] border border-[#D6C7B7] text-[#1C140F] space-y-0.5">
                            <div className="font-medium text-[#7A361E]">Assigned Nurse: {na?.nurseName}</div>
                            {na?.approvedAt && (
                              <div className="text-[10px] font-mono text-[#75665D]">
                                Patient Approved: {new Date(na.approvedAt).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        ) : isPending ? (
                          <div className="p-2 rounded-lg bg-[#EED9CD]/60 border border-[#D6C7B7] text-[#7A361E] space-y-0.5">
                            <div className="font-medium flex items-center gap-1.5">
                              <span className="nv-live-dot !w-1.5 !h-1.5" />
                              Awaiting Patient Approval
                            </div>
                            <div className="text-[10px] font-mono text-[#30251F]">Requested for: {na?.nurseName}</div>
                          </div>
                        ) : (
                          <div className="text-[#75665D] text-[11px]">
                            No active nurse assignment. Request patient approval to link care.
                          </div>
                        )}
                      </div>

                      <div>
                        {!isApproved ? (
                          <button
                            onClick={() => handleRequestPatientAssignment(p.patientCode)}
                            disabled={isBusy}
                            className="nv-btn-primary w-full py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {isBusy && <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                            <span>Request Care Assignment</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-[#1C140F]">
                            <span className="font-medium flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#C56845]" />
                              Active Care Link
                            </span>
                            <Link href={`/patient`} target="_blank" className="text-[11px] font-mono text-[#C56845] hover:underline">
                              View Bedside &rarr;
                            </Link>
                          </div>
                        )}
                      </div>
                    </TiltCard>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        </Reveal>

        {/* ================= Commands matrix ================= */}
        <Reveal delay={0.12}>
          <section className="nv-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <span className="nv-eyebrow">Firmware reference</span>
                <h3 className="font-semibold tracking-tight text-xl text-[#1C140F]">Predefined Bedside Gesture Commands Matrix</h3>
                <p className="text-xs text-[#75665D] mt-0.5">
                  Exact physical actions, serial messages, and clinical dashboard displays currently active.
                </p>
              </div>
              <span className="nv-chip self-start sm:self-auto text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]">
                {commandsList.length || 5} Predefined Actions
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#E7DFD4]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F2ECE3] text-[#75665D] font-medium uppercase text-[10px] tracking-[0.08em]">
                    <th className="py-3 px-4 font-medium">Do this (Physical Action)</th>
                    <th className="py-3 px-4 font-medium">Serial Shows</th>
                    <th className="py-3 px-4 font-medium">Dashboard Shows</th>
                    <th className="py-3 px-4 font-medium text-right">Badge Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7DFD4] text-[#1C140F] bg-[#FFFCF7]">
                  {[
                    { g: "2 blinks, wait", s: "[cmd] YES", d: "YES", b: "bg-[#E8E2D7] text-[#1C140F] border-[#D6C7B7]", sc: "text-[#7A361E]" },
                    { g: "4+ blinks", s: "[cmd] WATER", d: "WATER", b: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7]", sc: "text-[#7A361E]" },
                    { g: "Squeeze both hands together, once", s: "[cmd] NO", d: "NO", b: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C]", sc: "text-[#8C4318]" },
                    { g: "Squeeze left hand 3 times", s: "[cmd] CALL NURSE", d: "CALL NURSE", b: "bg-[#E5DFD7] text-[#1C140F] border-[#CEBEB0]", sc: "text-[#1C140F]" },
                  ].map((row, i) => (
                    <motion.tr
                      key={row.d}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.05, ease: EASE_OUT, duration: 0.4 }}
                      className="hover:bg-[#F5F0E8]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-sm">{row.g}</td>
                      <td className={`py-3 px-4 font-mono ${row.sc}`}>{row.s}</td>
                      <td className="py-3 px-4 font-medium text-base">{row.d}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`nv-chip px-3 py-1 rounded-lg text-[11px] font-mono border ${row.b}`}>{row.d}</span>
                      </td>
                    </motion.tr>
                  ))}
                  <motion.tr
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35, ease: EASE_OUT, duration: 0.4 }}
                    className="bg-[#EED9CD]/25"
                  >
                    <td className="py-3 px-4 font-medium text-sm text-[#C56845]">Squeeze both hands together, 3 times</td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#C56845]">[cmd] EMERGENCY / SEVERE PAIN</td>
                    <td className="py-3 px-4 font-medium text-base text-[#C56845]">EMERGENCY, LEDs 1–4 flash red</td>
                    <td className="py-3 px-4 text-right">
                      <span className="nv-btn-primary px-3 py-1 rounded-lg text-[11px] font-mono font-semibold">EMERGENCY</span>
                    </td>
                  </motion.tr>
                </tbody>
              </table>
            </div>
          </section>
        </Reveal>

        {/* ================= Search & filter toolbar ================= */}
        <section className="nv-glass !border !border-[#E7DFD4] rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sticky top-[76px] z-30">
          <div className="flex flex-wrap items-center gap-2">
            <span className="nv-eyebrow mr-1">Filter</span>
            <Segmented
              size="sm"
              layoutId="nurse-filter"
              value={filter}
              onChange={setFilter}
              items={(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => ({
                value: st,
                label: st === "ALL" ? `All (${counts.all})` : st.replace("_", " "),
              }))}
            />
          </div>

          <div className="relative w-full md:w-80">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#75665D] absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
            <input
              type="text"
              placeholder="Search patient, bed, command, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="nv-input w-full rounded-xl pl-9 pr-8 py-2 text-xs text-[#1C140F] placeholder-[#75665D]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#75665D] hover:text-[#1C140F] text-base leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </section>

        {/* ================= Requests list ================= */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
            <h3 className="nv-engraved text-2xl sm:text-3xl font-semibold text-[#1C140F] tracking-tight">
              Care Queue Ledger <span className="text-[#A2948B]">({sortedAndFilteredRequests.length})</span>
            </h3>
            <span className="text-xs text-[#75665D]">
              Prioritizing new calls &bull; In-place approval confirmations
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="nv-card rounded-3xl p-5 space-y-3">
                  <div className="nv-shimmer h-6 w-28 rounded-lg" />
                  <div className="nv-shimmer h-6 w-2/3 rounded" />
                  <div className="nv-shimmer h-20 w-full rounded-xl" />
                  <div className="nv-shimmer h-10 w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : sortedAndFilteredRequests.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="nv-card rounded-3xl p-14 text-center space-y-3">
              <div className="mx-auto h-16 w-16 [perspective:400px]">
                <motion.div
                  className="h-full w-full rounded-2xl border border-[#D6C7B7] bg-[#F5F0E8] grid place-items-center"
                  style={{ boxShadow: "0 1px 0 #fff inset, 0 10px 24px -12px rgba(48,37,31,.4)" }}
                  animate={{ rotateY: [0, 18, 0, -18, 0], rotateX: [8, 0, -8, 0, 8] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="h-3 w-3 rounded-full bg-[#C56845]/70" />
                </motion.div>
              </div>
              <p className="text-[#1C140F] text-xl font-semibold tracking-tight">No matching care requests</p>
              <p className="text-xs text-[#75665D] max-w-sm mx-auto">
                {filter === "ALL"
                  ? "There are currently no care requests in the clinical queue. Bedside triggers will stream here automatically."
                  : `No requests with status ${filter.replace("_", " ")}.`}
              </p>
              {filter !== "ALL" && (
                <button onClick={() => setFilter("ALL")} className="nv-btn-ghost px-4 py-2 rounded-xl text-xs font-medium text-[#1C140F]">
                  View All Requests
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              variants={staggerParent}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 [perspective:1400px]"
            >
              <AnimatePresence mode="popLayout">
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
                  const isEmergency = req.action === "EMERGENCY";

                  return (
                    <motion.div key={req._id} layout variants={staggerChild} exit="exit" className="h-full">
                      <TiltCard
                        intensity={4}
                        className={`nv-card nv-card-hover h-full rounded-3xl p-5 flex flex-col justify-between ${
 isNew
 ? "!border-[#C56845]"
 : req.status === "IN_PROGRESS"
 ? "!border-[#DFBA9C]"
 : req.status === "RESOLVED"
 ? "opacity-85"
 : ""
 }`}
                        style={isNew ? { boxShadow: "var(--shadow-2), var(--glow-accent)" } : undefined}
                      >
                        {isNew && (
                          <motion.div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-[inherit]"
                            animate={{ boxShadow: ["0 0 0 0 rgba(197,104,69,0.4)", `0 0 0 ${isEmergency ? 14 : 10}px rgba(197,104,69,0)`] }}
                            transition={{ duration: isEmergency ? 1.1 : 1.8, repeat: Infinity, ease: "easeOut" }}
                          />
                        )}
                        <div className="space-y-4 relative">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`nv-chip px-3 py-1.5 rounded-xl text-xs font-mono border ${actionInfo.badge}`}>
                              {actionInfo.label}
                            </span>
                            <span
                              className={`nv-chip px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider ${
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

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold tracking-tight text-xl text-[#1C140F] leading-tight">
                                {req.patient?.displayName || "Unknown Patient"}
                              </h4>
                              <button
                                onClick={() => setSelectedRequest(req)}
                                className="shrink-0 text-xs font-medium text-[#C56845] hover:text-[#B05534] inline-flex items-center gap-0.5 group"
                              >
                                Details
                                <span className="transition-transform group-hover:translate-x-0.5">&rsaquo;</span>
                              </button>
                            </div>
                            <div className="text-xs text-[#75665D] font-mono flex items-center gap-2 mt-1">
                              <span className="font-medium text-[#1C140F]">{req.patient?.bedLabel || "Bed Unassigned"}</span>
                              <span className="text-[#D6C7B7]">/</span>
                              <span className="text-[11px]">{req.patient?.patientCode}</span>
                            </div>
                          </div>

                          <div className="nv-well p-3 rounded-xl text-xs space-y-1.5">
                            <Row label="Physical Action">
                              <strong className="text-[#1C140F] font-medium text-right">{actionInfo.gestureDescription}</strong>
                            </Row>
                            <Row label="Serial Shows">
                              <span className="font-mono text-[#7A361E]">{actionInfo.serial}</span>
                            </Row>
                            <Row label="Device ID">
                              <span className="font-mono text-[#1C140F]">{req.device?.deviceId || "N/A"}</span>
                            </Row>
                          </div>

                          <LifecycleTrack req={req} />
                        </div>

                        <div className="pt-3 mt-3 relative">
                          <div className="nv-divider mb-3" />
                          {req.status === "NEW" && (
                            <button
                              type="button"
                              onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                              disabled={isBusy}
                              className="nv-btn-primary w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isBusy && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                              Acknowledge Request
                            </button>
                          )}
                          {req.status === "ACKNOWLEDGED" && (
                            <button
                              type="button"
                              onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                              disabled={isBusy}
                              className="nv-btn-soft w-full py-2.5 rounded-xl text-xs font-medium text-[#7A361E] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isBusy && <span className="h-3.5 w-3.5 rounded-full border-2 border-[#C56845]/30 border-t-[#C56845] animate-spin" />}
                              Start Handling (In Progress)
                            </button>
                          )}
                          {req.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              onClick={() => promptStepConfirmation(req, "RESOLVED")}
                              disabled={isBusy}
                              className="nv-btn-dark w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isBusy && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                              Mark as Resolved
                            </button>
                          )}
                          {req.status === "RESOLVED" && (
                            <div className="py-1 text-center text-xs text-[#75665D] flex items-center justify-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#C56845]" />
                              Resolved ({new Date(req.resolvedAt || req.updatedAt).toLocaleTimeString()})
                            </div>
                          )}
                        </div>
                      </TiltCard>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </main>

      {/* ================= In-place confirmation dialog ================= */}
      <MotionModal open={Boolean(stepConfirm)} onClose={() => setStepConfirm(null)} className="max-w-md w-full p-6 space-y-4">
        {stepConfirm && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="nv-eyebrow">Confirm next step</span>
                <h3 className="font-semibold tracking-tight text-xl text-[#1C140F] leading-snug mt-0.5">
                  {stepConfirm.stepTitle.replace("Confirm Next Step: ", "")}
                </h3>
              </div>
              <ModalClose onClick={() => setStepConfirm(null)} />
            </div>

            <StepRail next={stepConfirm.nextStep} />

            <div className="nv-well p-3.5 rounded-2xl space-y-2 text-xs">
              <Row label="Patient">
                <span className="font-medium text-[#1C140F] text-sm">
                  {stepConfirm.request.patient?.displayName || "Unknown Patient"}
                </span>
              </Row>
              <Row label="Bed / Location">
                <span className="font-mono text-[#1C140F]">{stepConfirm.request.patient?.bedLabel || "Bed Unassigned"}</span>
              </Row>
              <Row label="Action / Command">
                <span className="font-mono font-semibold text-[#C56845]">{stepConfirm.request.action}</span>
              </Row>
              <Row label="Target Step">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  {stepConfirm.nextStep}
                </span>
              </Row>
            </div>

            <p className="text-sm font-medium text-[#30251F] leading-relaxed">{stepConfirm.stepDescription}</p>

            <div className="pt-1 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="nv-btn-ghost px-4 py-2 rounded-xl text-xs font-medium text-[#75665D]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNextStep}
                disabled={actionLoadingMap[stepConfirm.request._id]}
                className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
 stepConfirm.nextStep === "ACKNOWLEDGED"
 ? "nv-btn-primary"
 : stepConfirm.nextStep === "IN_PROGRESS"
 ? "nv-btn-soft text-[#7A361E]"
 : "nv-btn-dark"
 }`}
              >
                {actionLoadingMap[stepConfirm.request._id] && (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                )}
                <span>{stepConfirm.actionButtonLabel}</span>
              </button>
            </div>
          </>
        )}
      </MotionModal>

      {/* ================= Request details modal ================= */}
      <MotionModal open={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} className="max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        {selectedRequest && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`nv-chip px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
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
                <h3 className="font-semibold tracking-tight text-2xl text-[#1C140F]">Request Details</h3>
              </div>
              <ModalClose onClick={() => setSelectedRequest(null)} />
            </div>

            <div className="nv-well p-4 rounded-2xl space-y-2 text-xs">
              <Row label="Request Action">
                <span
                  className={`nv-chip px-3 py-0.5 rounded-lg text-xs font-mono border ${
 ACTION_CONFIG[selectedRequest.action]?.badge || "bg-[#FFFCF7]"
 }`}
                >
                  {ACTION_CONFIG[selectedRequest.action]?.label || selectedRequest.action}
                </span>
              </Row>
              <Row label="Physical Action">
                <strong className="font-medium text-[#1C140F]">
                  {ACTION_CONFIG[selectedRequest.action]?.gestureDescription || selectedRequest.gesture || selectedRequest.gestureId}
                </strong>
              </Row>
              <Row label="Serial Stream">
                <span className="font-mono text-[#7A361E]">
                  {ACTION_CONFIG[selectedRequest.action]?.serial || `[cmd] ${selectedRequest.action}`}
                </span>
              </Row>
            </div>

            <div className="space-y-1.5">
              <h4 className="nv-eyebrow">Patient &amp; Bed Information</h4>
              <div className="grid grid-cols-2 gap-3 text-xs bg-[#FFFCF7] p-3.5 rounded-2xl border border-[#E7DFD4]">
                <Info label="Patient Name" value={selectedRequest.patient?.displayName || "N/A"} serif />
                <Info label="Bed Label" value={selectedRequest.patient?.bedLabel || "Unassigned"} serif />
                <Info label="Patient Code" value={selectedRequest.patient?.patientCode || "N/A"} />
                <Info label="Patient Status" value={selectedRequest.patient?.status || "ACTIVE"} accent />
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="nv-eyebrow">Assigned Device (1-to-1 Device Allocation)</h4>
              <div className="grid grid-cols-2 gap-3 text-xs bg-[#FFFCF7] p-3.5 rounded-2xl border border-[#E7DFD4]">
                <Info label="Device Name" value={selectedRequest.device?.name || "NPG Lite"} serif />
                <Info label="Device Identifier" value={selectedRequest.device?.deviceId || "N/A"} />
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="nv-eyebrow">Lifecycle Audit Timestamps</h4>
              <ol className="relative nv-well p-4 rounded-2xl text-xs space-y-3">
                <span aria-hidden className="absolute left-[23px] top-6 bottom-6 w-px bg-[#D6C7B7]" />
                {[
                  { k: "Created", v: new Date(selectedRequest.createdAt).toLocaleString(), done: true },
                  { k: "Acknowledged", v: selectedRequest.acknowledgedAt ? new Date(selectedRequest.acknowledgedAt).toLocaleString() : "Pending", done: !!selectedRequest.acknowledgedAt },
                  { k: "In Progress", v: selectedRequest.inProgressAt ? new Date(selectedRequest.inProgressAt).toLocaleString() : "Not Started", done: !!selectedRequest.inProgressAt },
                  { k: "Resolved", v: selectedRequest.resolvedAt ? new Date(selectedRequest.resolvedAt).toLocaleString() : "Unresolved", done: !!selectedRequest.resolvedAt },
                ].map((s, i) => (
                  <motion.li
                    key={s.k}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                    className="relative flex items-center justify-between gap-3 pl-6"
                  >
                    <span
                      className={`absolute left-0 h-3 w-3 rounded-full border-2 ${
 s.done ? "bg-[#C56845] border-[#FFFCF7] shadow-[0_0_0_3px_rgba(197,104,69,.2)]" : "bg-[#FFFCF7] border-[#D6C7B7]"
 }`}
                    />
                    <span className="text-[#75665D] font-medium">{s.k}</span>
                    <span className={`font-mono ${s.done ? "text-[#1C140F]" : "text-[#A2948B]"}`}>{s.v}</span>
                  </motion.li>
                ))}
              </ol>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="nv-btn-ghost px-4 py-2 rounded-xl text-xs font-medium text-[#75665D]"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                {selectedRequest.status === "NEW" && (
                  <button
                    onClick={() => promptStepConfirmation(selectedRequest, "ACKNOWLEDGED")}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="nv-btn-primary px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    Acknowledge Request
                  </button>
                )}
                {selectedRequest.status === "ACKNOWLEDGED" && (
                  <button
                    onClick={() => promptStepConfirmation(selectedRequest, "IN_PROGRESS")}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="nv-btn-soft px-4 py-2 rounded-xl text-xs font-semibold text-[#7A361E] disabled:opacity-50"
                  >
                    Start Handling
                  </button>
                )}
                {selectedRequest.status === "IN_PROGRESS" && (
                  <button
                    onClick={() => promptStepConfirmation(selectedRequest, "RESOLVED")}
                    disabled={actionLoadingMap[selectedRequest._id]}
                    className="nv-btn-dark px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    Mark as Resolved
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </MotionModal>

      <Toast message={toastMsg?.text ?? null} isError={toastMsg?.isError} onClose={() => setToastMsg(null)} />

      <SiteFooter
        left="NetraVaani Assistive HealthTech · In-Place Clinical Response System"
        right="Live sync every 2.5s"
      />
    </div>
  );
}

/* ====================================================================== */
/* Presentational helpers (UI only)                                        */
/* ====================================================================== */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#75665D] font-medium uppercase text-[10px] tracking-wider">{label}</span>
      {children}
    </div>
  );
}

function Info({ label, value, serif, accent }: { label: string; value: string; serif?: boolean; accent?: boolean }) {
  return (
    <div>
      <span className="text-[#75665D] block text-[10px] font-medium uppercase tracking-wider">{label}</span>
      <span
        className={`${serif ? "font-medium text-sm" : "font-mono"} ${accent ? "text-[#7A361E]" : "text-[#1C140F]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ModalClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="nv-btn-ghost h-8 w-8 shrink-0 grid place-items-center rounded-lg text-[#75665D] hover:text-[#1C140F] text-lg leading-none"
    >
      ×
    </button>
  );
}

const LIFECYCLE = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const;

/** Four-segment progress bar showing where a request sits in its lifecycle */
function LifecycleTrack({ req }: { req: CareRequestItem }) {
  const idx = Math.max(0, LIFECYCLE.indexOf(req.status as (typeof LIFECYCLE)[number]));
  const times = [req.createdAt, req.acknowledgedAt, req.inProgressAt, req.resolvedAt];
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {LIFECYCLE.map((s, i) => (
          <div key={s} className="h-1.5 rounded-full bg-[#E7DFD4] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${i === idx && req.status !== "RESOLVED" ? "bg-[#C56845]" : "bg-[#30251F]"}`}
              initial={{ width: 0 }}
              animate={{ width: i <= idx ? "100%" : "0%" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: EASE_OUT }}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-[#A2948B]">
        {["Created", "Acked", "Handling", "Resolved"].map((l, i) => (
          <span key={l} className={i <= idx ? "text-[#75665D]" : ""}>
            {l}
            {times[i] && (
              <span className="block text-[#30251F]/70">{new Date(times[i] as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepRail({ next }: { next: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" }) {
  const target = LIFECYCLE.indexOf(next);
  return (
    <div className="flex items-center gap-1.5">
      {LIFECYCLE.map((s, i) => (
        <React.Fragment key={s}>
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.06 }}
            className={`px-2 py-0.5 rounded-full text-[9px] font-medium uppercase tracking-wider border ${
 i === target
 ? "bg-[#C56845] text-[#FFFCF7] border-[#A84A29]"
 : i < target
 ? "bg-[#30251F] text-[#FFFCF7] border-[#30251F]"
 : "bg-[#FFFCF7] text-[#A2948B] border-[#E7DFD4]"
 }`}
          >
            {s.replace("_", " ")}
          </motion.span>
          {i < LIFECYCLE.length - 1 && <span className={`h-px flex-1 ${i < target ? "bg-[#30251F]" : "bg-[#E7DFD4]"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}
