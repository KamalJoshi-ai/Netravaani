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
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Volume2,
  VolumeX,
  LayoutDashboard,
  FileText,
  ArrowLeft,
  ChevronRight,
  Clock,
  Sliders,
  Lock,
} from "@/lib/noIcons";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import LoginForm from "@/components/LoginForm";
import BleCommissioningModal from "@/components/BleCommissioningModal";
import CommandRuleEditor from "@/components/commands/CommandRuleEditor";
import { useVoiceAlerts } from "@/lib/speech";

interface StepConfirmData {
  request: CareRequestItem;
  nextStep: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED";
  stepTitle: string;
  stepDescription: string;
  actionButtonLabel: string;
  actionButtonColor: string;
}

interface PatientCallGroup {
  key: string;
  patientId?: string;
  patientCode: string;
  displayName: string;
  bedLabel: string;
  calls: CareRequestItem[];
  activeCount: number;
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
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "patients" | "devices" | "history">("overview");
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
        stepTitle: "Mark Request Resolved",
        stepDescription: `Confirm care for ${act} has been completed for ${pName} on ${pBed}?`,
        actionButtonLabel: "Complete & Resolve",
        actionButtonColor: "bg-[#287A59] hover:bg-[#206348]",
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
      <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] flex items-center justify-center p-6 text-[#28211B] dark:text-[#F2ECE1]">
        <div className="flex items-center gap-3 bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl px-5 py-3 shadow-xs">
          <RefreshCw className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F] animate-spin" />
          <span className="text-sm font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1]">Connecting to Nurse Station...</span>
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

  const openCallsCount = requests.filter((r) => r.status !== "RESOLVED").length;

  return (
    <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] text-[#28211B] dark:text-[#F2ECE1] font-sans antialiased flex transition-colors duration-150">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in duration-150">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-semibold shadow-dropdown ${
              toastIsError
                ? "bg-[#FAEEEE] dark:bg-[#2B1414] border-[#E8BCBC] dark:border-[#522323] text-[#9E3232] dark:text-[#D95B5B]"
                : "bg-[#EBF3ED] dark:bg-[#132418] border-[#BCD5C4] dark:border-[#204A2E] text-[#2E6243] dark:text-[#4AA86C]"
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
          className="fixed inset-0 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* COLLAPSIBLE SIDEBAR */}
      <aside
        className={`fixed lg:sticky top-0 h-screen z-50 flex flex-col justify-between bg-[#FAF6F0] dark:bg-[#0D0D0E] border-r border-[#DCD2C0] dark:border-[#222226] transition-all duration-200 ease-in-out shrink-0 select-none ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${
          isSidebarCollapsed ? "lg:w-20" : "lg:w-64"
        } w-72`}
      >
        {/* SIDEBAR HEADER / BRAND SEAL */}
        <div>
          <div className={`p-4 border-b border-[#DCD2C0] dark:border-[#222226] flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
            <div className="flex items-center gap-3">
              {/* Vintage Monogram Seal */}
              <div
                className="w-10 h-10 rounded-lg bg-[#1D2D38] dark:bg-[#151C20] text-[#FAF6F0] flex items-center justify-center font-serif font-black text-sm tracking-wider shadow-xs border border-[#8C4327]/30 shrink-0"
                title="NetraVaani Clinical Ledger"
              >
                NV
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <div className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1] tracking-tight leading-none">
                    Netra<span className="font-serif italic font-normal text-[#8C4327] dark:text-[#D49D4F]">Vaani</span>
                  </div>
                  <div className="text-[10px] tracking-wider uppercase font-semibold text-[#8C4327] dark:text-[#D49D4F] mt-1 font-mono">
                    Clinical Ledger &bull; Nurse
                  </div>
                </div>
              )}
            </div>

            {/* Collapse toggle (Desktop) and Close button (Mobile) */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex p-1.5 rounded-md text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] hover:bg-[#ECE3D4] dark:hover:bg-[#141416] transition"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-1.5 rounded-md text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] hover:bg-[#ECE3D4] dark:hover:bg-[#141416] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* QUICK ACTION SHORTCUTS */}
          <div className="p-3 border-b border-[#DCD2C0] dark:border-[#222226] space-y-2">
            {!isSidebarCollapsed ? (
              <>
               
                <button
                  type="button"
                  onClick={() => setIsBleModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold text-[#8C4327] dark:text-[#D49D4F] bg-[#ECE3D4] dark:bg-[#141416] hover:bg-[#E2D6C3] dark:hover:bg-[#1A1A1E] border border-[#DCD2C0] dark:border-[#222226] transition shadow-xs"
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
                  className="w-9 h-9 rounded-lg bg-[#8C4327] hover:bg-[#73341C] text-white flex items-center justify-center transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsBleModalOpen(true)}
                  title="Commission BLE Device"
                  className="w-9 h-9 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226] hover:bg-[#E2D6C3] dark:hover:bg-[#1A1A1E] flex items-center justify-center transition shadow-xs"
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
              { id: "history", label: "Audit Ledger", icon: FileText },
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition group relative ${
                    isActive
                      ? "bg-[#1D2D38] dark:bg-[#151C20] text-[#FAF6F0] shadow-xs"
                      : "text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] hover:bg-[#ECE3D4] dark:hover:bg-[#141416]"
                  } ${isSidebarCollapsed ? "justify-center px-2" : ""}`}
                >
                  <IconComponent
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? "text-[#FAF6F0]"
                        : "text-[#8C4327] dark:text-[#D49D4F] group-hover:text-[#28211B] dark:group-hover:text-[#F2ECE1]"
                    }`}
                  />
                  {!isSidebarCollapsed && (
                    <div className="flex-1 flex items-center justify-between text-left">
                      <span className="font-serif tracking-wide">{item.label}</span>
                      {item.count !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                            item.isUrgent
                              ? "bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323]"
                              : isActive
                              ? "bg-white/20 text-[#FAF6F0]"
                              : "bg-[#ECE3D4] dark:bg-[#141416] text-[#6F6256] dark:text-[#9E9689]"
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
                        item.isUrgent ? "bg-[#9E3232]" : "bg-[#8C4327]"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* SIDEBAR FOOTER / PROFILE & UTILITIES */}
        <div className="p-3 border-t border-[#DCD2C0] dark:border-[#222226] space-y-2.5 bg-[#F5EFE6]/50 dark:bg-[#0A0A0B]/50">
          {/* Controls: Voice alerts, Refresh sync, Theme */}
          <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? "flex-col" : "justify-between"}`}>
            {/* Voice toggle */}
            {voice.supported && (
              <button
                type="button"
                onClick={() => voice.setEnabled(!voice.enabled)}
                title={voice.enabled ? "Voice Alerts: Active" : "Voice Alerts: Muted"}
                className={`p-1.5 rounded-md border text-xs font-semibold transition ${
                  voice.enabled
                    ? "bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border-[#BCD5C4] dark:border-[#204A2E]"
                    : "bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#6F6256] dark:text-[#9E9689] border-[#DCD2C0] dark:border-[#222226] hover:text-[#28211B] dark:hover:text-[#F2ECE1]"
                } ${!isSidebarCollapsed ? "flex-1 flex items-center justify-center gap-1.5" : ""}`}
              >
                {voice.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {!isSidebarCollapsed && (
                  <span className="font-serif text-[11px]">{voice.enabled ? "Voice: On" : "Voice: Off"}</span>
                )}
              </button>
            )}

            {/* Sync Refresh button */}
            <button
              type="button"
              onClick={() => {
                fetchRequests(true);
                fetchAuxData();
              }}
              title="Sync clinical ledger"
              className={`p-1.5 rounded-md border border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#6F6256] dark:text-[#9E9689] hover:text-[#8C4327] dark:hover:text-[#D49D4F] transition ${
                !isSidebarCollapsed ? "px-2.5 flex items-center gap-1" : ""
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#8C4327]" : ""}`} />
              {!isSidebarCollapsed && <span className="text-[11px] font-serif font-medium">Sync</span>}
            </button>

            {/* Dark/Light mode toggle */}
            <ThemeToggle />
          </div>

          {/* User Profile info */}
          <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226]">
            {!isSidebarCollapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded-full bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226] flex items-center justify-center text-xs font-serif font-bold shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-serif font-bold text-[#28211B] dark:text-[#F2ECE1] truncate">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-[#6F6256] dark:text-[#9E9689] font-mono truncate">
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
                  className="p-1.5 rounded-md text-[#6F6256] dark:text-[#9E9689] hover:text-[#9E3232] hover:bg-[#FAEEEE] dark:hover:bg-[#2B1414] transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226] flex items-center justify-center text-xs font-serif font-bold"
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
                  className="p-1.5 rounded-md text-[#6F6256] dark:text-[#9E9689] hover:text-[#9E3232] hover:bg-[#FAEEEE] dark:hover:bg-[#2B1414] transition"
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
        <header className="sticky top-0 z-30 bg-[#FAF6F0]/90 dark:bg-[#0D0D0E]/90 backdrop-blur-md border-b border-[#DCD2C0] dark:border-[#222226] px-4 sm:px-6 lg:px-8 py-3.5 transition-colors">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Mobile hamburger & Section Title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] hover:bg-[#ECE3D4] dark:hover:bg-[#141416] transition border border-[#DCD2C0] dark:border-[#222226]"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div>
                <h1 className="font-serif font-bold text-lg sm:text-xl text-[#28211B] dark:text-[#F2ECE1] tracking-tight">
                  {activeTab === "overview" && "Ward Occupancy & Overview"}
                  {activeTab === "calls" && "Live Clinical Calls & Alarms"}
                  {activeTab === "patients" && "Patient Bedside Registry"}
                  {activeTab === "devices" && "Hardware Gateways & Allocation"}
                  {activeTab === "history" && "Clinical Audit Ledger"}
                </h1>
                <p className="text-[11px] text-[#6F6256] dark:text-[#9E9689] flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E6243] inline-block" />
                  <span>Clinical Station Desk &bull; Telemetry Connected</span>
                </p>
              </div>
            </div>

            {/* Right: Quick actions on header */}
         
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
              <div className="lg:col-span-6 bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                      <Bed className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                        Hospital Beds Occupancy
                      </h2>
                      <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                        Nurse-controlled bed allocation ledger
                      </p>
                    </div>
                  </div>
                 
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] text-center shadow-xs">
                    <span className="text-xs text-[#2E6243] dark:text-[#4AA86C] font-serif font-medium block">Available</span>
                    <span className="text-2xl font-serif font-bold text-[#2E6243] dark:text-[#4AA86C]">{availableBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FAF4E8] dark:bg-[#2B2113] border border-[#E8D2A8] dark:border-[#5A401C] text-center shadow-xs">
                    <span className="text-xs text-[#A36F1C] dark:text-[#D49D4F] font-serif font-medium block">Pending Approval</span>
                    <span className="text-2xl font-serif font-bold text-[#A36F1C] dark:text-[#D49D4F]">{pendingBedsCount}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-center shadow-xs">
                    <span className="text-xs text-[#8C4327] dark:text-[#D49D4F] font-serif font-medium block">Occupied</span>
                    <span className="text-2xl font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">{occupiedBedsCount}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("patients")}
                    className="w-full py-2 px-3 rounded-lg text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] hover:border-[#8C4327] dark:hover:border-[#D49D4F] transition text-center shadow-xs"
                  >
                    Manage Patients &amp; Bed Assignments
                  </button>
                </div>
              </div>

              {/* Card 2: NPG Device Gateways Registry */}
              <div className="lg:col-span-6 bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                        Clinical Devices &amp; Gateways
                      </h2>
                      <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                        Strict 1-to-1 patient allocation
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]">
                    {onlineDevicesCount} Online
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-center shadow-xs">
                    <span className="text-xs text-[#6F6256] dark:text-[#9E9689] font-serif font-medium block">Total Registered</span>
                    <span className="text-2xl font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">{devices.length}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FAF4E8] dark:bg-[#2B2113] border border-[#E8D2A8] dark:border-[#5A401C] text-center shadow-xs">
                    <span className="text-xs text-[#A36F1C] dark:text-[#D49D4F] font-serif font-medium block">Allocated</span>
                    <span className="text-2xl font-serif font-bold text-[#28211B] dark:text-[#F2ECE1]">
                      {devices.filter((d) => d.status === "ASSIGNED" || d.currentAssignment).length}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] text-center shadow-xs">
                    <span className="text-xs text-[#2E6243] dark:text-[#4AA86C] font-serif font-medium block">Available</span>
                    <span className="text-2xl font-serif font-bold text-[#2E6243] dark:text-[#4AA86C]">
                      {devices.filter((d) => d.status === "AVAILABLE" && !d.currentAssignment).length}
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("devices")}
                    className="w-full py-2 px-3 rounded-lg text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] hover:border-[#8C4327] dark:hover:border-[#D49D4F] transition text-center shadow-xs"
                  >
                    Manage NPG Devices
                  </button>
                </div>
              </div>

            </div>

            {/* Recent Clinical Activity */}
            <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                  Recent Clinical Activity
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-serif font-semibold text-[#8C4327] dark:text-[#D49D4F] hover:underline flex items-center gap-1"
                >
                  <span>View full history</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-[#DCD2C0] dark:divide-[#222226]">
                {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#6F6256] dark:text-[#9E9689]">
                    No clinical calls resolved yet during this shift.
                  </div>
                ) : (
                  requests
                    .filter((r) => r.status === "RESOLVED")
                    .slice(0, 5)
                    .map((req) => (
                      <div key={req._id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-[#2E6243]" />
                          <div>
                            <div className="font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                              {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689]">
                              {req.patient?.displayName || "Patient"} &bull; Bed: {req.patient?.bedLabel || "Active"} &bull; Handled
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-[#6F6256] dark:text-[#9E9689]">
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
                      className="p-1.5 rounded-lg border border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#6F6256] dark:text-[#9E9689] hover:text-[#8C4327] dark:hover:text-[#D49D4F] transition shadow-xs"
                      title="Back to All Patient Cards"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#28211B] dark:text-[#F2ECE1]">
                    {selectedPatientGroup ? `${selectedPatientGroup.displayName} — Live Calls Ledger` : "Live Bedside Care Calls"}
                  </h2>
                </div>
                <p className="text-xs text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                  {selectedPatientGroup
                    ? `Bed ${selectedPatientGroup.bedLabel} • Ledger #${selectedPatientGroup.patientCode} • ${selectedPatientGroup.calls.length} calls recorded`
                    : "Patient-categorized bedside gestures and active clinical calls"}
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#6F6256] dark:text-[#9E9689] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search calls or beds..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] placeholder-[#6F6256] dark:placeholder-[#9E9689] focus:outline-none focus:ring-1 focus:ring-[#8C4327] shadow-xs"
                  />
                </div>
                {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-serif font-semibold transition shadow-xs ${
                      filter === st
                        ? "bg-[#1D2D38] dark:bg-[#151C20] text-[#FAF6F0]"
                        : "bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#6F6256] dark:text-[#9E9689] border border-[#DCD2C0] dark:border-[#222226] hover:text-[#28211B] dark:hover:text-[#F2ECE1]"
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
                <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCallsPatientKey(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-serif font-semibold bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] hover:border-[#8C4327] dark:hover:border-[#D49D4F] transition shadow-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>All Patients</span>
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-bold text-sm text-[#28211B] dark:text-[#F2ECE1]">
                          {selectedPatientGroup.displayName}
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                          {selectedPatientGroup.patientCode}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#1D2D38] dark:text-[#D49D4F]">
                          Bed {selectedPatientGroup.bedLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="px-2.5 py-1 rounded-md bg-[#ECE3D4] dark:bg-[#141416] text-[#6F6256] dark:text-[#9E9689] border border-[#DCD2C0] dark:border-[#222226] font-mono font-semibold">
                      {selectedPatientGroup.calls.length} Total Calls
                    </span>
                    {selectedPatientGroup.awaitingCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-md bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323] font-mono font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#9E3232] animate-pulse" />
                        {selectedPatientGroup.awaitingCount} Awaiting Attention
                      </span>
                    ) : selectedPatientGroup.activeCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-md bg-[#FAF4E8] dark:bg-[#2B2113] text-[#A36F1C] dark:text-[#D49D4F] border border-[#E8D2A8] dark:border-[#5A401C] font-mono font-semibold">
                        {selectedPatientGroup.activeCount} In Progress
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E] font-serif font-medium">
                        All Calls Resolved ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient's Granular Calls Ledger */}
                <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl overflow-hidden shadow-xs">
                  {selectedPatientGroup.calls.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689] space-y-2">
                      <p>No calls matching &ldquo;{filter}&rdquo; for this patient.</p>
                      {filter !== "ALL" && (
                        <button
                          type="button"
                          onClick={() => setFilter("ALL")}
                          className="font-serif font-semibold text-xs text-[#8C4327] dark:text-[#D49D4F] hover:underline"
                        >
                          View all calls for {selectedPatientGroup.displayName}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-[#DCD2C0] dark:divide-[#222226]">
                      {selectedPatientGroup.calls.map((req) => (
                        <div
                          key={req._id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F5EFE6]/60 dark:hover:bg-[#141416]/60 transition"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                                req.status === "RESOLVED"
                                  ? "bg-[#2E6243]"
                                  : req.status === "IN_PROGRESS"
                                  ? "bg-[#345C5A]"
                                  : req.status === "ACKNOWLEDGED"
                                  ? "bg-[#B88738]"
                                  : "bg-[#9E3232] animate-pulse"
                              }`}
                            />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-serif font-bold text-sm text-[#28211B] dark:text-[#F2ECE1]">
                                  {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                    req.status === "RESOLVED"
                                      ? "bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]"
                                      : req.status === "IN_PROGRESS"
                                      ? "bg-[#E7EFEF] dark:bg-[#172626] text-[#345C5A] dark:text-[#AFC5C4] border border-[#AFC5C4] dark:border-[#264443]"
                                      : req.status === "ACKNOWLEDGED"
                                      ? "bg-[#FAF4E8] dark:bg-[#2B2113] text-[#A36F1C] dark:text-[#D49D4F] border border-[#E8D2A8] dark:border-[#5A401C]"
                                      : "bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323]"
                                  }`}
                                >
                                  {req.status}
                                </span>
                                <span className="text-[11px] text-[#6F6256] dark:text-[#9E9689] flex items-center gap-1 font-mono">
                                  <Clock className="w-3 h-3" />
                                  {formatCallTime(req.createdAt)}
                                </span>
                              </div>
                              <div className="text-xs text-[#6F6256] dark:text-[#9E9689] mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>Recorded: <strong className="font-mono text-[#28211B] dark:text-[#F2ECE1]">{new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></span>
                                <span>&bull;</span>
                                <span>Gateway: <span className="font-mono text-[#8C4327] dark:text-[#D49D4F]">{req.device?.deviceId || "Gateway"}</span></span>
                              </div>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {req.status === "NEW" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "ACKNOWLEDGED")}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-serif font-semibold bg-[#B88738] hover:bg-[#9E732E] text-white transition shadow-xs"
                              >
                                Acknowledge
                              </button>
                            )}
                            {req.status === "ACKNOWLEDGED" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "IN_PROGRESS")}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-serif font-semibold bg-[#345C5A] hover:bg-[#284846] text-white transition shadow-xs"
                              >
                                Start Handling
                              </button>
                            )}
                            {req.status === "IN_PROGRESS" && (
                              <button
                                type="button"
                                onClick={() => promptStepConfirmation(req, "RESOLVED")}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-serif font-semibold bg-[#2E6243] hover:bg-[#234C33] text-white transition shadow-xs"
                              >
                                Mark Resolved
                              </button>
                            )}
                            {req.status === "RESOLVED" && (
                              <span className="text-xs font-serif font-semibold text-[#2E6243] dark:text-[#4AA86C] flex items-center gap-1">
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
            ) : (
              /* VIEW A: PATIENT CALL CARDS (CATEGORIZED ACCORDING TO PATIENT) */
              patientCallGroups.length === 0 ? (
                <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689] shadow-xs">
                  No active bedside calls matching current filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {patientCallGroups.map((group) => {
                    return (
                      <div
                        key={group.key}
                        onClick={() => setSelectedCallsPatientKey(group.key)}
                        className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-4 sm:p-5 hover:border-[#8C4327] dark:hover:border-[#D49D4F] transition-all duration-150 shadow-xs cursor-pointer group flex flex-col justify-between space-y-4"
                      >
                        {/* Card Top: Patient Identity & Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-9 h-9 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                              {group.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                              <h3 className="font-serif font-bold text-sm text-[#28211B] dark:text-[#F2ECE1] group-hover:text-[#8C4327] dark:group-hover:text-[#D49D4F] transition-colors truncate">
                                {group.displayName}
                              </h3>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#6F6256] dark:text-[#9E9689] font-mono mt-0.5">
                                <span>{group.patientCode}</span>
                                <span>&bull;</span>
                                <span className="font-bold text-[#1D2D38] dark:text-[#D49D4F]">Bed {group.bedLabel}</span>
                              </div>
                            </div>
                          </div>

                          {/* Status Pill */}
                          {group.awaitingCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323] shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#9E3232] animate-pulse" />
                              {group.awaitingCount} Awaiting
                            </span>
                          ) : group.inProgressCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E7EFEF] dark:bg-[#172626] text-[#345C5A] dark:text-[#AFC5C4] border border-[#AFC5C4] dark:border-[#264443] shrink-0">
                              {group.inProgressCount} Handling
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-serif font-semibold bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E] shrink-0">
                              Resolved ✓
                            </span>
                          )}
                        </div>

                        {/* Card Body: Summary of Live Calls (NOT in granular detail) */}
                        <div className="bg-[#ECE3D4]/50 dark:bg-[#141416]/60 rounded-lg p-3 border border-[#DCD2C0]/70 dark:border-[#222226] space-y-2">
                          {/* Latest Request preview */}
                          {group.latestCall && (
                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <Bell className="w-3.5 h-3.5 text-[#8C4327] dark:text-[#D49D4F] shrink-0" />
                                <span className="font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] truncate">
                                  {group.latestCall.displayLabel || group.latestCall.label || group.latestCall.action.replace(/_/g, " ")}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-[#6F6256] dark:text-[#9E9689] shrink-0">
                                {formatCallTime(group.latestCall.createdAt)}
                              </span>
                            </div>
                          )}

                          {/* High-level status counters summary */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1]">
                              {group.calls.length} Total Calls
                            </span>
                            {group.activeCount > 0 ? (
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#FAF4E8] dark:bg-[#2B2113] border border-[#E8D2A8] dark:border-[#5A401C] text-[#A36F1C] dark:text-[#D49D4F]">
                                {group.activeCount} Active
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] text-[#2E6243] dark:text-[#4AA86C]">
                                All Clean
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Footer: Clear Affordance to View Ledger */}
                        <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-between text-xs font-serif font-semibold text-[#8C4327] dark:text-[#D49D4F]">
                          <span className="text-[11px] text-[#6F6256] dark:text-[#9E9689] font-normal">
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
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#28211B] dark:text-[#F2ECE1]">
                  Patient Registry &amp; Bed Assignments
                </h2>
                <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                  Nurse-controlled bed assignment &amp; strict 1-to-1 device allocation
                </p>
              </div>
            </div>

            {/* Patients Grid */}
            {patients.length === 0 ? (
              <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689]">
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
                      className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-4 sm:p-5 space-y-4 flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        {/* Header: Patient Code & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-semibold text-[#6F6256] dark:text-[#9E9689] bg-[#ECE3D4] dark:bg-[#141416] px-2 py-0.5 rounded border border-[#DCD2C0] dark:border-[#222226]">
                            {pt.patientCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                              pt.status === "ACTIVE"
                                ? "bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]"
                                : "bg-[#FAF4E8] dark:bg-[#2B2113] text-[#A36F1C] dark:text-[#D49D4F] border border-[#E8D2A8] dark:border-[#5A401C]"
                            }`}
                          >
                            {pt.status === "ACTIVE" ? "Active" : "Pending Bed Approval"}
                          </span>
                        </div>

                        {/* Patient Name */}
                        <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1] mt-2">
                          {pt.displayName}
                        </h3>

                        {/* Bed Assignments Breakdown */}
                        <div className="mt-3 p-3 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] space-y-2 text-xs">
                          {/* Confirmed Bed */}
                          <div className="flex items-center justify-between">
                            <span className="text-[#6F6256] dark:text-[#9E9689] font-medium font-serif">Confirmed Bed:</span>
                            {hasConfirmed ? (
                              <span className="font-bold text-[#2E6243] dark:text-[#4AA86C] font-mono bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] px-2 py-0.5 rounded">
                                {pt.bedLabel}
                              </span>
                            ) : (
                              <span className="text-[#96887B] italic">None</span>
                            )}
                          </div>

                          {/* Pending Bed Proposal */}
                          {hasPendingBed && (
                            <div className="flex items-center justify-between pt-1 border-t border-[#DCD2C0] dark:border-[#222226]">
                              <span className="text-[#A36F1C] dark:text-[#D49D4F] font-semibold font-serif">Pending Proposal:</span>
                              <span className="font-bold text-[#A36F1C] dark:text-[#D49D4F] font-mono bg-[#FAF4E8] dark:bg-[#2B2113] border border-[#E8D2A8] dark:border-[#5A401C] px-2 py-0.5 rounded">
                                Bed {pt.pendingBedLabel}
                              </span>
                            </div>
                          )}

                          {/* Propose Bed Change Action */}
                          <div className="pt-1.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenBedChangeModal(pt)}
                              className="text-[11px] font-serif font-semibold text-[#8C4327] dark:text-[#D49D4F] hover:underline transition flex items-center gap-1"
                            >
                              <Bed className="w-3 h-3" />
                              <span>{hasConfirmed ? "Propose Bed Change" : "Assign Available Bed"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Device Allocation Section */}
                        <div className="mt-3 pt-3 border-t border-[#DCD2C0] dark:border-[#222226] space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#6F6256] dark:text-[#9E9689] font-medium font-serif">Assigned NPG Device:</span>
                            {assignedDevice ? (
                              <span className="font-mono font-bold text-[#1D2D38] dark:text-[#D49D4F] bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] px-2 py-0.5 rounded">
                                {assignedDevice.deviceId}
                              </span>
                            ) : (
                              <span className="text-[#96887B] italic">No Device Allocated</span>
                            )}
                          </div>

                          {/* Device Action: Allocate or Unassign */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[#6F6256] dark:text-[#9E9689] font-medium font-serif">Device Action:</span>
                            {assignedDevice ? (
                              <button
                                type="button"
                                disabled={deviceDeallocatingMap[assignedDevice.deviceId]}
                                onClick={() => handleDeallocateDevice(assignedDevice.deviceId, pt.displayName)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#9E3232] dark:text-[#D95B5B] bg-[#FAEEEE] dark:bg-[#2B1414] border border-[#E8BCBC] dark:border-[#522323] px-2.5 py-1 rounded-md hover:bg-[#9E3232] hover:text-white transition shadow-xs"
                                title="Explicitly unassign device to make it available"
                              >
                                <Unlink className="w-3 h-3" />
                                <span>{deviceDeallocatingMap[assignedDevice.deviceId] ? "Releasing..." : "Unassign Device"}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAllocateToPatient(pt)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#8C4327] hover:bg-[#73341C] px-2.5 py-1 rounded-md transition shadow-xs"
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
                      <div className="pt-3 border-t border-[#DCD2C0] dark:border-[#222226] text-xs">
                        {pt.nurseAssignment?.status === "PENDING" ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#A36F1C] dark:text-[#D49D4F] font-serif font-semibold">Awaiting bedside approval</span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-[#9E3232] hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : pt.nurseAssignment?.status === "APPROVED" ? (
                          <div className="flex items-center justify-between text-xs text-[#2E6243] dark:text-[#4AA86C]">
                            <span className="flex items-center gap-1 font-serif font-semibold">
                              <Check className="w-3.5 h-3.5" />
                              <span>Care linked</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeallocatePatient(pt.patientCode)}
                              className="text-[11px] text-[#6F6256] dark:text-[#9E9689] hover:text-[#9E3232]"
                            >
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={nurseAssignLoading[pt.patientCode]}
                            onClick={() => handleOpenCareLinkModal(pt)}
                            className="w-full py-1.5 rounded-lg text-xs font-serif font-semibold bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] hover:border-[#8C4327] transition"
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
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#28211B] dark:text-[#F2ECE1]">
                  NPG Device Registry &amp; Allocation
                </h2>
                <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                  Strict one-device-to-one-patient hardware allocation
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition shadow-xs"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Commission New Device</span>
              </button>
            </div>

            {/* Devices List Table */}
            <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl overflow-hidden shadow-xs">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689]">
                  No NPG devices registered yet. Commission a device to make it available.
                </div>
              ) : (
                <div className="divide-y divide-[#DCD2C0] dark:divide-[#222226]">
                  {devices.map((dev) => {
                    const isOnline = dev.connectivityStatus === "ONLINE";
                    const isAssigned = Boolean(dev.status === "ASSIGNED" || dev.currentAssignment);
                    const isAvailable = dev.status === "AVAILABLE" && !dev.currentAssignment;

                    return (
                      <div key={dev._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F5EFE6]/60 dark:hover:bg-[#141416]/60 transition text-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-serif font-bold text-sm text-[#28211B] dark:text-[#F2ECE1]">{dev.name || dev.deviceId}</span>
                              <span className="font-mono text-[11px] text-[#6F6256] dark:text-[#9E9689]">({dev.deviceId})</span>
                              {dev.hardwareId && (
                                <span className="font-mono text-[10px] text-[#96887B]">HW: {dev.hardwareId}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                              {isAssigned && dev.currentAssignment?.patient ? (
                                <span>Allocated to: <strong className="font-serif text-[#28211B] dark:text-[#F2ECE1]">{dev.currentAssignment.patient.displayName}</strong> ({dev.currentAssignment.patient.patientCode})</span>
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
                                ? "bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]"
                                : "bg-[#ECE3D4] dark:bg-[#141416] text-[#6F6256] dark:text-[#9E9689] border border-[#DCD2C0] dark:border-[#222226]"
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>

                          {/* Allocation Status */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                              isAvailable
                                ? "bg-[#EBF3ED] dark:bg-[#132418] text-[#2E6243] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]"
                                : isAssigned
                                ? "bg-[#ECE3D4] dark:bg-[#141416] text-[#8C4327] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]"
                                : "bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323]"
                            }`}
                          >
                            {dev.status}
                          </span>

                          {/* Edit Commands Action - only accessible when device is online */}
                          {isOnline ? (
                            <button
                              type="button"
                              onClick={() => setEditingDeviceCommands(dev)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-[#8C4327] dark:text-[#D49D4F] bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] hover:bg-[#E2D6C3] dark:hover:bg-[#1A1A1E] transition shadow-xs"
                              title="Edit gestures & command rules for this online device"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Edit Commands</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium text-[#96887B] dark:text-[#7D766C] bg-[#ECE3D4]/30 dark:bg-[#141416]/30 border border-[#DCD2C0]/40 dark:border-[#222226]/40 cursor-not-allowed select-none"
                              title="Device is offline — Commands locked until device connects"
                            >
                              <Lock className="w-3 h-3 text-[#96887B]" />
                              <span>Commands Locked</span>
                            </span>
                          )}

                          {/* Allocation / Unassign Actions */}
                          {isAssigned ? (
                            <button
                              type="button"
                              disabled={deviceDeallocatingMap[dev.deviceId]}
                              onClick={() => handleDeallocateDevice(dev.deviceId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold text-[#9E3232] dark:text-[#D95B5B] bg-[#FAEEEE] dark:bg-[#2B1414] border border-[#E8BCBC] dark:border-[#522323] hover:bg-[#9E3232] hover:text-white transition shadow-xs"
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
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#2E6243] dark:text-[#4AA86C] bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] hover:bg-[#2E6243] hover:text-white dark:hover:bg-[#4AA86C] dark:hover:text-[#0D0D0E] transition shadow-xs"
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

        {/* TAB 5: HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#28211B] dark:text-[#F2ECE1]">
                Clinical Shift History
              </h2>
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Audit log of all handled bedside care calls
              </p>
            </div>

            <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl overflow-hidden shadow-xs divide-y divide-[#DCD2C0] dark:divide-[#222226]">
              {requests.filter((r) => r.status === "RESOLVED").length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6F6256] dark:text-[#9E9689]">
                  No resolved clinical records yet.
                </div>
              ) : (
                requests
                  .filter((r) => r.status === "RESOLVED")
                  .map((req) => (
                    <div key={req._id} className="p-4 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-[#2E6243]" />
                        <div>
                          <div className="font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                            {req.displayLabel || req.label || req.action.replace(/_/g, " ")}
                          </div>
                          <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689]">
                            Patient: {req.patient?.displayName || "Patient"} &bull; Bed: {req.patient?.bedLabel || "Active"} &bull; Gateway: {req.device?.deviceId || "Gateway"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[#6F6256] dark:text-[#9E9689] text-[11px]">
                        {new Date(req.updatedAt || req.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        </main>
      </div>

      {/* MODAL 1: REGISTER NEW PATIENT & SELECT AVAILABLE BED */}
      {isAddPatientModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F]" />
                <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">Register New Patient</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(false)}
                className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInitiatePatientRegistration} className="space-y-4">
              <div>
                <label className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ronald Verma"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] focus:outline-none focus:border-[#8C4327] focus:ring-1 focus:ring-[#8C4327]"
                />
              </div>

              <div>
                <label htmlFor="patient-bed-input" className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] focus:outline-none focus:border-[#8C4327] focus:ring-1 focus:ring-[#8C4327]"
                />
                <datalist id="available-beds-registration-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} {b.ward ? `(${b.ward})` : ""} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-1.5">
                  Type any bed number or pick an available bed. The bed will be assigned pending patient bedside approval.
                </p>
              </div>

              <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPatientModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPatient || !newPatientName.trim() || !newPatientBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F]" />
                <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">Propose Bed Change</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBedChangeModalOpen(false)}
                className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmProposeBedChange} className="space-y-4">
              <div className="p-3 rounded-lg bg-[#ECE3D4]/60 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-xs space-y-1 text-[#28211B] dark:text-[#F2ECE1]">
                <div>Patient: <strong className="font-serif text-[#28211B] dark:text-[#F2ECE1]">{bedChangePatient.displayName}</strong> ({bedChangePatient.patientCode})</div>
                <div>Current Bed: <strong className="text-[#8C4327] dark:text-[#D49D4F] font-mono">{bedChangePatient.bedLabel || "None"}</strong></div>
                {bedChangePatient.pendingBedLabel && (
                  <div className="text-[#A36F1C] font-serif font-medium">Already Pending Proposal: Bed {bedChangePatient.pendingBedLabel}</div>
                )}
              </div>

              <div>
                <label htmlFor="propose-bed-input" className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] focus:outline-none focus:border-[#8C4327] focus:ring-1 focus:ring-[#8C4327]"
                />
                <datalist id="available-beds-propose-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-1.5">
                  Type any bed number or choose from available beds. Current bed remains active until patient explicitly approves.
                </p>
              </div>

              <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBedChangeModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={proposingBed || !selectedNewBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 max-w-lg w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F]" />
                <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                  Allocate Device to {allocateModalPatient.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Select an available, online NPG device from the registered hardware registry below. Devices must be online to be allocated.
              </p>

              {/* Devices Selection List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {devices.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-xs text-[#6F6256] dark:text-[#9E9689] text-center">
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
                            ? "bg-[#ECE3D4]/40 dark:bg-[#141416]/40 border-[#DCD2C0] dark:border-[#222226] opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-[#ECE3D4] dark:bg-[#141416] border-[#8C4327] dark:border-[#D49D4F] text-[#8C4327] dark:text-[#D49D4F] ring-1 ring-[#8C4327] cursor-pointer"
                            : "bg-[#FAF6F0] dark:bg-[#0D0D0E] border-[#DCD2C0] dark:border-[#222226] hover:border-[#8C4327] dark:hover:border-[#D49D4F] cursor-pointer text-[#28211B] dark:text-[#F2ECE1]"
                        }`}
                      >
                        <div>
                          <div className="font-serif font-semibold flex items-center gap-2">
                            <span>{d.name || d.deviceId}</span>
                            <span className="font-mono text-[11px] text-[#6F6256] dark:text-[#9E9689]">({d.deviceId})</span>
                          </div>
                          <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                            Hardware ID: <span className="font-mono">{d.hardwareId || "N/A"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide ${
                              isOnline
                                ? "bg-[#EBF3ED] text-[#2E6243] border border-[#BCD5C4] dark:bg-[#132418] dark:border-[#204A2E] dark:text-[#4AA86C]"
                                : "bg-[#ECE3D4] text-[#6F6256] border border-[#DCD2C0] dark:bg-[#141416] dark:border-[#222226] dark:text-[#9E9689]"
                            }`}
                          >
                            {isOnline ? "ONLINE" : "OFFLINE"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide ${
                              isAlreadyAssigned
                                ? "bg-[#ECE3D4] text-[#8C4327] border border-[#DCD2C0] dark:bg-[#141416] dark:text-[#D49D4F] dark:border-[#222226]"
                                : isSelectable
                                ? "bg-[#EBF3ED] text-[#2E6243] border border-[#BCD5C4] dark:bg-[#132418] dark:border-[#204A2E] dark:text-[#4AA86C]"
                                : "bg-[#ECE3D4] text-[#6F6256] border border-[#DCD2C0] dark:bg-[#141416] dark:border-[#222226] dark:text-[#9E9689]"
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

            <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAllocateModal}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allocatingDevice || !selectedAllocateDeviceId}
                onClick={handleConfirmAllocateDevice}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition disabled:opacity-50 shadow-xs"
              >
                {allocatingDevice ? "Allocating..." : "Confirm Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SEND CARE LINK REQUEST */}
      {careLinkModalPatient && (
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F]" />
                <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                  Send Care Link Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCareLinkModalPatient(null)}
                className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSendCareLink} className="space-y-4">
              <div className="p-3 rounded-lg bg-[#ECE3D4]/60 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-xs space-y-1 text-[#28211B] dark:text-[#F2ECE1]">
                <div>Patient: <strong className="font-serif text-[#28211B] dark:text-[#F2ECE1]">{careLinkModalPatient.displayName}</strong> ({careLinkModalPatient.patientCode})</div>
                <div>Current Bed: <strong className="text-[#8C4327] dark:text-[#D49D4F] font-mono">{careLinkModalPatient.bedLabel || "None"}</strong></div>
              </div>

              <div>
                <label htmlFor="carelink-bed-number" className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
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
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-[#28211B] dark:text-[#F2ECE1] focus:outline-none focus:border-[#8C4327] focus:ring-1 focus:ring-[#8C4327]"
                />
                <datalist id="available-beds-carelink-list">
                  {availableBeds.map((b) => (
                    <option key={b.bedNumber} value={b.bedNumber}>
                      {b.bedNumber} - AVAILABLE
                    </option>
                  ))}
                </datalist>
                <p className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-1.5">
                  Enter the bed number to assign. Only the patient can approve this care link request at their bedside terminal.
                </p>
              </div>

              <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCareLinkModalPatient(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nurseAssignLoading[careLinkModalPatient.patientCode] || !careLinkBedNumber.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 max-w-sm w-full space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-2.5">
              <h3 className="font-serif font-bold text-sm text-[#28211B] dark:text-[#F2ECE1]">{stepConfirm.stepTitle}</h3>
              <button onClick={() => setStepConfirm(null)} className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#6F6256] dark:text-[#9E9689] leading-relaxed">
              {stepConfirm.stepDescription}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DCD2C0] dark:border-[#222226]">
              <button
                type="button"
                onClick={() => setStepConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeStepConfirmation}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs ${stepConfirm.actionButtonColor}`}
              >
                {stepConfirm.actionButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT DEVICE COMMANDS / GESTURE RULES */}
      {editingDeviceCommands && (
        <div className="fixed inset-0 z-50 bg-[#28211B]/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#DCD2C0] dark:border-[#222226] flex items-center justify-between gap-4 bg-[#F5EFE6]/70 dark:bg-[#141416]/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${
                  editingDeviceCommands.connectivityStatus === "ONLINE"
                    ? "bg-[#ECE3D4] dark:bg-[#1A1A1E] text-[#8C4327] dark:text-[#D49D4F] border-[#DCD2C0] dark:border-[#222226]"
                    : "bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border-[#E8BCBC] dark:border-[#522323]"
                }`}>
                  {editingDeviceCommands.connectivityStatus === "ONLINE" ? (
                    <Sliders className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base sm:text-lg text-[#28211B] dark:text-[#F2ECE1]">
                    {editingDeviceCommands.connectivityStatus === "ONLINE"
                      ? "Configure NPG Commands & Gestures"
                      : "Commands Locked — Device Offline"}
                  </h3>
                  <div className="text-xs text-[#6F6256] dark:text-[#9E9689] flex items-center gap-2 flex-wrap mt-0.5">
                    <span>Gateway: <strong className="font-mono text-[#28211B] dark:text-[#F2ECE1]">{editingDeviceCommands.name || editingDeviceCommands.deviceId}</strong></span>
                    {editingDeviceCommands.hardwareId && (
                      <span className="font-mono text-[11px] text-[#96887B]">HW: {editingDeviceCommands.hardwareId}</span>
                    )}
                    {editingDeviceCommands.currentAssignment?.patient && (
                      <span className="text-[#2E6243] dark:text-[#4AA86C] font-serif font-medium">
                        &bull; Allocated to {editingDeviceCommands.currentAssignment.patient.displayName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDeviceCommands(null)}
                className="p-1.5 rounded-lg text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] hover:bg-[#ECE3D4] dark:hover:bg-[#1A1A1E] transition border border-[#DCD2C0] dark:border-[#222226]"
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
                  <div className="w-14 h-14 rounded-2xl bg-[#FAEEEE] dark:bg-[#2B1414] text-[#9E3232] dark:text-[#D95B5B] border border-[#E8BCBC] dark:border-[#522323] flex items-center justify-center mx-auto shadow-sm">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-lg text-[#28211B] dark:text-[#F2ECE1]">
                      Device Is Offline
                    </h4>
                    <p className="text-xs text-[#6F6256] dark:text-[#9E9689] mt-2 leading-relaxed">
                      Commands cannot be viewed, configured, or edited while the NPG hardware gateway is offline. The device must be powered on and online with active telemetry before rules can be calibrated.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDeviceCommands(null)}
                    className="px-5 py-2 rounded-xl bg-[#8C4327] hover:bg-[#73341C] text-white text-xs font-semibold shadow-xs transition"
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
        <div className="fixed inset-0 z-50 bg-[#28211B]/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] border border-[#DCD2C0] dark:border-[#222226] rounded-xl p-5 sm:p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCD2C0] dark:border-[#222226] pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#8C4327] dark:text-[#D49D4F]" />
                <h3 className="font-serif font-bold text-base text-[#28211B] dark:text-[#F2ECE1]">
                  Allocate Device to Patient
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAllocatingDeviceFromList(null);
                  setSelectedPatientForDevice("");
                }}
                className="text-[#6F6256] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#ECE3D4]/60 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-xs space-y-1">
                <div>Device: <strong className="font-serif text-[#28211B] dark:text-[#F2ECE1]">{allocatingDeviceFromList.name || allocatingDeviceFromList.deviceId}</strong> ({allocatingDeviceFromList.deviceId})</div>
                <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] font-mono">Hardware ID: {allocatingDeviceFromList.hardwareId || "N/A"}</div>
              </div>

              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Select a registered bedside patient to allocate this NPG device to. Strict one-device-to-one-patient policy applies.
              </p>

              {/* Patient Selection List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {patients.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#ECE3D4]/40 dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] text-xs text-[#6F6256] dark:text-[#9E9689] text-center">
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
                            ? "bg-[#ECE3D4]/40 dark:bg-[#141416]/40 border-[#DCD2C0] dark:border-[#222226] opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-[#ECE3D4] dark:bg-[#141416] border-[#8C4327] dark:border-[#D49D4F] text-[#8C4327] dark:text-[#D49D4F] ring-1 ring-[#8C4327] cursor-pointer"
                            : "bg-[#FAF6F0] dark:bg-[#0D0D0E] border-[#DCD2C0] dark:border-[#222226] hover:border-[#8C4327] dark:hover:border-[#D49D4F] cursor-pointer text-[#28211B] dark:text-[#F2ECE1]"
                        }`}
                      >
                        <div>
                          <div className="font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1]">
                            {pt.displayName}
                          </div>
                          <div className="text-[11px] text-[#6F6256] dark:text-[#9E9689] mt-0.5">
                            Code: <span className="font-mono">{pt.patientCode}</span> &bull; Bed: <span className="font-mono">{pt.bedLabel || "Unassigned"}</span>
                          </div>
                        </div>

                        <div>
                          {hasDevice ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#ECE3D4] text-[#8C4327] dark:bg-[#141416] dark:text-[#D49D4F] border border-[#DCD2C0] dark:border-[#222226]">
                              HAS DEVICE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EBF3ED] text-[#2E6243] dark:bg-[#132418] dark:text-[#4AA86C] border border-[#BCD5C4] dark:border-[#204A2E]">
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

            <div className="pt-2 border-t border-[#DCD2C0] dark:border-[#222226] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setAllocatingDeviceFromList(null);
                  setSelectedPatientForDevice("");
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={allocatingPatientToDeviceLoading || !selectedPatientForDevice}
                onClick={handleConfirmAllocatePatientToDevice}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#8C4327] hover:bg-[#73341C] text-white transition disabled:opacity-50 shadow-xs"
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
    </div>
  );
}
