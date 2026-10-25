"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  BedItem,
  CareRequestItem,
  CareRequestStatus,
  DeviceItem,
  PatientItem,
} from "@/lib/api";
import {
  Radio,
  Bed,
  CheckCircle2,
  AlertTriangle,
  Check,
  Search,
  ArrowRight,
  Bluetooth,
  RefreshCw,
  LogOut,
  User,
  X,
  Link2,
  Unlink,
  Plus,
  Bell,
  Shield,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import LoginForm from "@/components/LoginForm";
import BleCommissioningModal from "@/components/BleCommissioningModal";
import { useVoiceAlerts } from "@/lib/speech";

interface StepConfirmData {
  request: CareRequestItem;
  nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED";
  stepTitle: string;
  stepDescription: string;
  actionButtonLabel: string;
  actionButtonColor: string;
}

export default function NurseDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [requests, setRequests] = useState<CareRequestItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [beds, setBeds] = useState<BedItem[]>([]);
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "patients" | "devices" | "history">("overview");
  const [filter, setFilter] = useState<"ALL" | CareRequestStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isBleModalOpen, setIsBleModalOpen] = useState(false);
  const voice = useVoiceAlerts(requests);

  // Device Allocation state (Strict 1-to-1 without manual entry or silent switch)
  const [allocateModalPatient, setAllocateModalPatient] = useState<PatientItem | null>(null);
  const [selectedAllocateDeviceId, setSelectedAllocateDeviceId] = useState<string>("");
  const [allocatingDevice, setAllocatingDevice] = useState(false);
  const [deviceDeallocatingMap, setDeviceDeallocatingMap] = useState<Record<string, boolean>>({});

  // Add Patient Modal State (Nurse-controlled registration requiring available bed)
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientBedNumber, setNewPatientBedNumber] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);

  // Propose Bed Change Modal State
  const [isBedChangeModalOpen, setIsBedChangeModalOpen] = useState(false);
  const [bedChangePatient, setBedChangePatient] = useState<PatientItem | null>(null);
  const [selectedNewBedNumber, setSelectedNewBedNumber] = useState("");
  const [proposingBed, setProposingBed] = useState(false);

  // Care Link Request Modal State (Enter Bed Number + Patient-only Approval)
  const [careLinkModalPatient, setCareLinkModalPatient] = useState<PatientItem | null>(null);
  const [careLinkBedNumber, setCareLinkBedNumber] = useState("");

  // In-place confirmation dialog state
  const [stepConfirm, setStepConfirm] = useState<StepConfirmData | null>(null);
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
      if (res?.data) {
        setRequests(res.data);
      }
    } catch (err: unknown) {
      console.error("Failed to load care requests:", err);
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, []);

  // Fetch Patients, Devices, Beds
  const fetchAuxData = useCallback(async () => {
    try {
      const currentNurse = (user?.email || user?.username || user?.name || "").trim();
      const [ptsRes, devsRes, bedsRes] = await Promise.allSettled([
        apiClient.getPatients({ limit: 100 }),
        apiClient.getDevices({ limit: 100, registeredBy: currentNurse || undefined }),
        apiClient.listBeds(),
      ]);

      if (ptsRes.status === "fulfilled" && ptsRes.value?.data) {
        setPatients(ptsRes.value.data);
      }
      if (devsRes.status === "fulfilled" && devsRes.value?.data) {
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
      if (bedsRes.status === "fulfilled" && bedsRes.value?.data) {
        setBeds(bedsRes.value.data);
      }
    } catch (err) {
      console.error("Failed to fetch clinical state:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests(false);
    fetchAuxData();
    const interval = setInterval(() => {
      fetchRequests(false);
      fetchAuxData();
    }, 3500);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchAuxData]);

  // Available beds for registration and bed change
  const availableBeds = useMemo(() => {
    return beds.filter((b) => b.status === "AVAILABLE");
  }, [beds]);

  // Open modal targeting patient to allocate an available device
  const handleOpenAllocateToPatient = (patient: PatientItem) => {
    if (patient.currentAssignment?.device) {
      showToast(
        `Patient ${patient.displayName} already has device ${patient.currentAssignment.device.deviceId} allocated. Unassign the current device before allocating a new one.`,
        true
      );
      return;
    }
    setAllocateModalPatient(patient);
    const availableOnlineDevice = devices.find(
      (d) =>
        d.status === "AVAILABLE" &&
        !d.currentAssignment &&
        d.connectivityStatus === "ONLINE"
    );
    setSelectedAllocateDeviceId(availableOnlineDevice?.deviceId || "");
  };

  const handleCloseAllocateModal = () => {
    setAllocateModalPatient(null);
    setSelectedAllocateDeviceId("");
  };

  // Submit device allocation
  const handleConfirmAllocateDevice = async () => {
    if (!allocateModalPatient || !selectedAllocateDeviceId) {
      showToast("Please select an available online device.", true);
      return;
    }
    const targetDev = devices.find(
      (d) => d.deviceId.toLowerCase() === selectedAllocateDeviceId.toLowerCase()
    );
    if (!targetDev) {
      showToast("Selected device not found in registry.", true);
      return;
    }
    if (targetDev.status === "ASSIGNED" || targetDev.currentAssignment) {
      showToast("Device is already assigned to another patient.", true);
      return;
    }
    if (targetDev.connectivityStatus !== "ONLINE") {
      showToast("Device is offline. Gateway must be online before allocation.", true);
      return;
    }

    setAllocatingDevice(true);
    try {
      await apiClient.allocateDeviceToPatient(
        allocateModalPatient.patientCode,
        targetDev.deviceId,
        user?.name || user?.email || "Staff Nurse"
      );
      showToast(`Device ${targetDev.deviceId} allocated to ${allocateModalPatient.displayName} successfully!`);
      handleCloseAllocateModal();
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to assign device", true);
    } finally {
      setAllocatingDevice(false);
    }
  };

  // Deallocate device
  const handleDeallocateDevice = async (deviceId: string, patientNameOrCode?: string) => {
    setDeviceDeallocatingMap((prev) => ({ ...prev, [deviceId]: true }));
    try {
      await apiClient.unassignDevice(deviceId);
      showToast(`Device ${deviceId} unassigned from ${patientNameOrCode || "patient"} successfully.`);
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to unassign device", true);
    } finally {
      setDeviceDeallocatingMap((prev) => ({ ...prev, [deviceId]: false }));
    }
  };

  // Initiate Patient Registration with Selected Bed
  const handleInitiatePatientRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) {
      showToast("Please enter patient full name.", true);
      return;
    }
    if (!newPatientBedNumber.trim()) {
      showToast("Please select an available hospital bed.", true);
      return;
    }

    setCreatingPatient(true);
    try {
      const res = await apiClient.initiatePatientWithBed({
        displayName: newPatientName.trim(),
        bedNumber: newPatientBedNumber.trim(),
      });
      if (res?.data) {
        showToast(
          `Registration initiated for ${res.data.patient.displayName}! Bed ${newPatientBedNumber} marked pending patient approval.`
        );
      }
      setIsAddPatientModalOpen(false);
      setNewPatientName("");
      setNewPatientBedNumber("");
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to initiate patient registration", true);
    } finally {
      setCreatingPatient(false);
    }
  };

  // Open Bed Change Modal
  const handleOpenBedChangeModal = (pt: PatientItem) => {
    setBedChangePatient(pt);
    setSelectedNewBedNumber("");
    setIsBedChangeModalOpen(true);
  };

  // Submit Bed Change Proposal
  const handleConfirmProposeBedChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedChangePatient || !selectedNewBedNumber) {
      showToast("Please select a new available bed to propose.", true);
      return;
    }
    setProposingBed(true);
    try {
      await apiClient.proposeBedChange(bedChangePatient.patientCode, selectedNewBedNumber);
      showToast(
        `Proposed Bed ${selectedNewBedNumber} for ${bedChangePatient.displayName}. Existing bed retained until patient approves.`
      );
      setIsBedChangeModalOpen(false);
      setBedChangePatient(null);
      setSelectedNewBedNumber("");
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to propose bed change", true);
    } finally {
      setProposingBed(false);
    }
  };

  // Open Care Link Request Modal so nurse can enter/verify bed number
  const handleOpenCareLinkModal = (pt: PatientItem) => {
    setCareLinkModalPatient(pt);
    setCareLinkBedNumber(pt.pendingBedLabel || pt.bedLabel || "");
  };

  // Submit Care Link Request with entered bed number (Only patient can approve)
  const handleConfirmSendCareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careLinkModalPatient || !careLinkBedNumber.trim()) {
      showToast("Please enter a valid bed number", true);
      return;
    }
    const ptCode = careLinkModalPatient.patientCode;
    const bed = careLinkBedNumber.trim().toUpperCase();
    setNurseAssignLoading((prev) => ({ ...prev, [ptCode]: true }));
    try {
      await apiClient.requestNurseAssignment(ptCode, {
        nurseName: user?.name || "Staff Nurse",
        nurseId: user?.id,
        nurseRole: user?.role || "NURSE",
        bedNumber: bed,
      });
      showToast(`Care link request for Bed ${bed} dispatched to ${careLinkModalPatient.displayName}. Only the patient can approve it.`);
      setCareLinkModalPatient(null);
      fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to send care link request", true);
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [ptCode]: false }));
    }
  };


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

  // Step advancement confirmation
  const promptStepConfirmation = (
    req: CareRequestItem,
    nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED"
  ) => {
    const pName = req.patient?.displayName || req.patient?.patientCode || "Patient";
    const pBed = req.patient?.bedLabel || "Bed";
    const act = req.displayLabel || req.label || req.action.replace(/_/g, " ");

    if (nextStep === "ACKNOWLEDGED") {
      setStepConfirm({
        request: req,
        nextStep: "ACKNOWLEDGED",
        stepTitle: "Acknowledge Care Request",
        stepDescription: `Acknowledge ${act} call from ${pName} on ${pBed}?`,
        actionButtonLabel: "Confirm Acknowledge",
        actionButtonColor: "bg-[#2563EB] hover:bg-[#1D4ED8]",
      });
    } else if (nextStep === "IN_PROGRESS") {
      setStepConfirm({
        request: req,
        nextStep: "IN_PROGRESS",
        stepTitle: "Start Handling Request",
        stepDescription: `Are you en route or currently assisting ${pName} on ${pBed}?`,
        actionButtonLabel: "Start Handling",
        actionButtonColor: "bg-[#2563EB] hover:bg-[#1D4ED8]",
      });
    } else if (nextStep === "RESOLVED") {
      setStepConfirm({
        request: req,
        nextStep: "RESOLVED",
        stepTitle: "Mark Request Resolved",
        stepDescription: `Confirm care for ${act} has been completed for ${pName} on ${pBed}?`,
        actionButtonLabel: "Complete & Resolve",
        actionButtonColor: "bg-[#059669] hover:bg-[#047857]",
      });
    }
  };

  const executeStepConfirmation = async () => {
    if (!stepConfirm) return;
    const { request, nextStep } = stepConfirm;
    setStepConfirm(null);
    try {
      if (nextStep === "ACKNOWLEDGED") {
        await apiClient.acknowledgeCareRequest(request._id);
        showToast("Request acknowledged.");
      } else if (nextStep === "IN_PROGRESS") {
        await apiClient.startHandlingCareRequest(request._id);
        showToast("Request marked In Progress.");
      } else if (nextStep === "RESOLVED") {
        await apiClient.resolveCareRequest(request._id);
        showToast("Request resolved and closed.");
      }
      await fetchRequests(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed", true);
    }
  };

  // Filtered requests for the Live Calls tab
  const filteredRequests = useMemo(() => {
    return requests
      .filter((req) => {
        if (filter !== "ALL" && req.status !== filter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const pName = req.patient?.displayName?.toLowerCase() || "";
        const pBed = req.patient?.bedLabel?.toLowerCase() || "";
        const pCode = req.patient?.patientCode?.toLowerCase() || "";
        const pAction = req.action?.toLowerCase() || "";
        return pName.includes(q) || pBed.includes(q) || pCode.includes(q) || pAction.includes(q);
      })
      .sort((a, b) => {
        const openAlarm = (r: CareRequestItem) => Boolean(r.alarm) && r.status !== "RESOLVED";
        return openAlarm(a) === openAlarm(b) ? 0 : openAlarm(a) ? -1 : 1;
      });
  }, [requests, filter, searchQuery]);

  // Redirect patient away from nurse station
  useEffect(() => {
    if (!authLoading && user && user.role === "patient") {
      router.push("/");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-[#0F172A]">
        <div className="flex items-center gap-3 bg-white border border-[#E2E8F0] rounded-xl px-5 py-3 shadow-md">
          <RefreshCw className="w-5 h-5 text-[#059669] animate-spin" />
          <span className="text-sm font-semibold font-sans text-[#0F172A]">Connecting to Nurse Station...</span>
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

  const occupiedBedsCount = beds.filter((b) => b.status === "OCCUPIED").length;
  const pendingBedsCount = beds.filter((b) => b.status === "PENDING_APPROVAL").length;
  const availableBedsCount = beds.filter((b) => b.status === "AVAILABLE").length;
  const onlineDevicesCount = devices.filter((d) => d.connectivityStatus === "ONLINE").length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] font-sans antialiased transition-colors duration-150">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-md ${
              toastIsError
                ? "bg-[#FEF2F2] dark:bg-[#450A0A] border-[#FCA5A5] dark:border-[#991B1B] text-[#B91C1C] dark:text-[#FCA5A5]"
                : "bg-[#ECFDF5] dark:bg-[#064E3B] border-[#A7F3D0] dark:border-[#059669] text-[#047857] dark:text-[#A7F3D0]"
            }`}
          >
            {toastIsError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        
        {/* TOP NAVIGATION BAR - Light, Crisp, Solid Accents */}
        <header className="bg-white dark:bg-[#131B2E] border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl p-3.5 sm:p-4 mb-6 shadow-xs">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            
            {/* Brand Logo & Prominent NURSE Role Label */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#059669] text-white flex items-center justify-center shrink-0 font-extrabold text-sm tracking-wider shadow-xs">
                NV
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-xl sm:text-2xl text-[#0F172A] dark:text-[#F8FAFC] tracking-tight leading-none">
                    Nurse Dashboard
                  </span>
                  {/* Explicit Role Identifier */}
                  <span className="px-2.5 py-0.5 rounded-md font-bold text-xs bg-[#059669] text-white tracking-wider uppercase shadow-xs">
                    NURSE
                  </span>
                </div>
                <div className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 font-medium">
                  Clinical Station Desk &bull; Logged in as <strong className="text-[#0F172A] dark:text-[#F8FAFC]">{user.name}</strong>
                  {user.username && <span> (@{user.username})</span>}
                </div>
              </div>
            </div>

            {/* Right Controls: Theme Toggle, Voice alerts, Refresh, Sign out */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
              {/* Dark / Light Mode Toggle */}
              <ThemeToggle />

              {/* Voice alerts */}
              {voice.supported && (
                <button
                  type="button"
                  onClick={() => voice.setEnabled(!voice.enabled)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition shadow-xs ${
                    voice.enabled
                      ? "bg-[#ECFDF5] dark:bg-[#064E3B] text-[#047857] dark:text-[#A7F3D0] border-[#10B981] dark:border-[#059669]"
                      : "bg-[#F8FAFC] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] border-[#E2E8F0] dark:border-[#334155] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{voice.enabled ? "Voice: On" : "Voice: Off"}</span>
                </button>
              )}

              {/* Refresh button */}
              <button
                type="button"
                onClick={() => {
                  fetchRequests(true);
                  fetchAuxData();
                }}
                title="Sync clinical ledger"
                className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:border-[#059669] transition shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#059669]" : ""}`} />
              </button>

              {/* Logout button */}
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
            </div>
          </div>

          {/* Segmented Navigation Tabs - Solid Colors */}
          <div className="mt-3.5 pt-3 border-t border-[#E2E8F0] flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: "overview", label: "Overview" },
              { id: "calls", label: `Live Calls (${requests.filter((r) => r.status !== "RESOLVED").length})` },
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
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shadow-xs ${
                    isActive
                      ? "bg-[#059669] text-white"
                      : "bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0] border border-[#CBD5E1]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* TAB 1: OVERVIEW - Colorful Solid Metric Blocks */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            
            {/* Hospital Beds Overview & Device Gateways Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
              
              {/* Card 1: Hospital Beds Ward Status */}
              <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                      <Bed className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-[#0F172A]">
                        Hospital Beds Occupancy
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Nurse-controlled bed allocation ledger
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPatientModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Register Patient</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#10B981] text-center shadow-xs">
                    <span className="text-xs text-[#065F46] font-semibold block">Available</span>
                    <span className="text-2xl font-bold text-[#047857]">{availableBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FFFBEB] border border-[#F59E0B] text-center shadow-xs">
                    <span className="text-xs text-[#92400E] font-semibold block">Pending Approval</span>
                    <span className="text-2xl font-bold text-[#B45309]">{pendingBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#3B82F6] text-center shadow-xs">
                    <span className="text-xs text-[#1E40AF] font-semibold block">Occupied</span>
                    <span className="text-2xl font-bold text-[#1D4ED8]">{occupiedBedsCount}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("patients")}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold text-[#475569] hover:text-[#0F172A] bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#059669] transition text-center shadow-xs"
                  >
                    Manage Patients &amp; Bed Assignments
                  </button>
                </div>
              </div>

              {/* Card 2: NPG Device Gateways Registry */}
              <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-[#0F172A]">
                        Clinical Devices &amp; Gateways
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Strict 1-to-1 patient allocation
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#ECFDF5] text-[#047857] border border-[#10B981]">
                    {onlineDevicesCount} Online
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-center shadow-xs">
                    <span className="text-xs text-[#475569] font-semibold block">Total Registered</span>
                    <span className="text-2xl font-bold text-[#0F172A]">{devices.length}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#3B82F6] text-center shadow-xs">
                    <span className="text-xs text-[#1E40AF] font-semibold block">Allocated</span>
                    <span className="text-2xl font-bold text-[#1D4ED8]">
                      {devices.filter((d) => d.status === "ASSIGNED" || d.currentAssignment).length}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#10B981] text-center shadow-xs">
                    <span className="text-xs text-[#065F46] font-semibold block">Available</span>
                    <span className="text-2xl font-bold text-[#047857]">
                      {devices.filter((d) => d.status === "AVAILABLE" && !d.currentAssignment).length}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("devices")}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold text-[#475569] hover:text-[#0F172A] bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#2563EB] transition text-center shadow-xs"
                  >
                    Manage NPG Devices
                  </button>
                </div>
              </div>

            </div>

            {/* Recent Clinical Activity */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base text-[#0F172A]">
                  Recent Clinical Activity
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-bold text-[#059669] hover:underline flex items-center gap-1"
                >
                  <span>View full history</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#64748B]">
                    No clinical calls resolved yet during this shift.
                  </div>
                ) : (
                  requests
                    .filter((r) => r.status === "RESOLVED")
                    .slice(0, 5)
                    .map((req) => (
                      <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                          <div>
                            <div className="font-semibold text-[#0F172A]">
                              {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {req.patient?.displayName || "Patient"} &bull; Bed: {req.patient?.bedLabel || "Active"} &bull; Handled
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-[#64748B]">
                          {new Date(req.updatedAt || req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: LIVE CALLS - Light with Colorful Filter Badges */}
        {activeTab === "calls" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
                  Live Bedside Care Calls
                </h1>
                <p className="text-xs text-[#64748B]">
                  Real-time bedside gestures and calls requiring nurse attention
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search calls or beds..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-md bg-white border border-[#CBD5E1] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] shadow-xs"
                  />
                </div>
                {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilter(st)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition shadow-xs ${
                      filter === st
                        ? st === "NEW"
                          ? "bg-[#DC2626] text-white"
                          : st === "ACKNOWLEDGED"
                          ? "bg-[#D97706] text-white"
                          : st === "IN_PROGRESS"
                          ? "bg-[#2563EB] text-white"
                          : st === "RESOLVED"
                          ? "bg-[#059669] text-white"
                          : "bg-[#0F172A] text-white"
                        : "bg-white text-[#475569] border border-[#CBD5E1] hover:text-[#0F172A]"
                    }`}
                  >
                    {st === "NEW" ? "Awaiting" : st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtered Calls List */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
              {filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748B]">
                  No active calls matching filter.
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {filteredRequests.map((req) => (
                    <div key={req._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8FAFC] transition">
                      <div className="flex items-start gap-3">
                        <span
                          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                            req.status === "RESOLVED"
                              ? "bg-[#059669]"
                              : req.status === "IN_PROGRESS"
                              ? "bg-[#2563EB]"
                              : req.status === "ACKNOWLEDGED"
                              ? "bg-[#D97706]"
                              : "bg-[#DC2626] animate-pulse"
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#0F172A]">
                              {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                            </span>
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
                          <div className="text-xs text-[#64748B] mt-0.5">
                            Patient: <strong className="text-[#0F172A]">{req.patient?.displayName || "Patient"}</strong> &bull; Bed: <strong className="text-[#0F172A]">{req.patient?.bedLabel || "Unassigned"}</strong> &bull; Gateway: <span className="font-mono text-[#2563EB]">{req.device?.deviceId || "Gateway"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {req.status === "NEW" && (
                          <button
                            type="button"
                            onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#D97706] hover:bg-[#B45309] text-white transition shadow-xs"
                          >
                            Acknowledge
                          </button>
                        )}
                        {req.status === "ACKNOWLEDGED" && (
                          <button
                            type="button"
                            onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition shadow-xs"
                          >
                            Start Handling
                          </button>
                        )}
                        {req.status === "IN_PROGRESS" && (
                          <button
                            type="button"
                            onClick={() => promptStepConfirmation(req, "RESOLVED")}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-xs"
                          >
                            Mark Resolved
                          </button>
                        )}
                        {req.status === "RESOLVED" && (
                          <span className="text-xs font-bold text-[#059669] flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Resolved</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PATIENTS REGISTRY & BED ASSIGNMENT - Colorful Cards, No Gradients */}
        {activeTab === "patients" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
                  Patient Registry &amp; Bed Assignments
                </h1>
                <p className="text-xs text-[#64748B]">
                  Nurse-controlled bed assignment &amp; strict 1-to-1 device allocation
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Register Patient</span>
              </button>
            </div>

            {/* Patients Grid */}
            {patients.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-[#64748B]">
                No patients registered yet. Click &quot;Register Patient&quot; above to assign an available bed.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {patients.map((pt) => {
                  const assignedDevice = pt.currentAssignment?.device;
                  const hasConfirmed = Boolean(pt.bedLabel && pt.status === "ACTIVE");
                  const hasPendingBed = Boolean(pt.pendingBedLabel);

                  return (
                    <div
                      key={pt._id}
                      className="bg-white border border-[#CBD5E1] rounded-xl p-4 sm:p-5 space-y-4 flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        {/* Header: Patient Code & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E2E8F0]">
                            {pt.patientCode}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              pt.status === "ACTIVE"
                                ? "bg-[#ECFDF5] text-[#047857] border border-[#10B981]"
                                : "bg-[#FFFBEB] text-[#B45309] border border-[#F59E0B]"
                            }`}
                          >
                            {pt.status === "ACTIVE" ? "Active" : "Pending Bed Approval"}
                          </span>
                        </div>

                        {/* Patient Name */}
                        <h3 className="font-bold text-base text-[#0F172A] mt-2">
                          {pt.displayName}
                        </h3>

                        {/* Bed Assignments Breakdown */}
                        <div className="mt-3 p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs">
                          {/* Confirmed Bed */}
                          <div className="flex items-center justify-between">
                            <span className="text-[#64748B] font-medium">Confirmed Bed:</span>
                            {hasConfirmed ? (
                              <span className="font-bold text-[#047857] font-mono bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded">
                                {pt.bedLabel}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8] italic">None</span>
                            )}
                          </div>

                          {/* Pending Bed Proposal */}
                          {hasPendingBed && (
                            <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0]">
                              <span className="text-[#B45309] font-bold">Pending Proposal:</span>
                              <span className="font-bold text-[#B45309] font-mono bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded">
                                Bed {pt.pendingBedLabel}
                              </span>
                            </div>
                          )}

                          {/* Propose Bed Change Action */}
                          <div className="pt-1.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenBedChangeModal(pt)}
                              className="text-[11px] font-bold text-[#2563EB] hover:text-[#1D4ED8] transition flex items-center gap-1"
                            >
                              <Bed className="w-3 h-3" />
                              <span>{hasConfirmed ? "Propose Bed Change" : "Assign Available Bed"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Device Allocation Section */}
                        <div className="mt-3 pt-3 border-t border-[#E2E8F0] space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#64748B] font-medium">Assigned NPG Device:</span>
                            {assignedDevice ? (
                              <span className="font-mono font-bold text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5 rounded">
                                {assignedDevice.deviceId}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8] italic">No Device Allocated</span>
                            )}
                          </div>

                          {/* Device Action: Allocate or Unassign (NO silent switch) */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[#64748B] font-medium">Device Action:</span>
                            {assignedDevice ? (
                              <button
                                type="button"
                                disabled={deviceDeallocatingMap[assignedDevice.deviceId]}
                                onClick={() => handleDeallocateDevice(assignedDevice.deviceId, pt.displayName)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1 rounded-md hover:bg-[#DC2626] hover:text-white transition shadow-xs"
                                title="Explicitly unassign device to make it available"
                              >
                                <Unlink className="w-3 h-3" />
                                <span>{deviceDeallocatingMap[assignedDevice.deviceId] ? "Releasing..." : "Unassign Device"}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAllocateToPatient(pt)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#059669] hover:bg-[#047857] px-2.5 py-1 rounded-md transition shadow-xs"
                                title="Allocate available device"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>Allocate Device</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nurse Care Link Footer */}
                      <div className="pt-3 border-t border-[#E2E8F0] text-xs">
                        {pt.nurseAssignment?.status === "PENDING" ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#B45309] font-semibold">Awaiting bedside approval</span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-[#DC2626] hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : pt.nurseAssignment?.status === "APPROVED" ? (
                          <div className="flex items-center justify-between text-xs text-[#047857]">
                            <span className="flex items-center gap-1 font-bold">
                              <Check className="w-3.5 h-3.5" />
                              <span>Care linked</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-[#64748B] hover:text-[#DC2626]"
                            >
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={nurseAssignLoading[pt.patientCode]}
                            onClick={() => handleOpenCareLinkModal(pt)}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:border-[#059669] transition"
                          >
                            {nurseAssignLoading[pt.patientCode] ? "Requesting..." : "Send Care Link Request"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DEVICES - Light with Colorful Badges */}
        {activeTab === "devices" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
                  NPG Device Registry &amp; Allocation
                </h1>
                <p className="text-xs text-[#64748B]">
                  Strict one-device-to-one-patient hardware allocation
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition shadow-xs"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Commission New Device</span>
              </button>
            </div>

            {/* Devices List Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748B]">
                  No NPG devices registered yet. Commission a device to make it available.
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {devices.map((dev) => {
                    const isOnline = dev.connectivityStatus === "ONLINE";
                    const isAssigned = Boolean(dev.status === "ASSIGNED" || dev.currentAssignment);
                    const isAvailable = dev.status === "AVAILABLE" && !dev.currentAssignment;

                    return (
                      <div key={dev._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8FAFC] transition text-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#0F172A]">{dev.name || dev.deviceId}</span>
                              <span className="font-mono text-[11px] text-[#64748B]">({dev.deviceId})</span>
                              {dev.hardwareId && (
                                <span className="font-mono text-[10px] text-[#94A3B8]">HW: {dev.hardwareId}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-0.5">
                              {isAssigned && dev.currentAssignment?.patient ? (
                                <span>Allocated to: <strong className="text-[#0F172A]">{dev.currentAssignment.patient.displayName}</strong> ({dev.currentAssignment.patient.patientCode})</span>
                              ) : (
                                <span>Unallocated</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Unassign Action */}
                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          {/* Connectivity */}
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isOnline
                                ? "bg-[#ECFDF5] text-[#047857] border border-[#10B981]"
                                : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]"
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>

                          {/* Allocation Status */}
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isAvailable
                                ? "bg-[#ECFDF5] text-[#047857] border border-[#10B981]"
                                : isAssigned
                                ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
                                : "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
                            }`}
                          >
                            {dev.status}
                          </span>

                          {/* Action */}
                          {isAssigned && (
                            <button
                              type="button"
                              disabled={deviceDeallocatingMap[dev.deviceId]}
                              onClick={() => handleDeallocateDevice(dev.deviceId)}
                              className="px-2.5 py-1 rounded-md text-xs font-bold text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#DC2626] hover:text-white transition shadow-xs"
                            >
                              {deviceDeallocatingMap[dev.deviceId] ? "Releasing..." : "Unassign"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
                Clinical Shift History
              </h1>
              <p className="text-xs text-[#64748B]">
                Audit log of all handled bedside care calls
              </p>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs divide-y divide-[#E2E8F0]">
              {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748B]">
                  No resolved clinical records yet.
                </div>
              ) : (
                requests
                  .filter((r) => r.status === "RESOLVED")
                  .map((req) => (
                    <div key={req._id} className="p-4 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                        <div>
                          <div className="font-bold text-[#0F172A]">
                            {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            Patient: {req.patient?.displayName || "Patient"} &bull; Bed: {req.patient?.bedLabel || "Active"} &bull; Gateway: {req.device?.deviceId || "Gateway"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[#64748B] text-[11px]">
                        {new Date(req.updatedAt || req.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: REGISTER NEW PATIENT & SELECT AVAILABLE BED */}
      {isAddPatientModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-[#059669]" />
                <h3 className="font-bold text-base text-[#0F172A]">Register New Patient</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInitiatePatientRegistration} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0F172A] mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ronald Verma"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#059669]"
                />
              </div>

              <div>
                <label htmlFor="patient-bed-input" className="block text-xs font-bold text-[#0F172A] mb-1">
                  Enter Hospital Bed Number *
                </label>
                <input
                  id="patient-bed-input"
                  type="text"
                  required
                  list="available-beds-registration-list"
                  placeholder="e.g. ICU-01, BED-04, B-101"
                  value={newPatientBedNumber}
                  onChange={(e) => setNewPatientBedNumber(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#059669]"
                />
                <datalist id="available-beds-registration-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} {b.ward ? `(${b.ward})` : ""} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Type any bed number or pick an available bed. The bed will be assigned pending patient bedside approval.
                </p>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPatientModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPatient || !newPatientName.trim() || !newPatientBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition disabled:opacity-50 shadow-xs"
                >
                  {creatingPatient ? "Initiating..." : "Initiate Registration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PROPOSE BED CHANGE */}
      {isBedChangeModalOpen && bedChangePatient && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-[#2563EB]" />
                <h3 className="font-bold text-base text-[#0F172A]">Propose Bed Change</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBedChangeModalOpen(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmProposeBedChange} className="space-y-4">
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1">
                <div>Patient: <strong className="text-[#0F172A]">{bedChangePatient.displayName}</strong> ({bedChangePatient.patientCode})</div>
                <div>Current Bed: <strong className="text-[#047857] font-mono">{bedChangePatient.bedLabel || "None"}</strong></div>
                {bedChangePatient.pendingBedLabel && (
                  <div className="text-[#B45309] font-semibold">Already Pending Proposal: Bed {bedChangePatient.pendingBedLabel}</div>
                )}
              </div>

              <div>
                <label htmlFor="propose-bed-input" className="block text-xs font-bold text-[#0F172A] mb-1">
                  Enter New Hospital Bed Number *
                </label>
                <input
                  id="propose-bed-input"
                  type="text"
                  required
                  list="available-beds-propose-list"
                  placeholder="e.g. ICU-02, BED-10, C-202"
                  value={selectedNewBedNumber}
                  onChange={(e) => setSelectedNewBedNumber(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                />
                <datalist id="available-beds-propose-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Type any bed number or choose from available beds. Current bed remains active until patient explicitly approves.
                </p>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBedChangeModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={proposingBed || !selectedNewBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition disabled:opacity-50 shadow-xs"
                >
                  {proposingBed ? "Proposing..." : "Propose Bed Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ALLOCATE DEVICE TO PATIENT (Strict Selection from Registered Devices; Manual ID Removed) */}
      {allocateModalPatient && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#059669]" />
                <h3 className="font-bold text-base text-[#0F172A]">
                  Allocate Device to {allocateModalPatient.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-[#64748B]">
                Select an available, online NPG device from the registered hardware registry below. Devices must be online to be allocated.
              </p>

              {/* Devices Selection List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {devices.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B] text-center">
                    No devices registered. Please commission an NPG device first.
                  </div>
                ) : (
                  devices.map((d) => {
                    const isOnline = d.connectivityStatus === "ONLINE";
                    const isAlreadyAssigned = Boolean(d.status === "ASSIGNED" || d.currentAssignment);
                    const isSelectable = isOnline && !isAlreadyAssigned && d.status === "AVAILABLE";
                    const isSelected = selectedAllocateDeviceId === d.deviceId;

                    return (
                      <div
                        key={d.deviceId}
                        onClick={() => {
                          if (isSelectable) setSelectedAllocateDeviceId(d.deviceId);
                        }}
                        className={`p-3 rounded-lg border text-xs transition flex items-center justify-between gap-3 ${
                          !isSelectable
                            ? "bg-[#F8FAFC] border-[#E2E8F0] opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-[#ECFDF5] border-[#10B981] text-[#047857] ring-1 ring-[#059669] cursor-pointer"
                            : "bg-white border-[#CBD5E1] hover:border-[#059669] cursor-pointer text-[#0F172A]"
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-2">
                            <span>{d.name || d.deviceId}</span>
                            <span className="font-mono text-[11px] text-[#64748B]">({d.deviceId})</span>
                          </div>
                          <div className="text-[11px] text-[#64748B] mt-0.5">
                            Hardware ID: <span className="font-mono">{d.hardwareId || "N/A"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isOnline
                                ? "bg-[#ECFDF5] text-[#047857] border border-[#10B981]"
                                : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]"
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isAlreadyAssigned
                                ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
                                : isSelectable
                                ? "bg-[#ECFDF5] text-[#047857] border border-[#10B981]"
                                : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]"
                            }`}
                          >
                            {isAlreadyAssigned ? "ASSIGNED" : d.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allocatingDevice || !selectedAllocateDeviceId}
                onClick={handleConfirmAllocateDevice}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition disabled:opacity-50 shadow-xs"
              >
                {allocatingDevice ? "Allocating..." : "Confirm Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SEND CARE LINK REQUEST (Nurse enters bed number; Only patient can approve) */}
      {careLinkModalPatient && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#059669]" />
                <h3 className="font-bold text-base text-[#0F172A]">
                  Send Care Link Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCareLinkModalPatient(null)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSendCareLink} className="space-y-4">
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1">
                <div>Patient: <strong className="text-[#0F172A]">{careLinkModalPatient.displayName}</strong> ({careLinkModalPatient.patientCode})</div>
                <div>Current Bed: <strong className="text-[#047857] font-mono">{careLinkModalPatient.bedLabel || "None"}</strong></div>
              </div>

              <div>
                <label htmlFor="carelink-bed-number" className="block text-xs font-bold text-[#0F172A] mb-1">
                  Enter Hospital Bed Number *
                </label>
                <input
                  id="carelink-bed-number"
                  type="text"
                  required
                  list="available-beds-carelink-list"
                  placeholder="e.g. ICU-01, BED-04, B-102"
                  value={careLinkBedNumber}
                  onChange={(e) => setCareLinkBedNumber(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#059669]"
                />
                <datalist id="available-beds-carelink-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Enter the bed number to assign. Only the patient can approve this care link request at their bedside terminal.
                </p>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCareLinkModalPatient(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nurseAssignLoading[careLinkModalPatient.patientCode] || !careLinkBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition disabled:opacity-50 shadow-xs"
                >
                  {nurseAssignLoading[careLinkModalPatient.patientCode] ? "Sending..." : "Send Request to Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP CONFIRMATION MODAL */}
      {stepConfirm && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
              <h3 className="font-bold text-sm text-[#0F172A]">{stepConfirm.stepTitle}</h3>
              <button onClick={() => setStepConfirm(null)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#475569] leading-relaxed">
              {stepConfirm.stepDescription}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeStepConfirmation}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs ${stepConfirm.actionButtonColor}`}
              >
                {stepConfirm.actionButtonLabel}
              </button>
            </div>
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
