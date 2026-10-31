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
  MAX_ACTIVE_REQUESTS_PER_PATIENT,
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
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Volume2,
  VolumeX,
  LayoutDashboard,
  ArrowLeft,
  ChevronRight,
  Clock,
  Sliders,
  Lock,
  Activity,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import LoginForm from "@/components/LoginForm";
import BleCommissioningModal from "@/components/BleCommissioningModal";
import CommandRuleEditor from "@/components/commands/CommandRuleEditor";
import ChordsSignalVisualizerModal from "@/components/ChordsSignalVisualizerModal";
import { useVoiceAlerts } from "@/lib/speech";

interface StepConfirmData {
  request: CareRequestItem;
  nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "REQUEST_CONFIRMATION";
  stepTitle: string;
  stepDescription: string;
  actionButtonLabel: string;
  actionButtonColor: string;
  isResolutionStep?: boolean;
}

interface PatientCallGroup {
  key: string;
  patientId?: string;
  patientCode: string;
  displayName: string;
  bedLabel: string;
  calls: CareRequestItem[];
  activeCount: number;
  disputedCount?: number;
  awaitingCount: number;
  acknowledgedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  latestCall?: CareRequestItem;
  hasUrgent: boolean;
}

function formatCallTime(dateStr?: string) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
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
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "patients" | "devices">("overview");
  const [filter, setFilter] = useState<"ALL" | CareRequestStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCallsPatientKey, setSelectedCallsPatientKey] = useState<string | null>(null);
  const [isBleModalOpen, setIsBleModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const voice = useVoiceAlerts(requests);

  // Device Allocation state (Strict 1-to-1 without manual entry or silent switch)
  const [allocateModalPatient, setAllocateModalPatient] = useState<PatientItem | null>(null);
  const [selectedAllocateDeviceId, setSelectedAllocateDeviceId] = useState<string>("");
  const [allocatingDevice, setAllocatingDevice] = useState(false);
  const [deviceDeallocatingMap, setDeviceDeallocatingMap] = useState<Record<string, boolean>>({});
  const [editingDeviceCommands, setEditingDeviceCommands] = useState<DeviceItem | null>(null);
  const [allocatingDeviceFromList, setAllocatingDeviceFromList] = useState<DeviceItem | null>(null);
  const [selectedPatientForDevice, setSelectedPatientForDevice] = useState<string>("");
  const [allocatingPatientToDeviceLoading, setAllocatingPatientToDeviceLoading] = useState(false);

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

  // Chords Live Signal Visualizer State (Upside Down Labs integration)
  const [isChordsModalOpen, setIsChordsModalOpen] = useState(false);
  const [chordsInitialDeviceId, setChordsInitialDeviceId] = useState<string>("");
  const [chordsInitialPatientCode, setChordsInitialPatientCode] = useState<string>("");

  const handleOpenChordsVisualizer = (deviceId?: string, patientCode?: string) => {
    setChordsInitialDeviceId(deviceId || "");
    setChordsInitialPatientCode(patientCode || "");
    setIsChordsModalOpen(true);
  };

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

  // Submit device-first allocation from Devices tab
  const handleConfirmAllocatePatientToDevice = async () => {
    if (!allocatingDeviceFromList || !selectedPatientForDevice) {
      showToast("Please select a patient to allocate this device to.", true);
      return;
    }
    const targetPatient = patients.find(
      (p) => p.patientCode.toLowerCase() === selectedPatientForDevice.toLowerCase()
    );
    if (!targetPatient) {
      showToast("Selected patient not found.", true);
      return;
    }

    setAllocatingPatientToDeviceLoading(true);
    try {
      await apiClient.allocateDeviceToPatient(
        targetPatient.patientCode,
        allocatingDeviceFromList.deviceId,
        user?.name || user?.email || "Staff Nurse"
      );
      showToast(`Device ${allocatingDeviceFromList.name || allocatingDeviceFromList.deviceId} allocated to ${targetPatient.displayName} successfully!`);
      setAllocatingDeviceFromList(null);
      setSelectedPatientForDevice("");
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to assign device", true);
    } finally {
      setAllocatingPatientToDeviceLoading(false);
    }
  };

  // Deallocate device
  const handleDeallocateDevice = async (deviceId: string, patientNameOrCode?: string) => {
    setDeviceDeallocatingMap((prev) => ({ ...prev, [deviceId]: true }));
    try {
      await apiClient.unassignDevice(deviceId);
      showToast(`Device ${deviceId} unassigned from ${patientNameOrCode || "patient"} successfully.`);
      // Optimistically update patients and devices immediately
      setPatients((prev) =>
        prev.map((p) =>
          p.currentAssignment?.device?.deviceId === deviceId
            ? { ...p, currentAssignment: null }
            : p
        )
      );
      setDevices((prev) =>
        prev.map((d) =>
          d.deviceId === deviceId
            ? { ...d, status: "AVAILABLE", currentAssignment: null }
            : d
        )
      );
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
      showToast(`Patient ${patientCode} unlinked successfully.`);
      // Optimistically clear nurseAssignment immediately
      setPatients((prev) =>
        prev.map((p) =>
          p.patientCode === patientCode
            ? {
                ...p,
                nurseAssignment: {
                  status: "NONE",
                  nurseId: undefined,
                  nurseName: undefined,
                  nurseRole: undefined,
                  requestedAt: undefined,
                  approvedAt: undefined,
                  rejectedAt: undefined,
                },
              }
            : p
        )
      );
      await fetchAuxData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to unlink patient", true);
    } finally {
      setNurseAssignLoading((prev) => ({ ...prev, [patientCode]: false }));
    }
  };

  // Step advancement confirmation
  const promptStepConfirmation = (
    req: CareRequestItem,
    nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "REQUEST_CONFIRMATION"
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
        actionButtonColor: "bg-[#A86B24] hover:bg-[#8D581D]",
      });
    } else if (nextStep === "IN_PROGRESS") {
      setStepConfirm({
        request: req,
        nextStep: "IN_PROGRESS",
        stepTitle: "Start Handling Request",
        stepDescription: `Are you en route or currently assisting ${pName} on ${pBed}?`,
        actionButtonLabel: "Start Handling",
        actionButtonColor: "bg-[#376B70] hover:bg-[#2C565A]",
      });
    } else if (nextStep === "RESOLVED") {
      setStepConfirm({
        request: req,
        nextStep: "RESOLVED",
        isResolutionStep: true,
        stepTitle: "Resolve & Request Patient Confirmation",
        stepDescription: `Assistance for ${act} has been provided to ${pName} on ${pBed}. Ask patient to confirm resolution via bedside audio (Right wrist x2 for Yes, Left wrist x1 for No), or resolve immediately via nurse override.`,
        actionButtonLabel: "Ask Patient to Confirm (Bedside Audio)",
        actionButtonColor: "bg-teal-700 hover:bg-teal-800",
      });
    }
  };

  const executeStepConfirmation = async (overrideDirectResolve?: boolean) => {
    if (!stepConfirm) return;
    const { request, nextStep, isResolutionStep } = stepConfirm;
    setStepConfirm(null);
    try {
      if (isResolutionStep) {
        if (overrideDirectResolve) {
          await apiClient.resolveCareRequest(request._id, "NURSE_OVERRIDE");
          showToast("Request resolved via nurse override.");
        } else {
          await apiClient.requestPatientConfirmation(request._id);
          showToast("Patient confirmation requested on bedside speaker.");
        }
      } else if (nextStep === "ACKNOWLEDGED") {
        await apiClient.acknowledgeCareRequest(request._id);
        showToast("Request acknowledged.");
      } else if (nextStep === "IN_PROGRESS") {
        await apiClient.startHandlingCareRequest(request._id);
        showToast("Request marked In Progress.");
      } else if (nextStep === "RESOLVED") {
        await apiClient.resolveCareRequest(request._id, "NURSE_OVERRIDE");
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
        // Requirement 5: YES and NO must NEVER appear in the Live Calls Ledger
        const act = (req.action || req.ruleId || req.gestureId || "").toUpperCase();
        if (act === "YES" || act === "NO" || act === "C07" || act === "C05") return false;

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

  // Group live calls by patient for patient-centric categorization
  const patientCallGroups = useMemo<PatientCallGroup[]>(() => {
    const map = new Map<string, PatientCallGroup>();

    filteredRequests.forEach((req) => {
      const key =
        req.patient?._id ||
        req.patient?.patientCode ||
        (req.device?.deviceId ? `dev_${req.device.deviceId}` : "unassigned");

      const existing = map.get(key);
      const isUrgent = Boolean(req.alarm || req.urgent || req.status === "NEW");

      if (!existing) {
        map.set(key, {
          key,
          patientId: req.patient?._id,
          patientCode: req.patient?.patientCode || (req.patient?.displayName ? req.patient.displayName.slice(0, 4).toUpperCase() : "BEDSIDE"),
          displayName: req.patient?.displayName || "Bedside Gateway Call",
          bedLabel: req.patient?.bedLabel || "Unassigned Bed",
          calls: [req],
          activeCount: req.status !== "RESOLVED" ? 1 : 0,
          disputedCount: req.patientDisputedAt ? 1 : 0,
          awaitingCount: req.status === "NEW" ? 1 : 0,
          acknowledgedCount: req.status === "ACKNOWLEDGED" ? 1 : 0,
          inProgressCount: req.status === "IN_PROGRESS" ? 1 : 0,
          resolvedCount: req.status === "RESOLVED" ? 1 : 0,
          latestCall: req,
          hasUrgent: isUrgent,
        });
      } else {
        existing.calls.push(req);
        if (req.status !== "RESOLVED") existing.activeCount += 1;
        if (req.patientDisputedAt) existing.disputedCount = (existing.disputedCount || 0) + 1;
        if (req.status === "NEW") existing.awaitingCount += 1;
        if (req.status === "ACKNOWLEDGED") existing.acknowledgedCount += 1;
        if (req.status === "IN_PROGRESS") existing.inProgressCount += 1;
        if (req.status === "RESOLVED") existing.resolvedCount += 1;
        if (isUrgent) existing.hasUrgent = true;

        if (!existing.latestCall || new Date(req.createdAt).getTime() > new Date(existing.latestCall.createdAt).getTime()) {
          existing.latestCall = req;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if ((a.disputedCount || 0) !== (b.disputedCount || 0)) return (b.disputedCount || 0) - (a.disputedCount || 0);
      if (a.awaitingCount !== b.awaitingCount) return b.awaitingCount - a.awaitingCount;
      if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
      const timeA = a.latestCall ? new Date(a.latestCall.createdAt).getTime() : 0;
      const timeB = b.latestCall ? new Date(b.latestCall.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [filteredRequests]);

  const selectedPatientGroup = useMemo(() => {
    if (!selectedCallsPatientKey) return null;
    return patientCallGroups.find((g) => g.key === selectedCallsPatientKey) || null;
  }, [patientCallGroups, selectedCallsPatientKey]);

  // Redirect patient away from nurse station
  useEffect(() => {
    if (!authLoading && user && user.role === "patient") {
      router.push("/");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-6 text-slate-900 font-sans">
        <div className="flex items-center gap-3 bg-white border border-slate-300 shadow-xs rounded-xl px-5 py-3 shadow-xs">
          <RefreshCw className="w-4 h-4 text-teal-600 animate-spin" />
          <span className="text-sm font-medium text-slate-800">Connecting to Nurse Station...</span>
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

  const openCallsCount = requests.filter((r) => {
    const act = (r.action || r.ruleId || r.gestureId || "").toUpperCase();
    return r.status !== "RESOLVED" && act !== "YES" && act !== "NO" && act !== "C07" && act !== "C05";
  }).length;

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 font-sans antialiased flex transition-colors duration-150">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in duration-150">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-semibold shadow-dropdown ${
              toastIsError
                ? "bg-rose-50 border-rose-200  text-rose-800 "
                : "bg-emerald-50  border-emerald-200  text-emerald-800 "
            }`}
          >
            {toastIsError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* COLLAPSIBLE SIDEBAR */}
      <aside
        className={`fixed lg:sticky top-0 h-screen z-50 flex flex-col justify-between bg-white border-r border-slate-300 transition-all duration-200 ease-in-out shrink-0 select-none ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${
          isSidebarCollapsed ? "lg:w-20" : "lg:w-64"
        } w-72`}
      >
        {/* SIDEBAR HEADER / BRAND SEAL */}
        <div>
          <div className={`p-4 border-b border-slate-300 flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
            <div className="flex items-center gap-3">
              {/* Brand Icon Mark */}
              <div
                className="w-9 h-9 rounded-lg bg-teal-700  text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs shrink-0"
                title="NetraVaani Clinical Ledger"
              >
                NV
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="font-bold text-sm text-slate-900 tracking-tight leading-none">
                    Netra<span className="text-teal-800">Vaani</span>
                  </div>
                  <div className="text-[10px] tracking-wider uppercase font-semibold text-slate-600 mt-1 font-mono">
                    Nurse Station
                  </div>
                </div>
              )}
            </div>

            {/* Collapse toggle (Desktop) and Close button (Mobile) */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex p-1.5 rounded-md text-slate-600 hover:text-slate-900 :text-slate-100 hover:bg-slate-100 transition"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-1.5 rounded-md text-slate-600 hover:text-slate-900 :text-slate-100 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* QUICK ACTION SHORTCUTS */}
          <div className="p-3 border-b border-slate-300 space-y-2">
            {!isSidebarCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsBleModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 :bg-teal-900/40 border border-teal-200  transition shadow-xs"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>Commission BLE</span>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddPatientModalOpen(true)}
                  title="Register Patient"
                  className="w-9 h-9 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsBleModalOpen(true)}
                  title="Commission BLE Device"
                  className="w-9 h-9 rounded-lg bg-slate-100 text-teal-800 border border-slate-300 hover:bg-slate-200 :bg-slate-700 flex items-center justify-center transition shadow-xs"
                >
                  <Bluetooth className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* NAVIGATION LINKS */}
          <nav className="p-3 space-y-1">
            {[
              { id: "overview", label: "Ward Overview", icon: LayoutDashboard },
              { id: "calls", label: "Live Calls", icon: Bell, count: openCallsCount, isUrgent: openCallsCount > 0 },
              { id: "patients", label: "Patient Registry", icon: User, count: patients.length },
              { id: "devices", label: "Hardware Gateways", icon: Radio, count: devices.length },
            ].map((item) => {
              const isActive = activeTab === item.id;
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id as typeof activeTab);
                    setIsMobileMenuOpen(false);
                  }}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition group relative ${
                    isActive
                      ? "bg-teal-700 text-white shadow-xs font-semibold"
                      : "text-slate-700 hover:text-slate-900 :text-slate-100 hover:bg-slate-100/60"
                  } ${isSidebarCollapsed ? "justify-center px-2" : ""}`}
                >
                  <IconComponent
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? "text-white"
                        : "text-slate-400  group-hover:text-slate-900 :text-slate-100"
                    }`}
                  />
                  {!isSidebarCollapsed && (
                    <div className="flex-1 flex items-center justify-between text-left">
                      <span>{item.label}</span>
                      {item.count !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                            item.isUrgent
                              ? "bg-rose-100  text-rose-800  border border-rose-200 "
                              : isActive
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </div>
                  )}
                  {isSidebarCollapsed && item.count !== undefined && item.count > 0 && (
                    <span
                      className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                        item.isUrgent ? "bg-rose-500" : "bg-teal-600"
                      }`}
                    />
                  )}
                </button>
              );
            })}

            {/* Bedside Phone Speaker shortcut */}
            <a
              href="/bedside-audio"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Bedside Phone Speaker Node"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition ${
                isSidebarCollapsed ? "justify-center px-2" : ""
              }`}
            >
              <Volume2 className="w-4 h-4 shrink-0 text-teal-800" />
              {!isSidebarCollapsed && (
                <div className="flex-1 flex items-center justify-between text-left">
                  <span>Bedside Speaker</span>
                  <span className="text-[10px] font-mono uppercase bg-teal-700 text-white px-1.5 py-0.5 rounded">
                    Open
                  </span>
                </div>
              )}
            </a>

            {/* Chords Live Bio-Potential Signals shortcut */}
            <button
              type="button"
              onClick={() => handleOpenChordsVisualizer()}
              title="Open Chords Bio-Potential Live Signals Studio (Upside Down Labs)"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition ${
                isSidebarCollapsed ? "justify-center px-2" : ""
              }`}
            >
              <Activity className="w-4 h-4 shrink-0 text-emerald-700" />
              {!isSidebarCollapsed && (
                <div className="flex-1 flex items-center justify-between text-left">
                  <span>Chords Signals</span>
                  <span className="text-[10px] font-mono uppercase bg-emerald-700 text-white px-1.5 py-0.5 rounded">
                    Live
                  </span>
                </div>
              )}
            </button>
          </nav>
        </div>

        {/* SIDEBAR FOOTER / PROFILE & UTILITIES */}
        <div className="p-3 border-t border-slate-300 space-y-2.5 bg-slate-50/50 ">
          {/* Controls: Voice alerts, Refresh sync, Theme */}
          <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? "flex-col" : "justify-between"}`}>
            {/* Voice toggle & test */}
            {voice.supported && (
              <div className={`flex items-center gap-1 ${!isSidebarCollapsed ? "flex-1" : ""}`}>
                <button
                  type="button"
                  onClick={() => voice.setEnabled(!voice.enabled)}
                  title={voice.enabled ? "Voice Alerts: Active (Click to mute)" : "Voice Alerts: Muted (Click to turn on)"}
                  className={`p-1.5 rounded-lg border text-xs font-medium transition ${
                    voice.enabled
                      ? "bg-emerald-50 text-emerald-800  border-emerald-200 "
                      : "bg-white  text-slate-600 border-slate-300 hover:text-slate-900 :text-slate-100"
                  } flex-1 flex items-center justify-center gap-1.5`}
                >
                  {voice.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  {!isSidebarCollapsed && (
                    <span className="text-[11px]">{voice.enabled ? "Voice: On" : "Voice: Off"}</span>
                  )}
                </button>
                {!isSidebarCollapsed && voice.enabled && (
                  <button
                    type="button"
                    onClick={() => voice.testVoice()}
                    title="Test Voice Announcement"
                    className="p-1.5 rounded-lg border text-[11px] font-medium border-emerald-200  bg-white  text-emerald-800  hover:bg-emerald-50 :bg-emerald-950/40 transition"
                  >
                    Test
                  </button>
                )}
              </div>
            )}

            {/* Sync Refresh button */}
            <button
              type="button"
              onClick={() => {
                fetchRequests(true);
                fetchAuxData();
              }}
              title="Sync clinical ledger"
              className={`p-1.5 rounded-lg border border-slate-300 bg-white  text-slate-600  hover:text-teal-700 :text-teal-400 transition ${
                !isSidebarCollapsed ? "px-2.5 flex items-center gap-1" : ""
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-teal-600" : ""}`} />
              {!isSidebarCollapsed && <span className="text-[11px] font-medium">Sync</span>}
            </button>

            {/* Dark/Light mode toggle */}
            <ThemeToggle />
          </div>

          {/* User Profile info */}
          <div className="pt-2 border-t border-slate-300">
            {!isSidebarCollapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded-full bg-slate-100 text-teal-800 border border-slate-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono truncate">
                      {user.username ? `@${user.username}` : "Staff Nurse"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    if (typeof window !== "undefined") {
                      window.location.href = "/";
                    }
                  }}
                  title="Sign out"
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 :bg-rose-950/40 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full bg-slate-100 text-teal-800 border border-slate-300 flex items-center justify-center text-xs font-bold"
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    if (typeof window !== "undefined") {
                      window.location.href = "/";
                    }
                  }}
                  title="Sign out"
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 :bg-rose-950/40 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE CONTENT */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* TOP STATUS BAR */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-300 px-4 sm:px-6 lg:px-8 py-3.5 transition-colors">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Mobile hamburger & Section Title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 :text-slate-100 hover:bg-slate-100 transition border border-slate-300"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div>
                <h1 className="font-bold text-lg sm:text-xl text-slate-900 tracking-tight">
                  {activeTab === "overview" && "Ward Occupancy & Overview"}
                  {activeTab === "calls" && "Live Clinical Calls & Alarms"}
                  {activeTab === "patients" && "Patient Bedside Registry"}
                  {activeTab === "devices" && "Hardware Gateways & Allocation"}
                </h1>
                <p className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  <span>Clinical Station Desk &bull; Telemetry Connected</span>
                </p>
              </div>
            </div>

            {/* Right: Quick Action Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenChordsVisualizer()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 transition shadow-xs"
                title="Launch Chords Bio-Potential Visualizer (Upside Down Labs)"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-700" />
                <span className="hidden sm:inline">Live Signals (Chords)</span>
                <span className="sm:hidden">Signals</span>
                {onlineDevicesCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                )}
              </button>

              <a
                href="/bedside-audio"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition shadow-xs"
                title="Open Bedside Audio Node in new tab"
              >
                <Volume2 className="w-3.5 h-3.5 text-teal-800" />
                <span>Bedside Speaker</span>
              </a>
            </div>
          </div>
        </header>

        {/* MAIN BODY CONTAINER */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            
            {/* Hospital Beds Overview & Device Gateways Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
              
              {/* Card 1: Hospital Beds Ward Status */}
              <div className="lg:col-span-6 bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 ">
                      <Bed className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-slate-900">
                        Hospital Beds Occupancy
                      </h2>
                      <p className="text-xs text-slate-600">
                        Nurse-controlled bed allocation ledger
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200  text-center shadow-xs">
                    <span className="text-xs text-emerald-800  font-medium block">Available</span>
                    <span className="text-2xl font-bold text-emerald-800 ">{availableBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200  text-center shadow-xs">
                    <span className="text-xs text-amber-800  font-medium block">Pending Approval</span>
                    <span className="text-2xl font-bold text-amber-800 ">{pendingBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 text-center shadow-xs">
                    <span className="text-xs text-slate-700 font-medium block">Occupied</span>
                    <span className="text-2xl font-bold text-slate-900">{occupiedBedsCount}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("patients")}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 hover:border-teal-600 :border-teal-500 transition text-center shadow-xs"
                  >
                    Manage Patients &amp; Bed Assignments
                  </button>
                </div>
              </div>

              {/* Card 2: NPG Device Gateways Registry */}
              <div className="lg:col-span-6 bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 ">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-slate-900">
                        Clinical Devices &amp; Gateways
                      </h2>
                      <p className="text-xs text-slate-600">
                        Strict 1-to-1 patient allocation
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800  border border-emerald-200 ">
                    {onlineDevicesCount} Online
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50  border border-slate-300 text-center shadow-xs">
                    <span className="text-xs text-slate-600 font-medium block">Total Registered</span>
                    <span className="text-2xl font-bold text-slate-900">{devices.length}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-teal-50 border border-teal-200  text-center shadow-xs">
                    <span className="text-xs text-teal-800 font-medium block">Allocated</span>
                    <span className="text-2xl font-bold text-teal-900 ">
                      {devices.filter((d) => d.status === "ASSIGNED" || d.currentAssignment).length}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200  text-center shadow-xs">
                    <span className="text-xs text-emerald-800  font-medium block">Available</span>
                    <span className="text-2xl font-bold text-emerald-800 ">
                      {devices.filter((d) => d.status === "AVAILABLE" && !d.currentAssignment).length}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("devices")}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 hover:border-teal-600 transition text-center shadow-xs"
                  >
                    Manage NPG Devices
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenChordsVisualizer()}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition text-center shadow-xs flex items-center justify-center gap-1.5"
                    title="Open live bio-potential waveforms in Chords Studio"
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Live Signals (Chords)</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Recent Clinical Activity */}
            <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base text-slate-900">
                  Recent Clinical Activity
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("calls")}
                  className="text-xs font-semibold text-teal-800 hover:underline flex items-center gap-1"
                >
                  <span>View all calls</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-slate-100 ">
                {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-600">
                    No clinical calls resolved yet during this shift.
                  </div>
                ) : (
                  requests
                    .filter((r) => r.status === "RESOLVED")
                    .slice(0, 5)
                    .map((req) => (
                      <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <div>
                            <div className="font-semibold text-slate-900">
                              {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {req.patient?.displayName || "Patient"} &bull; Bed: {req.patient?.bedLabel || "Active"} &bull; Handled
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-600">
                          {new Date(req.updatedAt || req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: LIVE CALLS (PATIENT-CATEGORIZED CARDS & DRILL-DOWN LEDGER) */}
        {activeTab === "calls" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {selectedPatientGroup && (
                    <button
                      type="button"
                      onClick={() => setSelectedCallsPatientKey(null)}
                      className="p-1.5 rounded-lg border border-slate-300 bg-white  text-slate-600  hover:text-teal-700 :text-teal-400 transition shadow-xs"
                      title="Back to All Patient Cards"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {selectedPatientGroup ? `${selectedPatientGroup.displayName} — Live Calls Ledger` : "Live Bedside Care Calls"}
                  </h2>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {selectedPatientGroup
                    ? `Bed ${selectedPatientGroup.bedLabel} • Ledger #${selectedPatientGroup.patientCode} • ${selectedPatientGroup.calls.length} calls recorded`
                    : "Patient-categorized bedside gestures and active clinical calls"}
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search calls or beds..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white  border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700 shadow-xs"
                  />
                </div>
                {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-xs ${
                      filter === st
                        ? "bg-teal-700 text-white"
                        : "bg-white  text-slate-700 border border-slate-300 hover:text-slate-900 :text-slate-100"
                    }`}
                  >
                    {st === "NEW" ? "Awaiting" : st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {selectedPatientGroup ? (
              /* VIEW B: DETAILED CALLS LEDGER FOR SELECTED PATIENT */
              <div className="space-y-4">
                {/* Patient Navigation & Ledger Meta Banner */}
                <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCallsPatientKey(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-800 hover:border-teal-600 transition shadow-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>All Patients</span>
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">
                          {selectedPatientGroup.displayName}
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                          {selectedPatientGroup.patientCode}
                        </span>
                        <span className="text-xs font-mono font-bold text-teal-800">
                          Bed {selectedPatientGroup.bedLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenChordsVisualizer(undefined, selectedPatientGroup.patientCode)}
                      className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold flex items-center gap-1.5 transition shadow-xs"
                      title="Inspect live bio-potential waveforms in Chords for this patient"
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Live Signals (Chords)</span>
                    </button>
                    <a
                      href={`/bedside-audio?patientCode=${encodeURIComponent(selectedPatientGroup.patientCode)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-medium flex items-center gap-1.5 transition"
                      title="Open Bedside Audio Speaker page for this bed"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Bedside Speaker</span>
                    </a>
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-300 font-mono font-semibold">
                      {selectedPatientGroup.calls.length} Total Calls
                    </span>
                    {(selectedPatientGroup.disputedCount || 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800  border border-rose-200  font-mono font-bold flex items-center gap-1.5 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {selectedPatientGroup.disputedCount} Care Disputed by Patient
                      </span>
                    )}
                    {selectedPatientGroup.activeCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT && (
                      <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800  border border-rose-200  font-mono font-bold flex items-center gap-1.5">
                        Max Limit ({MAX_ACTIVE_REQUESTS_PER_PATIENT}/{MAX_ACTIVE_REQUESTS_PER_PATIENT} Pending)
                      </span>
                    )}
                    {selectedPatientGroup.awaitingCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800  border border-rose-200  font-mono font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                        {selectedPatientGroup.awaitingCount} Awaiting Attention
                      </span>
                    ) : selectedPatientGroup.activeCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800  border border-amber-200  font-mono font-semibold">
                        {selectedPatientGroup.activeCount} In Progress
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800  border border-emerald-200  font-medium">
                        All Calls Resolved ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient's Granular Calls Ledger */}
                <div className="bg-white border border-slate-300 shadow-xs rounded-xl overflow-hidden shadow-xs">
                  {selectedPatientGroup.calls.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-600 space-y-2">
                      <p>No calls matching &ldquo;{filter}&rdquo; for this patient.</p>
                      {filter !== "ALL" && (
                        <button
                          type="button"
                          onClick={() => setFilter("ALL")}
                          className="font-semibold text-xs text-teal-800 hover:underline"
                        >
                          View all calls for {selectedPatientGroup.displayName}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 ">
                      {selectedPatientGroup.calls.map((req) => (
                        <div
                          key={req._id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 :bg-slate-800/40 transition"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                                req.status === "RESOLVED"
                                  ? "bg-emerald-600"
                                  : req.status === "PENDING_PATIENT_CONFIRMATION"
                                  ? "bg-teal-600 animate-ping"
                                  : req.status === "PENDING_DISPATCH_CONFIRMATION"
                                  ? "bg-amber-500 animate-pulse"
                                  : req.status === "IN_PROGRESS"
                                  ? "bg-teal-600"
                                  : req.status === "ACKNOWLEDGED"
                                  ? "bg-amber-600"
                                  : "bg-rose-600 animate-pulse"
                              }`}
                            />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900">
                                  {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                    req.status === "RESOLVED"
                                      ? "bg-emerald-50 text-emerald-800  border border-emerald-200 "
                                      : req.status === "PENDING_PATIENT_CONFIRMATION"
                                      ? "bg-teal-50 text-teal-800 border border-teal-200  animate-pulse"
                                      : req.status === "PENDING_DISPATCH_CONFIRMATION"
                                      ? "bg-amber-50 text-amber-800  border border-amber-200  animate-pulse"
                                      : req.status === "IN_PROGRESS"
                                      ? req.patientDisputedAt
                                        ? "bg-rose-50 text-rose-800  border border-rose-200  animate-pulse"
                                        : "bg-slate-100 text-slate-800 border border-slate-300"
                                      : req.status === "ACKNOWLEDGED"
                                      ? "bg-amber-50 text-amber-800  border border-amber-200 "
                                      : "bg-rose-50 text-rose-800  border border-rose-200 "
                                  }`}
                                >
                                  {req.status === "PENDING_DISPATCH_CONFIRMATION"
                                    ? "VERIFYING AT BEDSIDE"
                                    : req.status === "PENDING_PATIENT_CONFIRMATION"
                                    ? "AWAITING CONFIRMATION"
                                    : req.status === "IN_PROGRESS" && req.patientDisputedAt
                                    ? "CARE DISPUTED / REJECTED"
                                    : req.status}
                                </span>
                                <span className="text-[11px] text-slate-600 flex items-center gap-1 font-mono">
                                  <Clock className="w-3 h-3" />
                                  {formatCallTime(req.createdAt)}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>Recorded: <strong className="font-mono text-slate-800">{new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></span>
                                <span>&bull;</span>
                                <span>Gateway: <span className="font-mono text-teal-800">{req.device?.deviceId || "Gateway"}</span></span>
                              </div>
                              {req.patientDisputedAt && (
                                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200  text-rose-800  text-xs font-semibold">
                                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 " />
                                  <span>Patient Reported Care NOT Received (Left Wrist Squeeze) — Urgent follow-up needed</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {req.status === "PENDING_DISPATCH_CONFIRMATION" && (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-teal-800 flex items-center gap-1">
                                  <Clock className="w-3 h-3 animate-spin" />
                                  <span>Patient verifying (15s)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiClient.confirmDispatch(req._id);
                                    showToast("Request confirmed and dispatched.");
                                    await fetchRequests(false);
                                  }}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                                >
                                  Dispatch Now
                                </button>
                              </div>
                            )}
                            {req.status === "NEW" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs"
                              >
                                Acknowledge
                              </button>
                            )}
                            {req.status === "ACKNOWLEDGED" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition shadow-xs"
                              >
                                Start Handling
                              </button>
                            )}
                            {req.status === "IN_PROGRESS" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "RESOLVED")}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition shadow-xs flex items-center gap-1.5 ${
                                  req.patientDisputedAt
                                    ? "bg-rose-600 hover:bg-rose-700 animate-pulse"
                                    : "bg-teal-700 hover:bg-teal-800"
                                }`}
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>{req.patientDisputedAt ? "Re-verify / Resolve" : "Resolve / Verify"}</span>
                              </button>
                            )}
                            {req.status === "PENDING_PATIENT_CONFIRMATION" && (
                              <div className="flex items-center gap-2">
                                <div className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-teal-50 text-teal-800   flex items-center gap-1.5 border border-teal-200 ">
                                  <Clock className="w-3.5 h-3.5 animate-spin text-teal-600" />
                                  <span>Right Wrist ×2 to Confirm</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiClient.resolveCareRequest(req._id, "NURSE_OVERRIDE");
                                    showToast("Resolved via nurse override.");
                                    await fetchRequests(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-teal-300  text-teal-700  hover:bg-teal-50 :bg-teal-950/40 transition"
                                  title="Force close without waiting for patient signal"
                                >
                                  Override
                                </button>
                              </div>
                            )}
                            {req.status === "RESOLVED" && (
                              <span className="text-xs font-semibold text-emerald-700  flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>
                                  {req.resolvedBy === "PATIENT_CONFIRMED"
                                    ? "Confirmed by Patient (Right Wrist ×2)"
                                    : req.resolvedBy === "NURSE_OVERRIDE"
                                    ? "Nurse Override"
                                    : "Resolved"}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* VIEW A: PATIENT CALL CARDS (CATEGORIZED ACCORDING TO PATIENT) */
              patientCallGroups.length === 0 ? (
                <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-8 text-center text-xs text-slate-600 shadow-xs">
                  No active bedside calls matching current filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {patientCallGroups.map((group) => {
                    return (
                      <div
                        key={group.key}
                        onClick={() => setSelectedCallsPatientKey(group.key)}
                        className="bg-white border border-slate-300 shadow-xs rounded-xl p-4 sm:p-5 hover:border-teal-600 :border-teal-500 transition-all duration-150 shadow-xs cursor-pointer group flex flex-col justify-between space-y-4"
                      >
                        {/* Card Top: Patient Identity & Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-9 h-9 rounded-lg bg-teal-50  text-teal-700  border border-teal-200  flex items-center justify-center font-bold text-xs shrink-0">
                              {group.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                              <h3 className="font-semibold text-sm text-slate-900 group-hover:text-teal-700 :text-teal-400 transition-colors truncate">
                                {group.displayName}
                              </h3>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-mono mt-0.5">
                                <span>{group.patientCode}</span>
                                <span>&bull;</span>
                                <span className="font-bold text-slate-800">Bed {group.bedLabel}</span>
                              </div>
                            </div>
                          </div>

                          {/* Status Pill */}
                          {(group.disputedCount || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-800  border border-rose-200  shrink-0 animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              {group.disputedCount} Disputed
                            </span>
                          ) : group.awaitingCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-800  border border-rose-200  shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                              {group.awaitingCount} Awaiting
                            </span>
                          ) : group.inProgressCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800  border border-amber-200  shrink-0">
                              {group.inProgressCount} Handling
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800  border border-emerald-200  shrink-0">
                              Resolved ✓
                            </span>
                          )}
                        </div>

                        {/* Card Body: Summary of Live Calls */}
                        <div className="bg-slate-50  rounded-lg p-3 border border-slate-300/60 space-y-2">
                          {/* Latest Request preview */}
                          {group.latestCall && (
                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <Bell className="w-3.5 h-3.5 text-teal-800 shrink-0" />
                                <span className="font-medium text-slate-800 truncate">
                                  {group.latestCall.displayLabel || group.latestCall.label || group.latestCall.action.replace(/_/g, " ")}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-600 shrink-0">
                                {formatCallTime(group.latestCall.createdAt)}
                              </span>
                            </div>
                          )}

                          {/* High-level status counters summary */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-800">
                              {group.calls.length} Total Calls
                            </span>
                            {group.activeCount >= MAX_ACTIVE_REQUESTS_PER_PATIENT && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-50 border border-rose-200  text-rose-800 ">
                                {MAX_ACTIVE_REQUESTS_PER_PATIENT}/{MAX_ACTIVE_REQUESTS_PER_PATIENT} Pending (Limit)
                              </span>
                            )}
                            {group.activeCount > 0 ? (
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-200  text-amber-800 ">
                                {group.activeCount} Active
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200  text-emerald-800 ">
                                All Clean
                              </span>
                            )}
                          </div>

                          {/* Handshake Status Alert in Live Calls card */}
                          {(() => {
                            const ptDoc = patients.find((p) => p.patientCode === group.patientCode || p._id === group.patientId);
                            const commState = ptDoc?.communicationState;
                            if (commState && commState.handshakeStatus !== "COMPLETED") {
                              return (
                                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                    <span>Handshake {commState.handshakeStatus.replace(/_/g, " ")}</span>
                                  </span>
                                  <span className="font-mono text-[10px] text-amber-800">
                                    YES: {commState.yesSentAt ? "✓" : "Waiting"} &bull; NO: {commState.noSentAt ? "✓" : "Waiting"}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        {/* Card Footer: Clear Affordance to View Ledger */}
                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-teal-800">
                          <span className="text-[11px] text-slate-600 font-normal">
                            Click to inspect calls
                          </span>
                          <span className="inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            <span>View Calls Ledger</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* TAB 3: PATIENTS REGISTRY & BED ASSIGNMENT */}
        {activeTab === "patients" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Patient Registry &amp; Bed Assignments
                </h2>
                <p className="text-xs text-slate-600">
                  Nurse-controlled bed assignment &amp; strict 1-to-1 device allocation
                </p>
              </div>
            </div>

            {/* Patients Grid */}
            {patients.length === 0 ? (
              <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-8 text-center text-xs text-slate-600">
                No patients registered yet in the clinical ledger.
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
                      className="bg-white border border-slate-300 shadow-xs rounded-xl p-4 sm:p-5 space-y-4 flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        {/* Header: Patient Code & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                            {pt.patientCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                              pt.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-800  border border-emerald-200 "
                                : "bg-amber-50 text-amber-800  border border-amber-200 "
                            }`}
                          >
                            {pt.status === "ACTIVE" ? "Active" : "Pending Bed Approval"}
                          </span>
                        </div>

                        {/* Patient Name */}
                        <h3 className="font-semibold text-base text-slate-900 mt-2">
                          {pt.displayName}
                        </h3>

                        {/* Bed Assignments Breakdown */}
                        <div className="mt-3 p-3 rounded-lg bg-slate-50  border border-slate-300 space-y-2 text-xs">
                          {/* Confirmed Bed */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-700 font-medium">Confirmed Bed:</span>
                            {hasConfirmed ? (
                              <span className="font-bold text-emerald-700  font-mono bg-emerald-50 border border-emerald-200  px-2 py-0.5 rounded">
                                {pt.bedLabel}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </div>

                          {/* Mandatory Communication Handshake Status */}
                          {assignedDevice && (() => {
                            const liveDev = devices.find((d) => d.deviceId === assignedDevice.deviceId);
                            const commState = pt.communicationState || liveDev?.communicationState;
                            const status = commState?.handshakeStatus || "PENDING";
                            const mode = commState?.communicationMode || "MANDATORY_HANDSHAKE";

                            return (
                              <div className="p-2 rounded-lg border text-xs bg-white border-slate-200 space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                                    <Shield className="w-3.5 h-3.5 text-teal-700" />
                                    <span>Handshake:</span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight inline-flex items-center gap-1 ${
                                      status === "COMPLETED"
                                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                        : status === "WAITING_FOR_NO" || status === "WAITING_FOR_YES"
                                        ? "bg-teal-100 text-teal-900 border border-teal-300"
                                        : "bg-amber-100 text-amber-900 border border-amber-300"
                                    }`}
                                  >
                                    {status === "COMPLETED" && <Check className="w-3 h-3 text-emerald-700" />}
                                    {(status === "WAITING_FOR_NO" || status === "WAITING_FOR_YES") && <Clock className="w-3 h-3 text-teal-700" />}
                                    {status === "PENDING" && <AlertTriangle className="w-3 h-3 text-amber-700" />}
                                    <span>
                                      {status === "COMPLETED"
                                        ? "COMPLETED"
                                        : status === "WAITING_FOR_NO"
                                        ? "WAITING FOR NO (YES ✓)"
                                        : status === "WAITING_FOR_YES"
                                        ? "WAITING FOR YES (NO ✓)"
                                        : "PENDING"}
                                    </span>
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                                  <span>{mode === "NORMAL_COMMUNICATION" ? "Normal Assistance Active" : "Mandatory Communication Mode"}</span>
                                  <span className="font-mono">
                                    YES: {commState?.yesSentAt ? "✓" : "—"} &bull; NO: {commState?.noSentAt ? "✓" : "—"}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Pending Bed Proposal */}
                          {hasPendingBed && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-300">
                              <span className="text-amber-800  font-medium">Pending Proposal:</span>
                              <span className="font-bold text-amber-800  font-mono bg-amber-50 border border-amber-200  px-2 py-0.5 rounded">
                                Bed {pt.pendingBedLabel}
                              </span>
                            </div>
                          )}

                          {/* Propose Bed Change Action */}
                          <div className="pt-1.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenBedChangeModal(pt)}
                              className="text-[11px] font-semibold text-teal-800 hover:underline transition flex items-center gap-1"
                            >
                              <Bed className="w-3 h-3" />
                              <span>{hasConfirmed ? "Propose Bed Change" : "Assign Available Bed"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Device Allocation Section */}
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-700 font-medium">Assigned NPG Device:</span>
                            {assignedDevice ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                                  {assignedDevice.deviceId}
                                </span>
                                {(() => {
                                  const liveDev = devices.find((d) => d.deviceId === assignedDevice.deviceId);
                                  const isDevActive = (liveDev?.connectivityStatus === "ONLINE") || (assignedDevice.connectivityStatus === "ONLINE");
                                  if (!isDevActive) return null;
                                  const batt = liveDev?.batteryLevel ?? assignedDevice.batteryLevel;
                                  if (batt === undefined || batt === null) return null;
                                  return (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight inline-flex items-center gap-1 ${
                                        batt > 50
                                          ? "bg-emerald-50 text-emerald-800  border border-emerald-200 "
                                          : batt > 20
                                          ? "bg-amber-50 text-amber-800  border border-amber-200 "
                                          : "bg-rose-50 text-rose-800  border border-rose-200 "
                                      }`}
                                      title={`Battery: ${batt}%`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                      <span>{batt}%</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No Device Allocated</span>
                            )}
                          </div>

                          {/* Device Action: Allocate or Unassign */}
                          <div className="flex items-center justify-between pt-1 gap-2">
                            <span className="text-slate-700 font-medium">Device Action:</span>
                            {assignedDevice ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenChordsVisualizer(assignedDevice.deviceId, pt.patientCode)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded-md transition shadow-xs"
                                  title="View live EMG/EOG signals in Chords"
                                >
                                  <Activity className="w-3 h-3 text-emerald-700" />
                                  <span>Signals</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={deviceDeallocatingMap[assignedDevice.deviceId]}
                                  onClick={() => handleDeallocateDevice(assignedDevice.deviceId, pt.displayName)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md hover:bg-rose-600 hover:text-white transition shadow-xs"
                                  title="Explicitly unassign device to make it available"
                                >
                                  <Unlink className="w-3 h-3" />
                                  <span>{deviceDeallocatingMap[assignedDevice.deviceId] ? "Releasing..." : "Unassign Device"}</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAllocateToPatient(pt)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 px-2.5 py-1 rounded-md transition shadow-xs"
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
                      <div className="pt-3 border-t border-slate-200 text-xs">
                        {pt.nurseAssignment?.status === "PENDING" ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-amber-800  font-semibold">Awaiting bedside approval</span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-rose-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : pt.nurseAssignment?.status === "APPROVED" ? (
                          <div className="flex items-center justify-between text-xs text-emerald-800 ">
                            <span className="flex items-center gap-1 font-semibold">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Care linked</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-slate-500 hover:text-rose-600 transition"
                            >
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={nurseAssignLoading[pt.patientCode]}
                            onClick={() => handleOpenCareLinkModal(pt)}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-800 hover:border-teal-600 transition"
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

        {/* TAB 4: DEVICES */}
        {activeTab === "devices" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  NPG Device Registry &amp; Allocation
                </h2>
                <p className="text-xs text-slate-600">
                  Strict one-device-to-one-patient hardware allocation
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenChordsVisualizer()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 transition shadow-xs"
                  title="Open Chords Bio-Potential Live Signals Studio"
                >
                  <Activity className="w-4 h-4 text-emerald-700" />
                  <span>Chords Signal Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBleModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition shadow-xs"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Commission New Device</span>
                </button>
              </div>
            </div>

            {/* Devices List Table */}
            <div className="bg-white border border-slate-300 shadow-xs rounded-xl overflow-hidden shadow-xs">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-600">
                  No NPG devices registered yet. Commission a device to make it available.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 ">
                  {devices.map((dev) => {
                    const isOnline = dev.connectivityStatus === "ONLINE";
                    const isAssigned = Boolean(dev.status === "ASSIGNED" || dev.currentAssignment);
                    const isAvailable = dev.status === "AVAILABLE" && !dev.currentAssignment;

                    return (
                      <div key={dev._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 :bg-slate-800/40 transition text-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 ">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-900">{dev.name || dev.deviceId}</span>
                              <span className="font-mono text-[11px] text-slate-600">({dev.deviceId})</span>
                              {dev.hardwareId && (
                                <span className="font-mono text-[10px] text-slate-400">HW: {dev.hardwareId}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {isAssigned && dev.currentAssignment?.patient ? (
                                <span>Allocated to: <strong className="text-slate-900">{dev.currentAssignment.patient.displayName}</strong> ({dev.currentAssignment.patient.patientCode})</span>
                              ) : (
                                <span>Unallocated</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Actions */}
                        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap self-end sm:self-auto">
                          {/* Connectivity */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                              isOnline
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                : "bg-slate-100 text-slate-600 border border-slate-200  border-slate-300 "
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>

                          {/* Battery Level (shown only when device is active and battery is reported) */}
                          {isOnline && dev.batteryLevel !== undefined && dev.batteryLevel !== null && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider inline-flex items-center gap-1 ${
                                dev.batteryLevel > 50
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                  : dev.batteryLevel > 20
                                  ? "bg-amber-50 text-amber-800 border border-amber-200   "
                                  : "bg-rose-50 text-rose-800 border border-rose-200   "
                              }`}
                              title={`Device Battery: ${dev.batteryLevel}%`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              <span>{dev.batteryLevel}%</span>
                            </span>
                          )}

                          {/* Allocation Status */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                              isAvailable
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                : isAssigned
                                ? "bg-slate-100 text-slate-700 border border-slate-200   border-slate-300"
                                : "bg-rose-50 text-rose-800 border border-rose-200   "
                            }`}
                          >
                            {dev.status}
                          </span>

                          {/* Chords Live Bio-Potential Signals */}
                          <button
                            type="button"
                            onClick={() => handleOpenChordsVisualizer(dev.deviceId)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition shadow-xs"
                            title="Inspect live bio-potentials in Chords (Upside Down Labs)"
                          >
                            <Activity className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Signals (Chords)</span>
                          </button>

                          {/* Edit Commands Action - only accessible when device is online */}
                          {isOnline ? (
                            <button
                              type="button"
                              onClick={() => setEditingDeviceCommands(dev)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200  hover:bg-teal-100 :bg-teal-900/40 transition shadow-xs"
                              title="Edit gestures & command rules for this online device"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Edit Commands</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium text-slate-400  bg-slate-100/50  border border-slate-200/50 border-slate-300/50 cursor-not-allowed select-none"
                              title="Device is offline — Commands locked until device connects"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Commands Locked</span>
                            </span>
                          )}

                          {/* Allocation / Unassign Actions */}
                          {isAssigned ? (
                            <button
                              type="button"
                              disabled={deviceDeallocatingMap[dev.deviceId]}
                              onClick={() => handleDeallocateDevice(dev.deviceId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold text-rose-700  bg-rose-50 border border-rose-200  hover:bg-rose-600 hover:text-white transition shadow-xs"
                            >
                              {deviceDeallocatingMap[dev.deviceId] ? "Releasing..." : "Unassign"}
                            </button>
                          ) : isOnline ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAllocatingDeviceFromList(dev);
                                setSelectedPatientForDevice("");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-800  bg-emerald-50 border border-emerald-200  hover:bg-emerald-600 hover:text-white transition shadow-xs"
                              title="Allocate this gateway to a patient"
                            >
                              <User className="w-3.5 h-3.5" />
                              <span>Allocate Patient</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        </main>
      </div>

      {/* MODAL 1: REGISTER NEW PATIENT & SELECT AVAILABLE BED */}
      {isAddPatientModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-teal-800" />
                <h3 className="font-bold text-base text-slate-900">Register New Patient</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 :text-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInitiatePatientRegistration} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ronald Verma"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50  border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="patient-bed-input" className="block text-xs font-semibold text-slate-800 mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-50  border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                />
                <datalist id="available-beds-registration-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} {b.ward ? `(${b.ward})` : ""} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Type any bed number or pick an available bed. The bed will be assigned pending patient bedside approval.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPatientModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPatient || !newPatientName.trim() || !newPatientBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-teal-800" />
                <h3 className="font-bold text-base text-slate-900">Propose Bed Change</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBedChangeModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 :text-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmProposeBedChange} className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50  border border-slate-300 text-xs space-y-1 text-slate-800">
                <div>Patient: <strong className="text-slate-900">{bedChangePatient.displayName}</strong> ({bedChangePatient.patientCode})</div>
                <div>Current Bed: <strong className="text-teal-800 font-mono">{bedChangePatient.bedLabel || "None"}</strong></div>
                {bedChangePatient.pendingBedLabel && (
                  <div className="text-amber-800  font-medium">Already Pending Proposal: Bed {bedChangePatient.pendingBedLabel}</div>
                )}
              </div>

              <div>
                <label htmlFor="propose-bed-input" className="block text-xs font-semibold text-slate-800 mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-50  border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                />
                <datalist id="available-beds-propose-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Type any bed number or choose from available beds. Current bed remains active until patient explicitly approves.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBedChangeModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={proposingBed || !selectedNewBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition disabled:opacity-50 shadow-xs"
                >
                  {proposingBed ? "Proposing..." : "Propose Bed Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ALLOCATE DEVICE TO PATIENT */}
      {allocateModalPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 max-w-lg w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-teal-800" />
                <h3 className="font-bold text-base text-slate-900">
                  Allocate Device to {allocateModalPatient.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="text-slate-400 hover:text-slate-900 :text-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Select an available, online NPG device from the registered hardware registry below. Devices must be online to be allocated.
              </p>

              {/* Devices Selection List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {devices.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50  border border-slate-300 text-xs text-slate-600 text-center">
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
                            ? "bg-slate-50/50  border-slate-300 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-teal-50 border-teal-600 text-teal-900  ring-1 ring-teal-600 cursor-pointer"
                            : "bg-white  border-slate-300 hover:border-teal-600 cursor-pointer text-slate-800"
                        }`}
                      >
                        <div>
                          <div className="font-semibold flex items-center gap-2">
                            <span>{d.name || d.deviceId}</span>
                            <span className="font-mono text-[11px] text-slate-600">({d.deviceId})</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            Hardware ID: <span className="font-mono">{d.hardwareId || "N/A"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide ${
                              isOnline
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                : "bg-slate-100 text-slate-600 border border-slate-200  border-slate-300 "
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>
                          {isOnline && d.batteryLevel !== undefined && d.batteryLevel !== null && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide inline-flex items-center gap-1 ${
                                d.batteryLevel > 50
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                  : d.batteryLevel > 20
                                  ? "bg-amber-50 text-amber-800 border border-amber-200   "
                                  : "bg-rose-50 text-rose-800 border border-rose-200   "
                              }`}
                              title={`Battery: ${d.batteryLevel}%`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              <span>{d.batteryLevel}%</span>
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide ${
                              isAlreadyAssigned
                                ? "bg-slate-100 text-slate-700 border border-slate-200   border-slate-300"
                                : isSelectable
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200   "
                                : "bg-slate-100 text-slate-600 border border-slate-200  border-slate-300 "
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

            <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allocatingDevice || !selectedAllocateDeviceId}
                onClick={handleConfirmAllocateDevice}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition disabled:opacity-50 shadow-xs"
              >
                {allocatingDevice ? "Allocating..." : "Confirm Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SEND CARE LINK REQUEST */}
      {careLinkModalPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-teal-800" />
                <h3 className="font-bold text-base text-slate-900">
                  Send Care Link Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCareLinkModalPatient(null)}
                className="text-slate-400 hover:text-slate-900 :text-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSendCareLink} className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50  border border-slate-300 text-xs space-y-1 text-slate-800">
                <div>Patient: <strong className="text-slate-900">{careLinkModalPatient.displayName}</strong> ({careLinkModalPatient.patientCode})</div>
                <div>Current Bed: <strong className="text-teal-800 font-mono">{careLinkModalPatient.bedLabel || "None"}</strong></div>
              </div>

              <div>
                <label htmlFor="carelink-bed-number" className="block text-xs font-semibold text-slate-800 mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-50  border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                />
                <datalist id="available-beds-carelink-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Enter the bed number to assign. Only the patient can approve this care link request at their bedside terminal.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCareLinkModalPatient(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nurseAssignLoading[careLinkModalPatient.patientCode] || !careLinkBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 max-w-sm w-full space-y-4 shadow-lg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h3 className="font-bold text-sm text-slate-900">{stepConfirm.stepTitle}</h3>
              <button onClick={() => setStepConfirm(null)} className="text-slate-400 hover:text-slate-900 :text-slate-100 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {stepConfirm.stepDescription}
            </p>
            {stepConfirm.isResolutionStep ? (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => executeStepConfirmation(false)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition flex items-center justify-center gap-2 shadow-xs"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Ask Patient to Confirm (Bedside Audio)</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeStepConfirmation(true)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-medium text-emerald-700  border border-emerald-200  hover:bg-emerald-50 :bg-emerald-950/40 transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Direct Nurse Override (Mark Resolved)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStepConfirm(null)}
                  className="w-full py-1 text-center text-xs text-slate-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStepConfirm(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeStepConfirmation(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs ${stepConfirm.actionButtonColor}`}
                >
                  {stepConfirm.actionButtonLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT DEVICE COMMANDS / GESTURE RULES */}
      {editingDeviceCommands && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white border border-slate-300 shadow-xs rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70  shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${
                  editingDeviceCommands.connectivityStatus === "ONLINE"
                    ? "bg-teal-50 text-teal-800 border-teal-200 "
                    : "bg-rose-50 text-rose-700  border-rose-200 "
                }`}>
                  {editingDeviceCommands.connectivityStatus === "ONLINE" ? (
                    <Sliders className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-slate-900">
                    {editingDeviceCommands.connectivityStatus === "ONLINE"
                      ? "Configure NPG Commands & Gestures"
                      : "Commands Locked — Device Offline"}
                  </h3>
                  <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap mt-0.5">
                    <span>Gateway: <strong className="font-mono text-slate-800">{editingDeviceCommands.name || editingDeviceCommands.deviceId}</strong></span>
                    {editingDeviceCommands.hardwareId && (
                      <span className="font-mono text-[11px] text-slate-400">HW: {editingDeviceCommands.hardwareId}</span>
                    )}
                    {editingDeviceCommands.currentAssignment?.patient && (
                      <span className="text-teal-800 font-medium">
                        &bull; Allocated to {editingDeviceCommands.currentAssignment.patient.displayName}
                      </span>
                    )}
                    {editingDeviceCommands.connectivityStatus === "ONLINE" && editingDeviceCommands.batteryLevel !== undefined && editingDeviceCommands.batteryLevel !== null && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider inline-flex items-center gap-1 ${
                          editingDeviceCommands.batteryLevel > 50
                            ? "bg-emerald-50 text-emerald-800  border border-emerald-200 "
                            : editingDeviceCommands.batteryLevel > 20
                            ? "bg-amber-50 text-amber-800  border border-amber-200 "
                            : "bg-rose-50 text-rose-800  border border-rose-200 "
                        }`}
                        title={`Battery: ${editingDeviceCommands.batteryLevel}%`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        <span>Battery: {editingDeviceCommands.batteryLevel}%</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDeviceCommands(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 :text-slate-100 hover:bg-slate-100 transition border border-slate-300"
                aria-label="Close command editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Editor Body or Offline Guard */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {editingDeviceCommands.connectivityStatus === "ONLINE" ? (
                <CommandRuleEditor
                  deviceId={editingDeviceCommands.deviceId}
                  variant="panel"
                  onDone={() => setEditingDeviceCommands(null)}
                />
              ) : (
                <div className="py-12 px-4 text-center max-w-md mx-auto space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-700  border border-rose-200  flex items-center justify-center mx-auto shadow-sm">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-slate-900">
                      Device Is Offline
                    </h4>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      Commands cannot be viewed, configured, or edited while the NPG hardware gateway is offline. The device must be powered on and online with active telemetry before rules can be calibrated.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDeviceCommands(null)}
                    className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: ALLOCATE DEVICE TO PATIENT (FROM DEVICES TAB) */}
      {allocatingDeviceFromList && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-xs rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-800" />
                <h3 className="font-bold text-base text-slate-900">
                  Allocate Device to Patient
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAllocatingDeviceFromList(null);
                  setSelectedPatientForDevice("");
                }}
                className="text-slate-400 hover:text-slate-900 :text-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50  border border-slate-300 text-xs space-y-1">
                <div>Device: <strong className="text-slate-900">{allocatingDeviceFromList.name || allocatingDeviceFromList.deviceId}</strong> ({allocatingDeviceFromList.deviceId})</div>
                <div className="text-[11px] text-slate-600 font-mono">Hardware ID: {allocatingDeviceFromList.hardwareId || "N/A"}</div>
              </div>

              <p className="text-xs text-slate-600">
                Select a registered bedside patient to allocate this NPG device to. Strict one-device-to-one-patient policy applies.
              </p>

              {/* Patient Selection List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {patients.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50  border border-slate-300 text-xs text-slate-600 text-center">
                    No registered patients available in ward.
                  </div>
                ) : (
                  patients.map((pt) => {
                    const hasDevice = Boolean(pt.currentAssignment?.device);
                    const isSelected = selectedPatientForDevice === pt.patientCode;
                    return (
                      <div
                        key={pt.patientCode}
                        onClick={() => {
                          if (!hasDevice) setSelectedPatientForDevice(pt.patientCode);
                        }}
                        className={`p-3 rounded-lg border text-xs transition flex items-center justify-between gap-3 ${
                          hasDevice
                            ? "bg-slate-50/50  border-slate-300 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-teal-50 border-teal-600 text-teal-900  ring-1 ring-teal-600 cursor-pointer"
                            : "bg-white  border-slate-300 hover:border-teal-600 cursor-pointer text-slate-800"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {pt.displayName}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            Code: <span className="font-mono">{pt.patientCode}</span> &bull; Bed: <span className="font-mono">{pt.bedLabel || "Unassigned"}</span>
                          </div>
                        </div>

                        <div>
                          {hasDevice ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600   border border-slate-300">
                              HAS DEVICE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800   border border-emerald-200 ">
                              READY
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setAllocatingDeviceFromList(null);
                  setSelectedPatientForDevice("");
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 :text-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allocatingPatientToDeviceLoading || !selectedPatientForDevice}
                onClick={handleConfirmAllocatePatientToDevice}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition disabled:opacity-50 shadow-xs"
              >
                {allocatingPatientToDeviceLoading ? "Allocating..." : "Confirm Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLE COMMISSIONING MODAL */}
      {isBleModalOpen && (
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
      )}

      {/* CHORDS LIVE BIO-POTENTIAL SIGNAL STUDIO (Upside Down Labs) */}
      <ChordsSignalVisualizerModal
        isOpen={isChordsModalOpen}
        onClose={() => setIsChordsModalOpen(false)}
        devices={devices}
        patients={patients}
        initialDeviceId={chordsInitialDeviceId}
        initialPatientCode={chordsInitialPatientCode}
      />
    </div>
  );
}
