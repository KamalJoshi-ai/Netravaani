"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  CareRequestItem,
  CareRequestStatus,
  DeviceItem,
  PatientItem,
  PredefinedCommandItem,
} from "@/lib/api";
import {
  Radio,
  Wifi,
  Cpu,
  Bed,
  CheckCircle2,
  AlertTriangle,
  Check,
  Search,
  ArrowRight,
  ArrowUpRight,
  Shield,
  Activity,
  Bluetooth,
  RefreshCw,
  LogOut,
  User,
  X,
  SlidersHorizontal,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import BleCommissioningModal from "@/components/BleCommissioningModal";
import CommandRuleEditor from "@/components/commands/CommandRuleEditor";
import { announcementFor, speak, useVoiceAlerts } from "@/lib/speech";

interface StepConfirmData {
  request: CareRequestItem;
  nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED";
  stepTitle: string;
  stepDescription: string;
  actionButtonLabel: string;
  actionButtonColor: string;
}

// 5 Predefined Clinical Firmware Commands (Hardware calibrated)
const PREDEFINED_COMMANDS = [
  {
    action: "YES",
    gesture: "2 blinks, wait",
    serial: "[cmd] YES",
    dashboard: "YES",
    instruction: "Blink twice and pause to confirm affirmative / YES",
  },
  {
    action: "WATER",
    gesture: "4+ blinks",
    serial: "[cmd] WATER",
    dashboard: "WATER",
    instruction: "Blink 4 or more rapid times to request drinking water",
  },
  {
    action: "NO",
    gesture: "Squeeze both hands together, once",
    serial: "[cmd] NO",
    dashboard: "NO",
    instruction: "Squeeze both hands together once firmly to indicate negative / NO",
  },
  {
    action: "CALL_NURSE",
    gesture: "Squeeze left hand 3 times",
    serial: "[cmd] CALL NURSE",
    dashboard: "CALL NURSE",
    instruction: "Squeeze left hand 3 times to summon bedside nurse",
  },
  {
    action: "EMERGENCY",
    gesture: "Squeeze both hands together, 3 times",
    serial: "[cmd] EMERGENCY / SEVERE PAIN",
    dashboard: "EMERGENCY, LEDs 1–4 flash red",
    instruction: "Squeeze both hands together 3 times for acute clinical emergency",
  },
];

export default function NurseDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [, setCommandsList] = useState<PredefinedCommandItem[]>([]);
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "patients" | "devices" | "history">("overview");
  const [filter, setFilter] = useState<"ALL" | CareRequestStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isBleModalOpen, setIsBleModalOpen] = useState(false);
  const [selectedDeviceDetails, setSelectedDeviceDetails] = useState<DeviceItem | null>(null);
  const [deviceDetailsTab, setDeviceDetailsTab] = useState<"overview" | "commands">("overview");
  const voice = useVoiceAlerts(requests);

  // In-place confirmation dialog state (does NOT jump to top of page)
  const [stepConfirm, setStepConfirm] = useState<StepConfirmData | null>(null);
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});
  const [nurseAssignLoading, setNurseAssignLoading] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);

  // Show toast notification
  const showToast = useCallback((msg: string, isError = false) => {
    setToastMessage(msg);
    setToastIsError(isError);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Fetch Care Requests
  const fetchRequests = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const res = await apiClient.getCareRequests({ limit: 100 });
      if (res.data) {
        setRequests(res.data);
      }
    } catch (err: unknown) {
      console.error("Failed to load care requests:", err);
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, []);

  // Fetch Patients, Devices, Commands (Filtered strictly to current nurse's registered devices)
  const fetchAuxData = useCallback(async () => {
    try {
      const currentNurse = (user?.email || user?.username || user?.name || "").trim();
      const [ptsRes, devsRes, cmdsRes] = await Promise.allSettled([
        apiClient.getPatients({ limit: 50 }),
        apiClient.getDevices({ limit: 50, registeredBy: currentNurse || undefined }),
        apiClient.getPredefinedCommands(),
      ]);

      if (ptsRes.status === "fulfilled" && ptsRes.value.data) {
        setPatients(ptsRes.value.data);
      }
      if (devsRes.status === "fulfilled" && devsRes.value.data) {
        // Multi-tenant nurse device isolation:
        // A device registered by nurse A MUST NOT appear for nurse B.
        const visibleDevices = currentNurse
          ? devsRes.value.data.filter(
              (d) =>
                !d.registeredBy ||
                d.registeredBy === currentNurse ||
                d.registeredBy === user?.email ||
                d.registeredBy === user?.username ||
                d.registeredBy === user?.name ||
                d.registeredBy === user?.id
            )
          : devsRes.value.data;
        setDevices(visibleDevices);
      }
      if (cmdsRes.status === "fulfilled" && cmdsRes.value.data) {
        setCommandsList(cmdsRes.value.data);
      }
    } catch (err) {
      console.error("Failed to fetch aux clinical data:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests(false);
    fetchAuxData();

    // Silent background telemetry polling every 3s without jumping viewport
    const interval = setInterval(() => {
      fetchRequests(false);
      fetchAuxData();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchRequests, fetchAuxData]);

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
        stepTitle: "Confirm Acknowledgment",
        stepDescription: `Acknowledge bedside alert from ${patientDisplay} (${bedDisplay})? This confirms to the station that nursing staff is attending.`,
        actionButtonLabel: "Acknowledge Call",
        actionButtonColor: "bg-[#AD5D3D] hover:bg-[#964F33] text-white",
      });
    } else if (nextStep === "IN_PROGRESS") {
      setStepConfirm({
        request: req,
        nextStep: "IN_PROGRESS",
        stepTitle: "Confirm: In-Progress Response",
        stepDescription: `Mark call as In-Progress for ${patientDisplay} (${bedDisplay})? This records your bedside intervention.`,
        actionButtonLabel: "Start Handling",
        actionButtonColor: "bg-[#2B6CB0] hover:bg-[#23588F] text-white",
      });
    } else if (nextStep === "RESOLVED") {
      setStepConfirm({
        request: req,
        nextStep: "RESOLVED",
        stepTitle: "Confirm: Complete & Resolve",
        stepDescription: `Mark this care event as Resolved for ${patientDisplay} (${bedDisplay})? This closes the telemetry event.`,
        actionButtonLabel: "Resolve Call",
        actionButtonColor: "bg-[#42765A] hover:bg-[#355F49] text-white",
      });
    }
  };

  // Execute confirmation in-place WITHOUT jumping to top of page
  const handleConfirmNextStep = async () => {
    if (!stepConfirm) return;
    const { request, nextStep } = stepConfirm;
    const reqId = request._id;

    // Capture exact viewport scroll position so the user stays right there
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
        showToast(`Moved to In-Progress for ${request.patient?.displayName || "Patient"}.`);
      } else if (nextStep === "RESOLVED") {
        const res = await apiClient.resolveCareRequest(reqId);
        updatedRes = res.data;
        showToast(`Request marked as Resolved for ${request.patient?.displayName || "Patient"}.`);
      }

      if (updatedRes) {
        setRequests((prev) => prev.map((r) => (r._id === reqId ? updatedRes! : r)));
      }

      setStepConfirm(null);

      // Restore scroll position instantly
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollY, behavior: "instant" });
        });
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to execute clinical step", true);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [reqId]: false }));
    }
  };

  // Nurse Assignment Request
  const handleRequestPatientAssignment = async (patientCode: string) => {
    setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: true }));
    try {
      await apiClient.requestNurseAssignment(patientCode, {
        nurseName: user?.name || "Staff Nurse",
        nurseId: user?.email || user?.name || "nurse-station",
        nurseRole: user?.role || "NURSE",
      });
      showToast(`Assignment requested for patient ${patientCode}. Awaiting bedside screen approval.`);
      fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to request patient link", true);
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: false }));
    }
  };

  // Nurse Direct Allocation
  const handleDirectAllocatePatient = async (patientCode: string) => {
    setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: true }));
    try {
      await apiClient.allocateNurse(patientCode, {
        nurseName: user?.name || "Staff Nurse",
        nurseId: user?.id || user?.email || "nurse-station",
        nurseRole: user?.role || "nurse",
      });
      showToast(`Patient ${patientCode} allocated to you successfully.`);
      fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to allocate patient", true);
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: false }));
    }
  };

  // Nurse Deallocate Patient
  const handleDeallocatePatient = async (patientCode: string) => {
    setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: true }));
    try {
      await apiClient.deallocateNurse(patientCode);
      showToast(`Patient ${patientCode} deallocated successfully.`);
      fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to deallocate patient", true);
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: false }));
    }
  };

  // Metrics computation (100% REAL from database, zero preserved fake values)
  const urgentCallsCount = useMemo(() => {
    return requests.filter(
      (r) =>
        (r.status === "NEW" || r.status === "ACKNOWLEDGED") &&
        (Boolean(r.urgent) || r.action === "EMERGENCY")
    ).length;
  }, [requests]);

  const awaitingResponseCount = useMemo(() => {
    return requests.filter((r) => r.status === "NEW").length;
  }, [requests]);

  const inProgressCount = useMemo(() => {
    return requests.filter((r) => r.status === "IN_PROGRESS").length;
  }, [requests]);

  const resolvedTodayCount = useMemo(() => {
    return requests.filter((r) => r.status === "RESOLVED").length;
  }, [requests]);

  const totalEventsCount = requests.length;

  // Real connected devices ratio
  const connectedDevicesCount = useMemo(() => {
    return devices.filter((d) => d.connectivityStatus === "ONLINE" || d.status === "AVAILABLE" || d.status === "ASSIGNED").length;
  }, [devices]);

  const unassignedDevicesCount = useMemo(() => {
    return devices.filter((d) => d.status === "AVAILABLE" && !d.currentAssignment).length;
  }, [devices]);

  // Filtered requests for the Live Calls tab
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (filter !== "ALL" && req.status !== filter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const pName = req.patient?.displayName?.toLowerCase() || "";
      const pBed = req.patient?.bedLabel?.toLowerCase() || "";
      const pCode = req.patient?.patientCode?.toLowerCase() || "";
      const pAction = req.action?.toLowerCase() || "";
      const pLabel = `${req.displayLabel || ""} ${req.label || ""}`.toLowerCase();
      return pName.includes(q) || pBed.includes(q) || pCode.includes(q) || pAction.includes(q) || pLabel.includes(q);
    }).sort((a, b) => {
      const openAlarm = (r: CareRequestItem) => Boolean(r.alarm) && r.status !== "RESOLVED";
      return openAlarm(a) === openAlarm(b) ? 0 : openAlarm(a) ? -1 : 1;
    });
  }, [requests, filter, searchQuery]);

  // Request name for the nurse: the rule's dashboard name, else its device label, else the legacy action
  const requestLabel = (req: CareRequestItem) =>
    req.displayLabel || req.label || req.action.replace(/_/g, " ");

  // Format relative elapsed time
  const formatElapsedTime = (dateString?: string) => {
    if (!dateString) return "just now";
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff} sec ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    const hours = Math.floor(mins / 60);
    return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  };

  // Format clock time (e.g. 14:32)
  const formatTimeOnly = (dateString?: string) => {
    if (!dateString) return "--:--";
    const d = new Date(dateString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Redirect patient away from nurse station - patients only see their own dashboard
  useEffect(() => {
    if (!authLoading && user && user.role === "patient") {
      router.push("/");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] flex items-center justify-center p-6 text-[#211C19]">
        <div className="flex items-center gap-3 bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl px-5 py-3 shadow-subtle">
          <RefreshCw className="w-5 h-5 text-[#AD5D3D] animate-spin" />
          <span className="text-sm font-semibold font-sans">Connecting to NetraVaani Clinical Command Center...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (user.role === "patient") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F5F1E9] text-[#211C19] font-sans antialiased selection:bg-[#AD5D3D]/20 selection:text-[#211C19]">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-card ${
              toastIsError
                ? "bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]"
                : "bg-[#EDF5F0] border-[#C5DDCF] text-[#42765A]"
            }`}
          >
            {toastIsError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Container - 1440px desktop viewport target */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        
        {/* TOP NAVIGATION BAR */}
        <header className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl shadow-subtle p-3.5 sm:p-4 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            
            {/* Brand Logo & Clinical Command Center */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#211C19] flex items-center justify-center shrink-0 shadow-xs">
                <span className="font-heading font-extrabold text-sm text-[#FFFCF7] tracking-wider">
                  NV
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-wordmark font-bold text-xl sm:text-2xl text-[#211C19] tracking-tight leading-none">
                    NetraVaani
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#76685F] mt-0.5 tracking-wide">
                  {activeTab === "devices"
                    ? "Assistive Gaze & Gesture Clinical Platform"
                    : "Clinical Command Center"}
                </div>
              </div>
            </div>

            {/* Right Controls: Telemetry indicator, Bedside Portal, Refresh, User */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
              {/* Telemetry Indicator */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]">
                <span className="w-2 h-2 rounded-full bg-[#42765A] animate-pulse" />
                <span>{activeTab === "devices" ? "API connected" : "System online"}</span>
              </div>

              {/* Voice alerts: reads new requests aloud, e.g. "Patient on bed 4 wants water" */}
              {voice.supported && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={voice.enabled}
                  onClick={() => voice.setEnabled(!voice.enabled)}
                  title={
                    voice.enabled
                      ? "Voice alerts on: new requests are read aloud. Click to turn off."
                      : "Turn on voice alerts to hear new requests read aloud"
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    voice.enabled
                      ? "bg-[#FAF0E6] text-[#AD5D3D] border-[#E2C7B8]"
                      : "bg-[#FFFCF7] text-[#76685F] border-[#E5D9CA] hover:text-[#211C19]"
                  }`}
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H3v6h3l5 4V5z" />
                    {voice.enabled ? (
                      <>
                        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                      </>
                    ) : (
                      <path d="m16 9 5 6m0-6-5 6" />
                    )}
                  </svg>
                  <span>{voice.needsClick ? "Voice: click to allow" : voice.enabled ? "Voice alerts on" : "Voice alerts off"}</span>
                </button>
              )}

              {/* Refresh button */}
              <button
                type="button"
                onClick={() => fetchRequests(true)}
                title="Sync clinical ledger"
                className="p-1.5 rounded-lg border border-[#E5D9CA] text-[#76685F] hover:text-[#211C19] hover:bg-[#F7F2EB] transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#AD5D3D]" : ""}`} />
              </button>

              {/* User menu / Logout */}
              <div className="flex items-center gap-2.5 pl-2 border-l border-[#E5D9CA]">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#EDE4D8]/80 text-[#211C19] text-xs font-bold">
                  <div className="w-5 h-5 rounded-full bg-[#211C19] text-white text-[10px] flex items-center justify-center font-bold">
                    {user.name?.charAt(0) || "N"}
                  </div>
                  <span className="hidden sm:inline">{user.name || "Nurse Station"}</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    if (typeof window !== "undefined") {
                      window.location.href = "/";
                    }
                  }}
                  title="Sign out of station"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-[#E5D9CA] text-[#76685F] hover:text-[#B42318] hover:border-[#FECDCA] hover:bg-[#FEF3F2] transition shadow-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Segmented Navigation Tabs */}
          <div className="mt-3.5 pt-3 border-t border-[#E5D9CA]/80 flex items-center gap-1 overflow-x-auto">
            {[
              { id: "overview", label: "Overview" },
              { id: "calls", label: `Live calls${awaitingResponseCount > 0 ? ` (${awaitingResponseCount})` : ""}` },
              { id: "patients", label: `Patients (${patients.length})` },
              { id: "devices", label: `Devices (${devices.length})` },
              { id: "history", label: "History" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    isActive
                      ? "bg-[#EFE7DC] text-[#211C19] shadow-xs"
                      : "text-[#76685F] hover:text-[#211C19] hover:bg-[#F5F1E9]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            
            {/* Page Greeting Subheader */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#211C19] tracking-tight">
                  Good evening, {user.name || "Nurse"}
                </h1>
                <p className="text-xs sm:text-sm text-[#76685F] font-medium mt-1">
                  Live clinical telemetry &amp; bedside monitoring
                </p>
              </div>
            </div>

            {/* Row of 5 Compact Metric Cards (REAL counts strictly from MongoDB) */}
            {/* Row of 5 Vivid Animated Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              
              {/* Urgent calls */}
              <div className="bg-gradient-to-br from-[#FFFCF7] to-[#FEF3F2] border border-[#FECDCA] rounded-2xl p-4 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#B42318]">Urgent calls</span>
                  <span className="w-2 h-2 rounded-full bg-[#B42318] group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-[#B42318] tracking-tight">
                  {String(urgentCallsCount).padStart(2, "0")}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#B42318]/20 mt-3 overflow-hidden">
                  <div className="h-full bg-[#B42318] rounded-full w-full" />
                </div>
              </div>

              {/* Awaiting response */}
              <div className="bg-gradient-to-br from-[#FFFCF7] to-[#FAF0E6] border border-[#E2C7B8] rounded-2xl p-4 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#AD5D3D]">Awaiting response</span>
                  <span className="w-2 h-2 rounded-full bg-[#AD5D3D] group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-[#AD5D3D] tracking-tight">
                  {String(awaitingResponseCount).padStart(2, "0")}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#AD5D3D]/20 mt-3 overflow-hidden">
                  <div className="h-full bg-[#AD5D3D] rounded-full w-full" />
                </div>
              </div>

              {/* In progress */}
              <div className="bg-gradient-to-br from-[#FFFCF7] to-[#EBF3FB] border border-[#C3DCF4] rounded-2xl p-4 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2B6CB0]">In progress</span>
                  <span className="w-2 h-2 rounded-full bg-[#2B6CB0] group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-[#2B6CB0] tracking-tight">
                  {String(inProgressCount).padStart(2, "0")}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#2B6CB0]/20 mt-3 overflow-hidden">
                  <div className="h-full bg-[#2B6CB0] rounded-full w-full" />
                </div>
              </div>

              {/* Resolved today (Vivid Clinical Green Highlight) */}
              <div className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#F4F9F6] to-[#EDF5F0] border border-[#B8DEC7] hover:border-[#42765A] rounded-2xl p-4 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#42765A]">Resolved today</span>
                  <span className="w-2 h-2 rounded-full bg-[#42765A] animate-pulse group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-2 font-heading text-3xl sm:text-4xl font-black text-[#42765A] tracking-tight">
                  {String(resolvedTodayCount).padStart(2, "0")}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#42765A]/25 mt-3 overflow-hidden">
                  <div className="h-full bg-[#42765A] rounded-full w-full" />
                </div>
              </div>

              {/* Total shift events */}
              <div className="bg-gradient-to-br from-[#FFFCF7] to-[#F5F1E9] border border-[#E5D9CA] rounded-2xl p-4 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between col-span-2 sm:col-span-1 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#76685F]">Total events</span>
                  <span className="w-2 h-2 rounded-full bg-[#76685F] group-hover:scale-125 transition-transform" />
                </div>
                <div className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-[#211C19] tracking-tight">
                  {String(totalEventsCount).padStart(2, "0")}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#76685F]/20 mt-3 overflow-hidden">
                  <div className="h-full bg-[#76685F] rounded-full w-full" />
                </div>
              </div>
            </div>

            {/* Main Overview Grid: Clinical Devices & Gesture Reference */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
              
              {/* Card 1: Clinical Device Status (6 cols) */}
              <div className="lg:col-span-6 bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading font-bold text-base sm:text-lg text-[#211C19]">
                    Clinical devices &amp; Gateways
                  </h2>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]">
                    {connectedDevicesCount} Online
                  </span>
                </div>

                {/* Bedside Gateway Status Row */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EDF5F0] border border-[#C5DDCF] text-[#42765A] flex items-center justify-center shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#211C19]">Bedside gateways</div>
                    <div className="text-xs font-semibold text-[#42765A]">
                      {connectedDevicesCount > 0 ? "Telemetry Stream Active" : "No Gateways Connected"}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E5D9CA]/80 space-y-3">
                  {/* Connected devices */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                      <span className="text-[#76685F]">Connected devices</span>
                      <span className="font-bold font-mono text-[#211C19]">
                        {String(connectedDevicesCount).padStart(2, "0")} / {String(devices.length).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#EDE4D8] overflow-hidden">
                      <div
                        className="h-full bg-[#42765A] rounded-full transition-all duration-500"
                        style={{
                          width: `${devices.length > 0 ? Math.min(100, (connectedDevicesCount / devices.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Unassigned devices */}
                  <div className="flex items-center justify-between text-xs font-medium pt-1">
                    <span className="text-[#76685F]">Unassigned devices</span>
                    <span className="font-bold text-[#AD5D3D]">
                      {unassignedDevicesCount} devices
                    </span>
                  </div>

                  {/* Manage devices action */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("devices")}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#76685F] hover:text-[#211C19] border border-[#E5D9CA] hover:bg-[#F7F2EB] transition text-center shadow-xs"
                  >
                    Manage devices
                  </button>
                </div>
              </div>

              {/* Card 2: Compact Gesture Reference (6 cols) */}
              <div className="lg:col-span-6 bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 sm:p-6 shadow-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-heading font-bold text-base sm:text-lg text-[#211C19]">
                      Gesture Reference
                    </h2>
                    <p className="text-xs text-[#76685F] font-medium">
                      Calibrated ESP32-S3 triggers
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#EDE4D8] text-[#76685F]">
                    Firmware v1.1
                  </span>
                </div>

                <div className="divide-y divide-[#E5D9CA]/70 text-xs">
                  {PREDEFINED_COMMANDS.map((cmd) => (
                    <div key={cmd.action} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#211C19] flex items-center gap-1.5">
                          <span>{cmd.dashboard}</span>
                        </div>
                        <div className="text-[11px] text-[#76685F] font-medium">{cmd.gesture}</div>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-[#76685F] bg-[#F5F1E9] px-2 py-0.5 rounded border border-[#E5D9CA] shrink-0">
                        {cmd.serial}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Bottom Full-Width Section: Recent Clinical Activity (Real from DB) */}
            <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-4 sm:p-5 shadow-subtle">
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="font-heading font-bold text-base sm:text-lg text-[#211C19]">
                  Recent clinical activity
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-bold text-[#AD5D3D] hover:underline flex items-center gap-1"
                >
                  <span>View history</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-[#E5D9CA]/80">
                {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                  <div className="py-4 text-center text-xs text-[#76685F] font-medium">
                    No clinical calls resolved yet during this shift. Real-time care events will appear here once handled.
                  </div>
                ) : (
                  requests
                    .filter((r) => r.status === "RESOLVED")
                    .slice(0, 5)
                    .map((req) => (
                      <div key={req._id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 text-[#42765A]">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-xs sm:text-sm text-[#211C19]">
                              Call resolved · {req.patient?.bedLabel || "Bedside"}
                            </div>
                            <div className="text-xs text-[#76685F]">
                              {req.patient?.displayName || "Patient"} ({requestLabel(req)}) — handled by station
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-[#76685F] shrink-0">
                          {formatTimeOnly(req.resolvedAt || req.updatedAt)}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Bottom Status Indicator */}
            <div className="text-center py-2">
              <p className="text-[11px] text-[#76685F] font-medium">
                NetraVaani Clinical Telemetry Platform · Clinical Station · Real-time patient care ledger active.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE CALLS (Full Care Ledger) */}
        {activeTab === "calls" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-extrabold text-[#211C19] tracking-tight">
                  Live Care Ledger
                </h1>
                <p className="text-xs text-[#76685F] font-medium mt-0.5">
                  Real-time bedside gaze &amp; gesture call queue
                </p>
              </div>
              {voice.supported && voice.enabled && (
                <button
                  type="button"
                  onClick={() => speak("Patient on bed 4 wants water.", { interrupt: true })}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E5D9CA] text-[#76685F] hover:text-[#AD5D3D] hover:border-[#E2C7B8] transition"
                >
                  Test voice
                </button>
              )}
            </div>

            {/* Search and Filters */}
            <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-3 shadow-subtle flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#76685F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by bed, patient, or call type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5D9CA] bg-[#FFFCF7] focus:outline-none focus:border-[#AD5D3D]"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      filter === s
                        ? "bg-[#AD5D3D] text-white shadow-xs"
                        : "bg-[#F5F1E9] text-[#76685F] hover:text-[#211C19]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Calls Table / Card List */}
            {filteredRequests.length === 0 ? (
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-8 text-center shadow-subtle space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#EDF5F0] text-[#42765A] flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-heading font-bold text-base text-[#211C19]">
                  No Bedside Calls in Queue
                </h3>
                <p className="text-xs text-[#76685F] font-medium max-w-sm mx-auto leading-relaxed">
                  Station ledger is currently clear. When a patient blinks or squeezes their calibrated sensor, calls appear here in real time.
                </p>
              </div>
            ) : (
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl shadow-subtle overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#F5ECE6]/60 border-b border-[#E5D9CA] text-[#76685F] font-semibold">
                        <th className="py-3 px-4">Status &amp; Priority</th>
                        <th className="py-3 px-4">Bed &amp; Patient</th>
                        <th className="py-3 px-4">Gesture / Request</th>
                        <th className="py-3 px-4">Elapsed</th>
                        <th className="py-3 px-4 text-right">Clinical Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5D9CA]/70">
                      {filteredRequests.map((req) => {
                        const isEmergency = req.action === "EMERGENCY" || Boolean(req.urgent) || Boolean(req.alarm);
                        return (
                          <tr
                            key={req._id}
                            className={`hover:bg-[#F7F2EB] transition ${
                              isEmergency && req.status !== "RESOLVED" ? "bg-[#FEF3F2]/40" : ""
                            }`}
                          >
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    isEmergency
                                      ? "bg-[#FEE4E2] text-[#B42318]"
                                      : req.status === "RESOLVED"
                                      ? "bg-[#EDF5F0] text-[#42765A]"
                                      : req.status === "IN_PROGRESS"
                                      ? "bg-[#EBF3FB] text-[#2B6CB0]"
                                      : "bg-[#FAF0E6] text-[#AD5D3D]"
                                  }`}
                                >
                                  {req.status}
                                </span>
                                {req.alarm && req.status !== "RESOLVED" ? (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-white bg-[#B42318] rounded-full px-2 py-0.5 flex items-center gap-1 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    Alarm
                                  </span>
                                ) : isEmergency && (
                                  <span className="text-[10px] font-bold text-[#B42318] flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Urgent
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-bold text-[#211C19]">
                                {req.patient?.bedLabel || "Bed Unassigned"}
                              </div>
                              <div className="text-[11px] text-[#76685F]">
                                {req.patient?.displayName || "Patient"} ({req.patient?.patientCode || "N/A"})
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-[#211C19]">
                                {requestLabel(req)}
                              </div>
                              <div className="text-[11px] text-[#76685F] font-mono">
                                {req.counts
                                  ? `${req.counts.eog} blinks · L${req.counts.emgLeft} · R${req.counts.emgRight}${req.counts.together ? ` · ${req.counts.together} together` : ""}`
                                  : "ESP32 Telemetry Trigger"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-[#76685F]">
                              {formatElapsedTime(req.createdAt)}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {voice.supported && (
                                <button
                                  type="button"
                                  onClick={() => voice.announce(req)}
                                  title={announcementFor(req)}
                                  aria-label={`Read aloud: ${announcementFor(req)}`}
                                  className="mr-2 p-1.5 rounded-lg border border-[#E5D9CA] text-[#76685F] hover:text-[#AD5D3D] hover:border-[#E2C7B8] transition align-middle"
                                >
                                  <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 5 6 9H3v6h3l5 4V5z" />
                                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                                  </svg>
                                </button>
                              )}
                              {req.status === "NEW" && (
                                <button
                                  type="button"
                                  onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
                                    isEmergency
                                      ? "bg-[#B42318] hover:bg-[#912018] text-white"
                                      : "bg-[#AD5D3D] hover:bg-[#964F33] text-white"
                                  }`}
                                >
                                  Acknowledge
                                </button>
                              )}
                              {req.status === "ACKNOWLEDGED" && (
                                <button
                                  type="button"
                                  onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2B6CB0] hover:bg-[#23588F] text-white transition shadow-xs"
                                >
                                  Start Handling
                                </button>
                              )}
                              {req.status === "IN_PROGRESS" && (
                                <button
                                  type="button"
                                  onClick={() => promptStepConfirmation(req, "RESOLVED")}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#42765A] hover:bg-[#355F49] text-white transition shadow-xs"
                                >
                                  Mark Resolved
                                </button>
                              )}
                              {req.status === "RESOLVED" && (
                                <span className="text-[11px] font-semibold text-[#42765A] inline-flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" />
                                  Closed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PATIENT REGISTRY & CARE MANAGEMENT */}
        {activeTab === "patients" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-extrabold text-[#211C19] tracking-tight">
                  Patient Registry &amp; Bedside Allocation
                </h1>
                <p className="text-xs text-[#76685F] font-medium mt-0.5">
                  Direct Nurse Care Allocation &amp; Telemetry Streams
                </p>
              </div>
            </div>

            {/* Patients Grid */}
            {patients.length === 0 ? (
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-8 text-center shadow-subtle space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#FAF0E6] text-[#AD5D3D] flex items-center justify-center mx-auto">
                  <User className="w-6 h-6" />
                </div>
                <h3 className="font-heading font-bold text-base text-[#211C19]">
                  No Patients Available
                </h3>
                <p className="text-xs text-[#76685F] font-medium max-w-sm mx-auto leading-relaxed">
                  Patients will appear here automatically as soon as they sign up on NetraVaani.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {patients.map((pt) => {
                  const assignedDevice = pt.currentAssignment?.device;
                  const nurseAuth = pt.nurseAssignment;
                  return (
                    <div
                      key={pt._id}
                      className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#FFFCF7] to-[#F2F8F4] border border-[#CDE2D5] hover:border-[#42765A] rounded-2xl p-4 sm:p-5 shadow-subtle hover:shadow-hover hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between space-y-4 relative overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#42765A] via-[#5EA780] to-[#42765A]" />
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-[#76685F]">
                            {pt.patientCode}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF5F0] text-[#42765A]">
                            {pt.bedLabel || "Bed Unassigned"}
                          </span>
                        </div>

                        <h3 className="font-heading font-bold text-base text-[#211C19] mt-2">
                          {pt.displayName}
                        </h3>

                        {/* Device allocation */}
                        <div className="mt-3 pt-3 border-t border-[#E5D9CA]/80 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#76685F]">Assigned Device:</span>
                            <span className="font-mono font-bold text-[#211C19]">
                              {assignedDevice?.name || assignedDevice?.deviceId || "No Device Linked"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#76685F]">Care Link Status:</span>
                            <span
                              className={`font-semibold ${
                                nurseAuth?.status === "APPROVED"
                                  ? "text-[#42765A]"
                                  : nurseAuth?.status === "PENDING"
                                  ? "text-[#AD5D3D]"
                                  : "text-[#76685F]"
                              }`}
                            >
                              {nurseAuth?.status || "NONE"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions: Nurse Link */}
                      <div className="pt-3 border-t border-[#E5D9CA]/80 space-y-2">

                        {/* Nurse Authorization Link Button */}
                        {nurseAuth?.status === "PENDING" ? (
                          <div className="space-y-2">
                            <div className="text-center text-xs text-[#AD5D3D] font-semibold py-1">
                              Awaiting bedside screen approval
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={nurseAssignLoading[pt.patientCode]}
                                onClick={() => handleDirectAllocatePatient(pt.patientCode)}
                                className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-[#42765A] text-white hover:bg-[#355F49] transition text-center shadow-xs"
                              >
                                Allocate Directly
                              </button>
                              <button
                                type="button"
                                disabled={nurseAssignLoading[pt.patientCode]}
                                onClick={() => handleDeallocatePatient(pt.patientCode)}
                                className="py-1.5 px-2.5 rounded-xl text-[11px] font-bold bg-[#FFFCF7] border border-[#E5D9CA] text-[#76685F] hover:text-[#B42318] hover:bg-[#FEF3F2] transition text-center shadow-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : nurseAuth?.status === "APPROVED" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-center gap-1.5 text-xs text-[#42765A] font-semibold py-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Linked to {nurseAuth.nurseName || "Nurse"}</span>
                            </div>
                            <button
                              type="button"
                              disabled={nurseAssignLoading[pt.patientCode]}
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="w-full py-1.5 px-3 rounded-xl text-xs font-bold bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] hover:bg-[#FEE4E2] transition text-center shadow-xs"
                            >
                              {nurseAssignLoading[pt.patientCode] ? "Deallocating..." : "Deallocate Patient"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={nurseAssignLoading[pt.patientCode]}
                              onClick={() => handleDirectAllocatePatient(pt.patientCode)}
                              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#42765A] text-white hover:bg-[#355F49] transition text-center shadow-xs"
                            >
                              {nurseAssignLoading[pt.patientCode] ? "Allocating..." : "Allocate Patient"}
                            </button>
                            <button
                              type="button"
                              title="Send approval request to bedside"
                              disabled={nurseAssignLoading[pt.patientCode]}
                              onClick={() => handleRequestPatientAssignment(pt.patientCode)}
                              className="py-2 px-2.5 rounded-xl text-xs font-bold bg-[#FFFCF7] border border-[#E5D9CA] text-[#76685F] hover:text-[#211C19] hover:bg-[#F7F2EB] transition text-center shadow-xs"
                            >
                              Request Link
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DEVICES (Device Management) */}
        {activeTab === "devices" && (
          <div className="space-y-6">
            
            {/* Header with Breadcrumb */}
            <div>
              <div className="text-[11px] font-bold text-[#AD5D3D] uppercase tracking-wider">
                HARDWARE OPERATIONS / REGISTRY
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#211C19] tracking-tight mt-1">
                Device Management
              </h1>
              <p className="text-xs sm:text-sm text-[#76685F] font-medium mt-1">
                Register bedside gateways, manage patient assignments, and monitor incoming telemetry.
              </p>
            </div>

            {/* 4 Stat Cards Row (100% Real from DB) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              
              {/* Registered devices */}
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-4 shadow-subtle flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[#AD5D3D]">
                  <Cpu className="w-4 h-4" />
                  <span className="text-xs font-semibold text-[#76685F]">Registered devices</span>
                </div>
                <div className="mt-2 font-heading text-3xl font-extrabold text-[#211C19] tracking-tight">
                  {String(devices.length).padStart(2, "0")}
                </div>
                <span className="text-[11px] text-[#76685F] mt-1 font-medium">Registered units</span>
              </div>

              {/* Online */}
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-4 shadow-subtle flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[#42765A]">
                  <Radio className="w-4 h-4" />
                  <span className="text-xs font-semibold text-[#76685F]">Online</span>
                </div>
                <div className="mt-2 font-heading text-3xl font-extrabold text-[#42765A] tracking-tight">
                  {String(connectedDevicesCount).padStart(2, "0")}
                </div>
                <span className="text-[11px] text-[#76685F] mt-1 font-medium">Reachable gateways</span>
              </div>

              {/* Assigned */}
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-4 shadow-subtle flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[#2B6CB0]">
                  <Bed className="w-4 h-4" />
                  <span className="text-xs font-semibold text-[#76685F]">Assigned</span>
                </div>
                <div className="mt-2 font-heading text-3xl font-extrabold text-[#2B6CB0] tracking-tight">
                  {String(devices.filter((d) => d.currentAssignment).length).padStart(2, "0")}
                </div>
                <span className="text-[11px] text-[#76685F] mt-1 font-medium">Patient-bed links</span>
              </div>

              {/* Telemetry alerts */}
              <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-4 shadow-subtle flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[#AD5D3D]">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-semibold text-[#76685F]">Telemetry alerts</span>
                </div>
                <div className="mt-2 font-heading text-3xl font-extrabold text-[#AD5D3D] tracking-tight">
                  {String(urgentCallsCount).padStart(2, "0")}
                </div>
                <span className="text-[11px] text-[#76685F] mt-1 font-medium">Requires review</span>
              </div>
            </div>

            {/* Register a bedside device (Commissioning Wizard Card) */}
            <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
              
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#FAF0E6] text-[#AD5D3D] flex items-center justify-center shrink-0 border border-[#E2C7B8]">
                  <Bluetooth className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base sm:text-lg text-[#211C19]">
                    Register a bedside device
                  </h2>
                  <p className="text-xs sm:text-sm text-[#76685F] font-medium mt-0.5">
                    Commission an NPG Lite gateway and connect it to hospital Wi-Fi.
                  </p>
                </div>
              </div>

              {/* 4-Step Wizard Tiles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                
                {/* Step 1 */}
                <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-3.5 shadow-xs">
                  <div className="text-[10px] font-mono font-bold text-[#76685F] uppercase tracking-wider">
                    STEP 01
                  </div>
                  <div className="text-[#AD5D3D] my-1.5">
                    <Bluetooth className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-[#211C19]">
                    Discover hardware
                  </div>
                  <div className="text-[11px] text-[#76685F] font-medium mt-0.5">
                    Find nearby NPG Lite devices
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-3.5 shadow-xs">
                  <div className="text-[10px] font-mono font-bold text-[#76685F] uppercase tracking-wider">
                    STEP 02
                  </div>
                  <div className="text-[#AD5D3D] my-1.5">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-[#211C19]">
                    Configure network
                  </div>
                  <div className="text-[11px] text-[#76685F] font-medium mt-0.5">
                    Provision Wi-Fi and verify connection
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-3.5 shadow-xs">
                  <div className="text-[10px] font-mono font-bold text-[#76685F] uppercase tracking-wider">
                    STEP 03
                  </div>
                  <div className="text-[#AD5D3D] my-1.5">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-[#211C19]">
                    Register device
                  </div>
                  <div className="text-[11px] text-[#76685F] font-medium mt-0.5">
                    Save hardware ID and metadata
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-xl p-3.5 shadow-xs">
                  <div className="text-[10px] font-mono font-bold text-[#76685F] uppercase tracking-wider">
                    STEP 04
                  </div>
                  <div className="text-[#AD5D3D] my-1.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-[#211C19]">
                    Verify telemetry
                  </div>
                  <div className="text-[11px] text-[#76685F] font-medium mt-0.5">
                    Confirm real events reach the API
                  </div>
                </div>
              </div>

              {/* CTA Button: Design commissioning wizard → */}
              <button
                type="button"
                onClick={() => setIsBleModalOpen(true)}
                className="w-full py-3 px-5 rounded-xl font-bold text-xs sm:text-sm bg-[#211C19] hover:bg-[#362E2A] text-white transition shadow-sm flex items-center justify-center gap-2"
              >
                <span>Design commissioning wizard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Registered Devices List (100% Real from DB) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading font-bold text-base sm:text-lg text-[#211C19]">
                      Registered devices
                    </h2>
                    <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-[#FAF0E6] text-[#AD5D3D] border border-[#E2C7B8]">
                      {devices.length} devices
                    </span>
                  </div>
                  <p className="text-xs text-[#76685F] font-medium mt-0.5">
                    Hardware inventory and assignment status
                  </p>
                </div>
              </div>

              {/* Devices Cards */}
              {devices.length === 0 ? (
                <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-8 text-center shadow-subtle space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#FAF0E6] text-[#AD5D3D] flex items-center justify-center mx-auto">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="font-heading font-bold text-base text-[#211C19]">
                    No Bedside Gateways Registered Yet
                  </h3>
                  <p className="text-xs text-[#76685F] font-medium max-w-sm mx-auto leading-relaxed">
                    Commission an ESP32-S3 bedside gateway using Web Bluetooth or register hardware directly below.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsBleModalOpen(true)}
                    className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#AD5D3D] text-white hover:bg-[#964F33] transition"
                  >
                    + Commission Gateway via BLE
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {devices.map((d) => (
                    <div
                      key={d._id}
                      className="card-clinical-green bg-gradient-to-br from-[#FFFCF7] via-[#FFFCF7] to-[#F2F8F4] border border-[#CDE2D5] hover:border-[#42765A] rounded-2xl p-4 sm:p-5 shadow-subtle hover:shadow-hover hover:-translate-y-0.5 transition-all duration-200 space-y-3 relative overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#42765A] via-[#5EA780] to-[#42765A]" />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#EDF5F0] border border-[#C5DDCF] text-[#42765A] flex items-center justify-center shrink-0">
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-heading font-bold text-sm sm:text-base text-[#211C19]">
                              {d.name || d.deviceId}
                            </h3>
                            <div className="text-xs font-mono text-[#76685F]">
                              {d.hardwareId || d.deviceId} · FW {d.firmwareVersion || "v1.1.1"}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            d.connectivityStatus === "ONLINE" || d.status === "AVAILABLE" || d.status === "ASSIGNED"
                              ? "bg-[#EDF5F0] text-[#42765A] border border-[#C5DDCF]"
                              : "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]"
                          }`}
                        >
                          {d.connectivityStatus === "ONLINE" ? "Online" : d.status}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-[#E5D9CA]/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[#76685F] block">Assigned bed</span>
                          <span className="font-bold text-[#211C19]">
                            {d.currentAssignment?.patient?.bedLabel || "Unassigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#76685F] block">Patient</span>
                          <span className="font-bold text-[#211C19]">
                            {d.currentAssignment?.patient?.displayName || "Unassigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#76685F] block">Last telemetry</span>
                          <span className="font-mono text-[#76685F]">
                            {formatElapsedTime(d.lastSeenAt || d.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDeviceDetailsTab("overview");
                            setSelectedDeviceDetails(d);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#76685F] hover:text-[#211C19] border border-[#E5D9CA] hover:bg-[#F7F2EB] transition text-center shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <span>View device details</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeviceDetailsTab("commands");
                            setSelectedDeviceDetails(d);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#AD5D3D] hover:text-[#964F33] border border-[#E2C7B8] bg-[#FAF0E6]/60 hover:bg-[#F5ECE6] transition text-center shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Commands</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Status */}
            <div className="text-center py-2">
              <p className="text-[11px] text-[#76685F] font-medium">
                Hardware registry connected to NetraVaani device management cluster.
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-extrabold text-[#211C19] tracking-tight">
                Clinical Shift History
              </h1>
              <p className="text-xs text-[#76685F] font-medium mt-0.5">
                Audit trail of care resolutions and bedside telemetry alerts
              </p>
            </div>

            <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 shadow-subtle divide-y divide-[#E5D9CA]/80">
              {requests
                .filter((r) => r.status === "RESOLVED")
                .map((req) => (
                  <div key={req._id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-[#42765A]">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-[#211C19]">
                          Resolved: {requestLabel(req)} · {req.patient?.bedLabel || "Bedside"}
                        </div>
                        <div className="text-xs text-[#76685F] mt-0.5">
                          Patient {req.patient?.displayName || "Patient"} ({req.patient?.patientCode || "N/A"}) · Handled by nursing station
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-[#76685F]">
                      {formatTimeOnly(req.resolvedAt || req.updatedAt)}
                    </span>
                  </div>
                ))}
              {requests.filter((r) => r.status === "RESOLVED").length === 0 && (
                <div className="py-6 text-center text-xs text-[#76685F]">
                  No resolved records yet for this clinical shift.
                </div>
              )}
            </div>
          </div>
        )}

      </div>



      {/* IN-PLACE CONFIRMATION DIALOG (Crucial: Does NOT jump to top of page) */}
      {stepConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#211C19]/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-hover animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF0E6] text-[#AD5D3D] flex items-center justify-center border border-[#E2C7B8] shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-base text-[#211C19]">
                  {stepConfirm.stepTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="text-[#76685F] hover:text-[#211C19] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#76685F] mt-3 leading-relaxed">
              {stepConfirm.stepDescription}
            </p>

            <div className="mt-5 pt-3 border-t border-[#E5D9CA] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#76685F] hover:bg-[#F5F1E9] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingMap[stepConfirm.request._id]}
                onClick={handleConfirmNextStep}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${stepConfirm.actionButtonColor}`}
              >
                {actionLoadingMap[stepConfirm.request._id] ? "Updating..." : stepConfirm.actionButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* DEVICE DETAILS MODAL */}
      {selectedDeviceDetails && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#211C19]/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            className={`bg-[#FFFCF7] border border-[#E5D9CA] rounded-2xl p-5 sm:p-6 w-full shadow-hover max-h-[92vh] overflow-y-auto transition-[max-width] duration-300 ${
              deviceDetailsTab === "commands" ? "max-w-6xl" : "max-w-md"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-base text-[#211C19]">
                {deviceDetailsTab === "commands" ? `${selectedDeviceDetails.name} · Commands` : "Device Telemetry Details"}
              </h3>
              <button
                type="button"
                aria-label="Close device details"
                onClick={() => {
                  setSelectedDeviceDetails(null);
                  setDeviceDetailsTab("overview");
                }}
                className="text-[#76685F] hover:text-[#211C19] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div role="tablist" aria-label="Device details" className="mb-4 inline-flex rounded-xl bg-[#F0EAE1] p-1 text-xs font-bold">
              {(["overview", "commands"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={deviceDetailsTab === t}
                  onClick={() => setDeviceDetailsTab(t)}
                  className={`rounded-lg px-3.5 py-1.5 transition ${
                    deviceDetailsTab === t ? "bg-[#FFFCF7] text-[#AD5D3D] shadow-subtle" : "text-[#76685F] hover:text-[#211C19]"
                  }`}
                >
                  {t === "overview" ? "Overview" : "Commands"}
                </button>
              ))}
            </div>

            {deviceDetailsTab === "commands" ? (
              <CommandRuleEditor deviceId={selectedDeviceDetails.deviceId} />
            ) : (
            <>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#E5D9CA]/60">
                <span className="text-[#76685F]">Device Name</span>
                <span className="font-bold text-[#211C19]">{selectedDeviceDetails.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5D9CA]/60">
                <span className="text-[#76685F]">Device ID</span>
                <span className="font-mono text-[#211C19]">{selectedDeviceDetails.deviceId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5D9CA]/60">
                <span className="text-[#76685F]">Firmware Version</span>
                <span className="font-mono text-[#211C19]">{selectedDeviceDetails.firmwareVersion || "v1.1.1"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5D9CA]/60">
                <span className="text-[#76685F]">Connectivity</span>
                <span className="font-bold text-[#42765A]">{selectedDeviceDetails.connectivityStatus || "ONLINE"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#76685F]">Assigned Bed</span>
                <span className="font-bold text-[#211C19]">
                  {selectedDeviceDetails.currentAssignment?.patient?.bedLabel || "Unassigned"}
                </span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#E5D9CA] text-right">
              <button
                type="button"
                onClick={() => setSelectedDeviceDetails(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#211C19] text-white hover:bg-[#362E2A] transition"
              >
                Done
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* BLE COMMISSIONING MODAL */}
      <BleCommissioningModal
        isOpen={isBleModalOpen}
        onClose={() => setIsBleModalOpen(false)}
        registeredBy={user?.email || user?.username || user?.name}
        onDeviceCommissioned={(dev) => {
          setIsBleModalOpen(false);
          showToast(`Gateway ${dev.name || dev.deviceId} successfully commissioned!`);
          fetchAuxData();
        }}
      />
    </div>
  );
}
