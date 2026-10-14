"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  apiClient,
  DeviceItem,
  PatientItem,
  DeviceConfigItem,
  GestureMappingItem,
  RequestAction,
  CareRequestItem,
  CareRequestStatus,
} from "@/lib/api";
import {
  Cpu,
  UserPlus,
  RefreshCw,
  PlusCircle,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  X,
  Radio,
  Trash2,
  Plus,
  FileText,
  Sparkles,
  Bed,
  Check,
  Bell,
  Play,
  Bluetooth,
} from "@/lib/noIcons";
import BleCommissioningModal from "@/components/BleCommissioningModal";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

const SUPPORTED_ACTIONS: {
  value: RequestAction;
  label: string;
  badgeColor: string;
}[] = [
  {
    value: "YES",
    label: "YES (2 blinks, wait)",
    badgeColor: "bg-[#E8E2D7] text-[#1C140F] border-[#D6C7B7] font-bold",
  },
  {
    value: "WATER",
    label: "WATER (4+ blinks)",
    badgeColor: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7] font-bold",
  },
  {
    value: "NO",
    label: "NO (Squeeze both, once)",
    badgeColor: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C] font-bold",
  },
  {
    value: "CALL_NURSE",
    label: "CALL NURSE (Squeeze left 3x)",
    badgeColor: "bg-[#E5DFD7] text-[#1C140F] border-[#CEBEB0] font-bold",
  },
  {
    value: "EMERGENCY",
    label: "EMERGENCY, LEDs 1–4 flash red",
    badgeColor: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29] font-black",
  },
  {
    value: "NEED_WATER",
    label: "Need Water (Legacy)",
    badgeColor: "bg-[#EED9CD] text-[#7A361E] border-[#D6C7B7] font-bold",
  },
  {
    value: "NEED_ASSISTANCE",
    label: "Need Assistance (Legacy)",
    badgeColor: "bg-[#E8E2D7] text-[#1C140F] border-[#D6C7B7] font-bold",
  },
  {
    value: "PAIN_DISCOMFORT",
    label: "Pain / Discomfort",
    badgeColor: "bg-[#F4DFC8] text-[#8C4318] border-[#DFBA9C] font-bold",
  },
  {
    value: "REPOSITION",
    label: "Reposition",
    badgeColor: "bg-[#E5DFD7] text-[#1C140F] border-[#CEBEB0] font-bold",
  },
];

const PRESET_MAPPINGS: { name: string; mappings: GestureMappingItem[] }[] = [
  {
    name: "Standard Clinical Matrix (5 Predefined Commands)",
    mappings: [
      {
        gestureId: "BLINK_2",
        gestureName: "2 blinks, wait",
        action: "YES",
        instruction: "Blink twice and pause to confirm YES",
      },
      {
        gestureId: "BLINK_4_PLUS",
        gestureName: "4+ blinks",
        action: "WATER",
        instruction: "Blink four or more times rapidly to request water",
      },
      {
        gestureId: "SQUEEZE_BOTH_1",
        gestureName: "Squeeze both hands together, once",
        action: "NO",
        instruction: "Squeeze both hands simultaneously once to indicate NO",
      },
      {
        gestureId: "SQUEEZE_LEFT_3",
        gestureName: "Squeeze left hand 3 times",
        action: "CALL_NURSE",
        instruction: "Squeeze left hand 3 times to call your assigned nurse",
      },
      {
        gestureId: "SQUEEZE_BOTH_3",
        gestureName: "Squeeze both hands together, 3 times",
        action: "EMERGENCY",
        instruction: "Squeeze both hands together 3 times for urgent emergency help",
      },
    ],
  },
  {
    name: "Legacy Eye-Gaze Bedside Care",
    mappings: [
      {
        gestureId: "BLINK_DOUBLE",
        gestureName: "Double Blink",
        action: "WATER",
        instruction: "Blink twice firmly to request water",
      },
      {
        gestureId: "GAZE_LEFT_HOLD",
        gestureName: "Gaze Left (2s)",
        action: "CALL_NURSE",
        instruction: "Look steadily to your left to call nurse",
      },
      {
        gestureId: "BLINK_TRIPLE",
        gestureName: "Triple Blink",
        action: "EMERGENCY",
        instruction: "Blink three rapid times for urgent help",
      },
    ],
  },
];

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"requests" | "devices" | "patients">("devices");

  // Core Data
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [careRequests, setCareRequests] = useState<CareRequestItem[]>([]);
  const [requestFilter, setRequestFilter] = useState<"ALL" | CareRequestStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selected Device Detail State
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [latestConfig, setLatestConfig] = useState<DeviceConfigItem | null>(null);

  // Modals & Action States
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientForm, setPatientForm] = useState({ displayName: "", bedLabel: "" });
  const [assignPatientCode, setAssignPatientCode] = useState("");
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});

  // Gesture Configuration Editor
  const [configMappings, setConfigMappings] = useState<GestureMappingItem[]>([
    {
      gestureId: "BLINK_DOUBLE",
      gestureName: "Double Blink",
      action: "NEED_WATER",
      instruction: "Blink twice firmly to request water",
    },
    {
      gestureId: "GAZE_LEFT_HOLD",
      gestureName: "Gaze Left (2s)",
      action: "NEED_ASSISTANCE",
      instruction: "Look steadily to the left to call nurse",
    },
  ]);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState(false);

  // Backend Health State
  const [backendStatus, setBackendStatus] = useState<"CONNECTED" | "UNAVAILABLE" | "CHECKING">("CHECKING");
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);

  // BLE Commissioning Modal State
  const [showBleModal, setShowBleModal] = useState(false);

  const showNotification = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const checkHealth = useCallback(async () => {
    try {
      const result = await apiClient.checkBackendHealth();
      if (result.isOnline) {
        setBackendStatus("CONNECTED");
        setLatencyMs(result.latencyMs);
      } else {
        setBackendStatus("UNAVAILABLE");
      }
    } catch {
      setBackendStatus("UNAVAILABLE");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, ptRes, reqRes] = await Promise.all([
        apiClient.getDevices(),
        apiClient.getPatients(),
        apiClient.getCareRequests(),
      ]);
      setDevices(devRes.data);
      setPatients(ptRes.data);
      setCareRequests(reqRes.data);
    } catch (err: unknown) {
      showNotification(
        err instanceof Error ? err.message : "Failed to load records from backend",
        true
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    checkHealth();

    // Auto-poll new care requests every 1.5 seconds for instant real-time response
    const interval = setInterval(async () => {
      try {
        const reqRes = await apiClient.getCareRequests();
        setCareRequests(reqRes.data);
      } catch {
        // silent fail on background poll
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchData, checkHealth]);

  const openDeviceDetails = async (dev: DeviceItem) => {
    setSelectedDevice(dev);
    try {
      const latestRes = await apiClient.getLatestDeviceConfig(dev.deviceId);
      setLatestConfig(latestRes.data);
      if (latestRes.data && latestRes.data.mappings.length > 0) {
        setConfigMappings(latestRes.data.mappings);
      }
    } catch {
      showNotification("Failed to fetch device configuration", true);
    }
  };

  // Patient Creation & Assignment
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForm.displayName) return;
    try {
      await apiClient.createPatient({
        displayName: patientForm.displayName,
        bedLabel: patientForm.bedLabel || undefined,
        status: "ACTIVE",
      });
      showNotification("Patient record created successfully.");
      setShowPatientModal(false);
      setPatientForm({ displayName: "", bedLabel: "" });
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to create patient", true);
    }
  };

  const handleAssignDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !assignPatientCode) return;
    try {
      await apiClient.assignDevice(selectedDevice.deviceId, {
        patientCode: assignPatientCode,
        assignedBy: "Bedside Nurse Station",
      });
      showNotification(`Device ${selectedDevice.name} assigned successfully.`);
      const updatedDev = await apiClient.getDevice(selectedDevice.deviceId);
      setSelectedDevice(updatedDev.data);
      setAssignPatientCode("");
      await openDeviceDetails(updatedDev.data);
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to assign device", true);
    }
  };

  const handleUnassignDevice = async () => {
    if (!selectedDevice) return;
    try {
      await apiClient.unassignDevice(selectedDevice.deviceId);
      showNotification(`Device unassigned from patient.`);
      const updatedDev = await apiClient.getDevice(selectedDevice.deviceId);
      setSelectedDevice(updatedDev.data);
      await openDeviceDetails(updatedDev.data);
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to unassign device", true);
    }
  };

  // Gesture Configuration Actions
  const handleAddMappingRow = () => {
    setConfigMappings((prev) => [
      ...prev,
      {
        gestureId: `GESTURE_${prev.length + 1}`,
        gestureName: `Gesture ${prev.length + 1}`,
        action: "NEED_ASSISTANCE",
        instruction: "",
      },
    ]);
  };

  const handleRemoveMappingRow = (index: number) => {
    if (configMappings.length <= 1) {
      showNotification("At least one gesture mapping is required.", true);
      return;
    }
    setConfigMappings((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMappingChange = (
    index: number,
    field: keyof GestureMappingItem,
    value: string
  ) => {
    setConfigMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveConfiguration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    if (configMappings.length === 0) {
      showNotification("Configuration must contain at least one gesture.", true);
      return;
    }

    setIsSubmittingConfig(true);
    try {
      const sanitizedMappings: GestureMappingItem[] = configMappings.map((m) => {
        const id = m.gestureId.trim().toUpperCase();
        return {
          gestureId: id,
          gesture: id,
          gestureName: m.gestureName.trim(),
          action: m.action,
          instruction: m.instruction?.trim() ? m.instruction.trim() : undefined,
        };
      });

      const res = await apiClient.createDeviceConfig(selectedDevice.deviceId, {
        mappings: sanitizedMappings,
      });

      showNotification(`Configuration v${res.data.version} saved successfully.`);

      const latestRes = await apiClient.getLatestDeviceConfig(selectedDevice.deviceId);
      setLatestConfig(latestRes.data);
    } catch (err: unknown) {
      showNotification(
        err instanceof Error ? err.message : "Failed to save configuration",
        true
      );
    } finally {
      setIsSubmittingConfig(false);
    }
  };

  // Care Request Lifecycle Handlers
  const handleAcknowledge = async (requestId: string) => {
    setActionLoadingMap((prev) => ({ ...prev, [requestId]: true }));
    try {
      await apiClient.acknowledgeCareRequest(requestId);
      showNotification("Request acknowledged.");
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to acknowledge request", true);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleStartHandling = async (requestId: string) => {
    setActionLoadingMap((prev) => ({ ...prev, [requestId]: true }));
    try {
      await apiClient.startHandlingCareRequest(requestId);
      showNotification("Care request is now In Progress.");
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to update request", true);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleResolve = async (requestId: string) => {
    setActionLoadingMap((prev) => ({ ...prev, [requestId]: true }));
    try {
      await apiClient.resolveCareRequest(requestId);
      showNotification("Care request resolved.");
      fetchData();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to resolve request", true);
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const filteredRequests = careRequests.filter((r) => {
    if (requestFilter === "ALL") return true;
    return r.status === requestFilter;
  });

  const activeRequestsCount = careRequests.filter(
    (r) => r.status === "NEW" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
  ).length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center text-[#75665D] font-serif text-base tracking-wide">
        Authenticating clinical session...
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#30251F] flex flex-col font-sans selection:bg-[#EED9CD] selection:text-[#30251F]">
      {/* Top Editorial Masthead Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#FFFCF7]/95 backdrop-blur-md border-b border-[#E7DFD4] shadow-[0_1px_4px_rgba(48,37,31,0.04)]">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#30251F] text-[#FFFCF7] flex items-center justify-center font-serif font-bold text-base shadow-sm border border-[#30251F]">
              NV
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-serif text-xl font-normal text-[#30251F] tracking-tight">
                  NetraVaani
                </h1>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  Bedside Registry
                </span>
              </div>
              <span className="text-xs text-[#75665D] font-serif italic">
                Assistive Gaze &amp; Gesture Clinical Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Backend Connectivity Status Indicator */}
            <div className="hidden sm:flex items-center gap-2">
              {backendStatus === "CONNECTED" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#FFFCF7] text-[#30251F] border border-[#E7DFD4]">
                  <span className="w-2 h-2 rounded-full bg-[#C56845]" />
                  <span>Online</span>
                  {latencyMs !== undefined && (
                    <span className="text-[10px] text-[#75665D]">({latencyMs}ms)</span>
                  )}
                </div>
              ) : backendStatus === "UNAVAILABLE" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#EED9CD]/60 text-[#7A361E] border border-[#C56845]/40">
                  <span className="w-2 h-2 rounded-full bg-[#C56845]" />
                  <span>Offline</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#FFFCF7] text-[#75665D] border border-[#E7DFD4]">
                  <RefreshCw className="w-3 h-3 animate-spin text-[#C56845]" />
                  <span>Connecting...</span>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-[#F5F0E8] p-1 rounded-xl border border-[#E7DFD4] text-xs font-medium">
              <button
                onClick={() => setActiveTab("devices")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === "devices"
                    ? "bg-[#FFFCF7] text-[#30251F] shadow-sm border border-[#E7DFD4] font-semibold"
                    : "text-[#75665D] hover:text-[#30251F]"
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-[#C56845]" />
                Devices ({devices.length})
              </button>

              <button
                onClick={() => setActiveTab("requests")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition relative ${
                  activeTab === "requests"
                    ? "bg-[#FFFCF7] text-[#30251F] shadow-sm border border-[#E7DFD4] font-semibold"
                    : "text-[#75665D] hover:text-[#30251F]"
                }`}
              >
                <Bell className="w-3.5 h-3.5 text-[#C56845]" />
                Care Requests
                {activeRequestsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#C56845] text-[#FFFCF7]">
                    {activeRequestsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("patients")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === "patients"
                    ? "bg-[#FFFCF7] text-[#30251F] shadow-sm border border-[#E7DFD4] font-semibold"
                    : "text-[#75665D] hover:text-[#30251F]"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 text-[#C56845]" />
                Patients ({patients.length})
              </button>
            </div>

            {/* Link to Dedicated Nurse Station */}
            <Link
              href="/nurse"
              className="hidden lg:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[#7A361E] bg-[#EED9CD]/60 border border-[#D6C7B7] hover:bg-[#EED9CD] transition shadow-xs"
            >
              <span>Nurse Station &rarr;</span>
            </Link>

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#E7DFD4]">
              <span className="text-xs font-mono text-[#30251F] bg-[#FFFCF7] border border-[#E7DFD4] px-2.5 py-1 rounded-lg">
                {user.name} ({user.role})
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-[#75665D] hover:text-[#C56845] px-2 py-1 rounded-lg hover:bg-[#EED9CD]/40 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notifications Banner */}
      <div className="max-w-7xl mx-auto px-6 pt-4 w-full">
        {errorMsg && (
          <div className="p-3 bg-[#EED9CD]/60 border border-[#C56845]/50 text-[#30251F] rounded-xl text-xs font-medium flex items-center justify-between mb-3 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#C56845] shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-[#75665D] hover:text-[#30251F]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-[#FFFCF7] border border-[#D6C7B7] text-[#30251F] rounded-xl text-xs font-medium flex items-center justify-between mb-3 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#C56845] shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-[#75665D] hover:text-[#30251F]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full">
        {/* ======================================================== */}
        {/* TAB 1: DEVICE REGISTRY */}
        {/* ======================================================== */}
        {activeTab === "devices" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Device List Section */}
            <section className={selectedDevice ? "lg:col-span-6 space-y-4" : "lg:col-span-12 space-y-4"}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-normal text-[#30251F] flex items-center gap-2">
                    Registered Devices ({devices.length})
                  </h2>
                  <p className="text-xs text-[#75665D] font-serif italic mt-0.5">
                    Connect an NPG Lite device over local Wi-Fi to configure bedside gaze triggers.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBleModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7] shadow-sm transition"
                    title="Commission NPG Lite device via Web Bluetooth and Wi-Fi"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>Connect a Device</span>
                  </button>
                  <button
                    type="button"
                    onClick={fetchData}
                    className="p-2 rounded-xl border border-[#E7DFD4] bg-[#FFFCF7] text-[#75665D] hover:bg-[#F5F0E8] transition shadow-xs"
                    title="Refresh devices"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-[#75665D] text-sm bg-[#FFFCF7] rounded-2xl border border-[#E7DFD4]">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#C56845] mx-auto mb-2" />
                  Loading registered devices...
                </div>
              ) : devices.length === 0 ? (
                <div className="p-12 rounded-2xl bg-[#FFFCF7] border border-[#E7DFD4] text-center space-y-3 shadow-xs">
                  <Bluetooth className="w-10 h-10 text-[#C56845]/50 mx-auto" />
                  <p className="text-[#30251F] text-base font-serif">No Devices Connected Yet</p>
                  <p className="text-xs text-[#75665D] max-w-sm mx-auto font-serif italic">
                    Click &apos;Connect a Device&apos; to commission your NPG Lite device over Web Bluetooth and provision it to bedside Wi-Fi.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowBleModal(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] shadow-xs transition"
                    >
                      <Bluetooth className="w-4 h-4" />
                      Connect a Device
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {devices.map((dev) => {
                    const isSelected = selectedDevice?.deviceId === dev.deviceId;
                    const isAssigned = dev.status === "ASSIGNED";

                    return (
                      <div
                        key={dev.deviceId}
                        onClick={() => openDeviceDetails(dev)}
                        className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? "bg-[#FFFCF7] border-[#C56845] ring-1 ring-[#C56845] shadow-sm"
                            : "bg-[#FFFCF7] border-[#E7DFD4] hover:border-[#D6C7B7] hover:shadow-xs"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-serif font-bold text-base text-[#30251F]">{dev.name}</span>
                            <span className="text-xs font-mono text-[#75665D] bg-[#F5F0E8] px-2 py-0.5 rounded border border-[#E7DFD4]">
                              {dev.deviceId}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#75665D]">
                            {dev.connectivityStatus === "ONLINE" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#EED9CD]/60 text-[#7A361E] border border-[#D6C7B7]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C56845]" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#A2948B]" />
                                Offline
                              </span>
                            )}

                            {dev.hardwareId && (
                              <span className="text-[10px] font-mono text-[#75665D]">
                                MAC: {dev.hardwareId}
                              </span>
                            )}

                            <span>&bull;</span>
                            <span className="text-[11px] font-mono text-[#75665D]">
                              Config: v{dev.appliedConfigVersion || 1}
                            </span>
                          </div>
                        </div>

                        <div className="text-right space-y-1">
                          <div>
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-mono uppercase tracking-wider ${
                                isAssigned
                                  ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
                                  : "bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]"
                              }`}
                            >
                              {dev.status}
                            </span>
                          </div>
                          {dev.currentAssignment?.patient && (
                            <div className="text-xs text-[#30251F] font-serif flex items-center justify-end gap-1">
                              <Bed className="w-3.5 h-3.5 text-[#75665D]" />
                              <span>{dev.currentAssignment.patient.displayName}</span>
                              {dev.currentAssignment.patient.bedLabel && (
                                <span className="text-[#75665D] text-[11px] font-mono">
                                  ({dev.currentAssignment.patient.bedLabel})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Selected Device Details & Configuration Column */}
            {selectedDevice && (
              <aside className="lg:col-span-6 space-y-6">
                {/* Device Header Card */}
                <div className="bg-[#FFFCF7] border border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#EED9CD]/60 text-[#C56845] border border-[#D6C7B7]">
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-serif font-normal text-[#30251F] leading-tight">
                          {selectedDevice.name}
                        </h3>
                        <div className="flex items-center gap-2 text-xs font-mono text-[#75665D] mt-0.5">
                          <span>{selectedDevice.deviceId}</span>
                          <span>&bull;</span>
                          <span className="text-[#30251F] font-sans font-semibold">
                            {selectedDevice.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedDevice(null)}
                      className="text-[#75665D] hover:text-[#30251F] p-1.5 rounded-lg hover:bg-[#F5F0E8] transition"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Device Telemetry Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-[#F5F0E8] p-2.5 rounded-xl border border-[#E7DFD4]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block">Status</span>
                      <div className="mt-0.5">
                        {selectedDevice.connectivityStatus === "ONLINE" ? (
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-[#7A361E]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C56845]" />
                            ONLINE
                          </span>
                        ) : (
                          <span className="font-mono text-[#75665D]">OFFLINE</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#F5F0E8] p-2.5 rounded-xl border border-[#E7DFD4]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block">MAC Address</span>
                      <span className="font-mono text-xs font-semibold text-[#30251F] block truncate">
                        {selectedDevice.hardwareId || "None"}
                      </span>
                    </div>

                    <div className="bg-[#F5F0E8] p-2.5 rounded-xl border border-[#E7DFD4]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block">Last Seen</span>
                      <span className="text-xs font-mono text-[#30251F] block truncate">
                        {selectedDevice.lastSeenAt
                          ? new Date(selectedDevice.lastSeenAt).toLocaleTimeString()
                          : "Never"}
                      </span>
                    </div>

                    <div className="bg-[#F5F0E8] p-2.5 rounded-xl border border-[#E7DFD4]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block">Firmware</span>
                      <span className="font-mono text-xs font-semibold text-[#30251F] block">
                        {selectedDevice.firmwareVersion || "v1.2.0"}
                      </span>
                    </div>
                  </div>

                  {/* Bedside Patient Assignment Box */}
                  <div className="pt-2 border-t border-[#E7DFD4]">
                    <span className="text-xs font-serif font-bold text-[#30251F] block mb-2">
                      Bedside Patient Assignment
                    </span>
                    {selectedDevice.currentAssignment ? (
                      <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] flex items-center justify-between">
                        <div>
                          <p className="text-sm font-serif font-bold text-[#30251F]">
                            {selectedDevice.currentAssignment.patient.displayName}
                          </p>
                          <p className="text-xs text-[#75665D] font-mono mt-0.5">
                            Code: {selectedDevice.currentAssignment.patient.patientCode} &bull; Bed:{" "}
                            {selectedDevice.currentAssignment.patient.bedLabel || "General"}
                          </p>
                        </div>
                        <button
                          onClick={handleUnassignDevice}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FFFCF7] text-[#7A361E] border border-[#D6C7B7] hover:bg-[#EED9CD]/40 transition"
                        >
                          Unassign
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleAssignDevice} className="flex gap-2">
                        <select
                          value={assignPatientCode}
                          onChange={(e) => setAssignPatientCode(e.target.value)}
                          className="flex-1 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl px-3 py-2 text-xs text-[#30251F] focus:outline-none focus:border-[#C56845]"
                          required
                        >
                          <option value="">Select an active patient to assign...</option>
                          {patients
                            .filter((p) => p.status === "ACTIVE" && !p.currentAssignment)
                            .map((p) => (
                              <option key={p.patientCode} value={p.patientCode}>
                                {p.displayName} ({p.patientCode}) &bull; Bed: {p.bedLabel || "N/A"}
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          disabled={!assignPatientCode}
                          className="px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] hover:bg-[#B05534] text-[#FFFCF7] transition disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Gesture Configuration Card */}
                <div className="bg-[#FFFCF7] border border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#EED9CD]/60 text-[#C56845] border border-[#D6C7B7]">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-base font-serif font-normal text-[#30251F]">Gesture Configuration</h4>
                        <p className="text-xs text-[#75665D] font-serif italic">
                          Map patient eye gaze &amp; blink triggers to clinical requests
                        </p>
                      </div>
                    </div>

                    {latestConfig && (
                      <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                        v{latestConfig.version} Active
                      </span>
                    )}
                  </div>

                  {selectedDevice.status === "ASSIGNED" ? (
                    <form onSubmit={handleSaveConfiguration} className="space-y-4">
                      {/* Presets Bar */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#75665D] flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#C56845]" /> Presets:
                        </span>
                        {PRESET_MAPPINGS.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              setConfigMappings(p.mappings);
                              showNotification(`Applied preset: ${p.name}`);
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F5F0E8] hover:bg-[#EED9CD] border border-[#E7DFD4] text-[#30251F] transition"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>

                      {/* Mapping Rows */}
                      <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                        {configMappings.map((mapping, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono uppercase tracking-wider text-[#75665D]">
                                Trigger #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMappingRow(idx)}
                                disabled={configMappings.length <= 1}
                                className="text-[#75665D] hover:text-[#C56845] disabled:opacity-30 transition p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block mb-0.5">
                                  Gesture Identifier
                                </label>
                                <input
                                  type="text"
                                  value={mapping.gestureId}
                                  onChange={(e) =>
                                    handleMappingChange(idx, "gestureId", e.target.value.toUpperCase())
                                  }
                                  className="w-full bg-[#FFFCF7] border border-[#E7DFD4] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#30251F] focus:outline-none focus:border-[#C56845]"
                                  required
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block mb-0.5">
                                  Gesture Name
                                </label>
                                <input
                                  type="text"
                                  value={mapping.gestureName}
                                  onChange={(e) =>
                                    handleMappingChange(idx, "gestureName", e.target.value)
                                  }
                                  className="w-full bg-[#FFFCF7] border border-[#E7DFD4] rounded-lg px-2.5 py-1.5 text-xs text-[#30251F] focus:outline-none focus:border-[#C56845]"
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block mb-0.5">
                                  Care Request Action
                                </label>
                                <select
                                  value={mapping.action}
                                  onChange={(e) =>
                                    handleMappingChange(idx, "action", e.target.value as RequestAction)
                                  }
                                  className="w-full bg-[#FFFCF7] border border-[#E7DFD4] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#30251F] focus:outline-none focus:border-[#C56845]"
                                  required
                                >
                                  {SUPPORTED_ACTIONS.map((act) => (
                                    <option key={act.value} value={act.value}>
                                      {act.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] font-mono uppercase tracking-wider text-[#75665D] block mb-0.5">
                                  Bedside Instruction
                                </label>
                                <input
                                  type="text"
                                  value={mapping.instruction || ""}
                                  onChange={(e) =>
                                    handleMappingChange(idx, "instruction", e.target.value)
                                  }
                                  placeholder="e.g. Blink twice firmly when thirsty"
                                  className="w-full bg-[#FFFCF7] border border-[#E7DFD4] rounded-lg px-2.5 py-1.5 text-xs text-[#30251F] focus:outline-none focus:border-[#C56845]"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={handleAddMappingRow}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#C56845] hover:underline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Gesture
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingConfig}
                          className="px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isSubmittingConfig ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Save Configuration
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="p-6 bg-[#F5F0E8] rounded-xl border border-[#E7DFD4] text-center space-y-1">
                      <p className="text-xs font-serif font-bold text-[#30251F]">Device Not Assigned</p>
                      <p className="text-xs text-[#75665D] font-serif italic">
                        Assign this device to an active patient bed to customize gesture mappings.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bedside Patient Instructions Card */}
                {latestConfig && latestConfig.mappings.length > 0 && (
                  <div className="bg-[#FFFCF7] border border-[#E7DFD4] p-5 rounded-2xl shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-[#E7DFD4] pb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#C56845]" />
                        <h4 className="text-xs font-mono font-medium text-[#75665D] uppercase tracking-wider">
                          Bedside Instructions Guide
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono text-[#75665D]">
                        v{latestConfig.version}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {latestConfig.mappings.map((m, idx) => {
                        const actionInfo = SUPPORTED_ACTIONS.find((a) => a.value === m.action);
                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-serif font-bold text-[#30251F]">{m.gestureName}</span>
                              {m.instruction && (
                                <p className="text-[11px] text-[#75665D] font-serif italic">
                                  &ldquo;{m.instruction}&rdquo;
                                </p>
                              )}
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${
                                actionInfo?.badgeColor || "bg-[#F5F0E8] text-[#30251F]"
                              }`}
                            >
                              {actionInfo?.label || m.action}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: CARE REQUESTS (NURSE DASHBOARD) */}
        {/* ======================================================== */}
        {activeTab === "requests" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-serif font-normal text-[#30251F] flex items-center gap-2">
                  Bedside Care Requests ({filteredRequests.length})
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-[#75665D] font-serif italic">
                    Live requests received from bedside devices.
                  </p>
                  <Link
                    href="/nurse"
                    className="text-xs font-medium text-[#C56845] hover:underline"
                  >
                    Dedicated Nurse Station &rarr;
                  </Link>
                </div>
              </div>

              {/* Status Filters */}
              <div className="flex flex-wrap items-center gap-1.5 bg-[#FFFCF7] p-1 rounded-xl border border-[#E7DFD4] text-xs">
                {(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setRequestFilter(st)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      requestFilter === st
                        ? "bg-[#30251F] text-[#FFFCF7] shadow-xs"
                        : "text-[#75665D] hover:text-[#30251F]"
                    }`}
                  >
                    {st === "ALL" ? "All" : st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-16 text-center text-[#75665D] text-sm bg-[#FFFCF7] rounded-2xl border border-[#E7DFD4]">
                <RefreshCw className="w-6 h-6 animate-spin text-[#C56845] mx-auto mb-2" />
                Loading care requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-16 rounded-2xl bg-[#FFFCF7] border border-[#E7DFD4] text-center space-y-2 shadow-xs">
                <Bell className="w-10 h-10 text-[#A2948B] mx-auto" />
                <p className="text-[#30251F] text-base font-serif">No Care Requests Found</p>
                <p className="text-xs text-[#75665D] max-w-sm mx-auto font-serif italic">
                  {requestFilter === "ALL"
                    ? "No requests have been sent by bedside devices yet."
                    : `No requests with status ${requestFilter}.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRequests.map((req) => {
                  const actionInfo = SUPPORTED_ACTIONS.find((a) => a.value === req.action);
                  const isBusy = actionLoadingMap[req._id] || false;

                  return (
                    <div
                      key={req._id}
                      className={`bg-[#FFFCF7] border rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between transition ${
                        req.status === "NEW"
                          ? "border-[#C56845] ring-1 ring-[#C56845]/50 bg-[#EED9CD]/20"
                          : req.status === "IN_PROGRESS"
                          ? "border-[#DFBA9C]"
                          : req.status === "ACKNOWLEDGED"
                          ? "border-[#D6C7B7]"
                          : "border-[#E7DFD4] opacity-80"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-mono border ${
                              actionInfo?.badgeColor || "bg-[#F5F0E8] text-[#30251F]"
                            }`}
                          >
                            {actionInfo?.label || req.action}
                          </span>

                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                              req.status === "NEW"
                                ? "bg-[#C56845] text-[#FFFCF7]"
                                : req.status === "ACKNOWLEDGED"
                                ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
                                : req.status === "IN_PROGRESS"
                                ? "bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]"
                                : "bg-[#E8E2D7] text-[#30251F] border border-[#D6C7B7]"
                            }`}
                          >
                            {req.status.replace("_", " ")}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-serif font-bold text-lg text-[#30251F]">
                            {req.patient?.displayName || "Bedside Patient"}
                          </h3>
                          <div className="text-xs text-[#75665D] font-mono flex items-center gap-2 mt-0.5">
                            <span>Bed: {req.patient?.bedLabel || "ICU"}</span>
                            <span>&bull;</span>
                            <span>{req.patient?.patientCode}</span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs space-y-1">
                          <div className="flex items-center justify-between text-[#75665D]">
                            <span>Triggered Gesture:</span>
                            <strong className="text-[#30251F] font-mono text-[11px]">
                              {req.gestureId}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between text-[#75665D]">
                            <span>Time:</span>
                            <span className="text-[#75665D] font-mono text-[11px]">
                              {new Date(req.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Transition Buttons */}
                      <div className="pt-2 border-t border-[#E7DFD4]">
                        {req.status === "NEW" && (
                          <button
                            onClick={() => handleAcknowledge(req._id)}
                            disabled={isBusy}
                            className="w-full py-2 rounded-xl text-xs font-medium bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Acknowledge Request
                          </button>
                        )}

                        {req.status === "ACKNOWLEDGED" && (
                          <button
                            onClick={() => handleStartHandling(req._id)}
                            disabled={isBusy}
                            className="w-full py-2 rounded-xl text-xs font-medium bg-[#EED9CD] text-[#7A361E] hover:bg-[#DFBA9C] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 border border-[#D6C7B7]"
                          >
                            {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-[#7A361E]" />}
                            Start Handling (In Progress)
                          </button>
                        )}

                        {req.status === "IN_PROGRESS" && (
                          <button
                            onClick={() => handleResolve(req._id)}
                            disabled={isBusy}
                            className="w-full py-2 rounded-xl text-xs font-medium bg-[#30251F] text-[#FFFCF7] hover:bg-[#45362E] transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Mark as Resolved
                          </button>
                        )}

                        {req.status === "RESOLVED" && (
                          <div className="py-1 text-center text-xs font-serif font-bold text-[#75665D] flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-[#C56845]" />
                            Request Resolved
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ======================================================== */}
        {/* TAB 3: PATIENTS LIST */}
        {/* ======================================================== */}
        {activeTab === "patients" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-serif font-normal text-[#30251F] flex items-center gap-2">
                  Patients List ({patients.length})
                </h2>
                <p className="text-xs text-[#75665D] font-serif italic">
                  Registered patient profiles and bedside assignments.
                </p>
              </div>
              <button
                onClick={() => setShowPatientModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] shadow-xs transition"
              >
                <PlusCircle className="w-4 h-4" />
                New Patient
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-[#75665D] text-sm bg-[#FFFCF7] rounded-2xl border border-[#E7DFD4]">
                <RefreshCw className="w-5 h-5 animate-spin text-[#C56845] mx-auto mb-2" />
                Loading patients...
              </div>
            ) : patients.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#FFFCF7] border border-[#E7DFD4] text-center space-y-2 shadow-xs">
                <p className="text-[#30251F] text-base font-serif">No patients registered yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {patients.map((pt) => {
                  const na = pt.nurseAssignment;
                  const isApproved = na?.status === "APPROVED";
                  const isPending = na?.status === "PENDING";
                  const hasDevice = Boolean(pt.currentAssignment?.device);

                  return (
                    <div
                      key={pt.patientCode}
                      className="p-5 rounded-2xl bg-[#FFFCF7] border border-[#E7DFD4] shadow-xs flex flex-col justify-between space-y-3.5 hover:shadow-sm transition"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-serif font-black text-lg text-[#1C140F] block">
                              {pt.displayName}
                            </span>
                            <span className="text-xs font-mono font-bold text-[#75665D]">
                              Code: {pt.patientCode} &bull; Bed: {pt.bedLabel || "General"}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]">
                            {pt.status}
                          </span>
                        </div>

                        {/* Strict 1-to-1 Device Allocation Indicator */}
                        <div className="p-2.5 rounded-xl bg-[#F5F0E8] border border-[#E7DFD4] text-xs space-y-1">
                          <span className="text-[10px] font-mono font-bold uppercase text-[#75665D] block">
                            Bedside Device (1-to-1 Allocation):
                          </span>
                          {hasDevice ? (
                            <div className="font-bold text-[#1C140F] flex items-center justify-between">
                              <span>{pt.currentAssignment?.device.name}</span>
                              <span className="font-mono text-[11px] text-[#7A361E]">
                                {pt.currentAssignment?.device.deviceId}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[#75665D] font-medium italic text-[11px]">
                              No device allocated (Strict 1-to-1 invariant)
                            </div>
                          )}
                        </div>

                        {/* Nurse Bedside Authorization Status */}
                        <div className="text-xs space-y-1">
                          <span className="text-[10px] font-mono font-bold uppercase text-[#75665D] block">
                            Nurse Care Assignment:
                          </span>
                          {isApproved ? (
                            <div className="p-2 rounded-lg bg-[#FFFCF7] border border-[#D6C7B7] text-[#1C140F]">
                              <span className="font-bold text-[#7A361E]">
                                Assigned: {na?.nurseName}
                              </span>
                              <span className="block text-[10px] font-mono text-[#75665D]">
                                Approved by Patient
                              </span>
                            </div>
                          ) : isPending ? (
                            <div className="p-2 rounded-lg bg-[#EED9CD]/60 border border-[#D6C7B7] text-[#7A361E]">
                              <span className="font-bold">
                                Awaiting Patient Approval
                              </span>
                              <span className="block text-[10px] font-mono text-[#30251F]">
                                Requested for {na?.nurseName}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[#75665D] text-[11px] font-medium italic">
                              Unassigned &bull; Patient must approve request
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Link to Patient Portal */}
                      <div className="pt-2 border-t border-[#E7DFD4] flex items-center justify-between">
                        <Link
                          href="/patient"
                          target="_blank"
                          className="text-xs font-bold text-[#C56845] hover:text-[#B05534] inline-flex items-center gap-1"
                        >
                          Bedside Patient Screen &rarr;
                        </Link>
                        <Link
                          href="/nurse"
                          className="text-xs font-bold text-[#75665D] hover:text-[#1C140F]"
                        >
                          Nurse Station
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* ======================================================== */}
      {/* NEW PATIENT MODAL */}
      {/* ======================================================== */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 bg-[#30251F]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFCF7] border border-[#E7DFD4] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-[#30251F] flex items-center gap-2">
                Register New Patient
              </h3>
              <button
                onClick={() => setShowPatientModal(false)}
                className="text-[#75665D] hover:text-[#30251F]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-[#75665D] block mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Eleanor Vance"
                  value={patientForm.displayName}
                  onChange={(e) => setPatientForm({ ...patientForm, displayName: e.target.value })}
                  className="w-full bg-[#F5F0E8] border border-[#E7DFD4] rounded-xl px-3 py-2 text-xs text-[#30251F] focus:outline-none focus:border-[#C56845]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-[#75665D] block mb-1">
                  Bed Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ICU-Bed-04"
                  value={patientForm.bedLabel}
                  onChange={(e) => setPatientForm({ ...patientForm, bedLabel: e.target.value })}
                  className="w-full bg-[#F5F0E8] border border-[#E7DFD4] rounded-xl px-3 py-2 text-xs text-[#30251F] focus:outline-none focus:border-[#C56845]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPatientModal(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#75665D] hover:text-[#30251F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#C56845] text-[#FFFCF7] hover:bg-[#B05534] transition shadow-xs"
                >
                  Create Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* NPG LITE BLE COMMISSIONING & PROVISIONING MODAL */}
      {/* ======================================================== */}
      <BleCommissioningModal
        isOpen={showBleModal}
        onClose={() => setShowBleModal(false)}
        onDeviceCommissioned={async (device) => {
          await fetchData();
          openDeviceDetails(device);
        }}
      />

      {/* Editorial Footer */}
      <footer className="border-t border-[#E7DFD4] bg-[#FFFCF7] py-5 text-center text-xs text-[#75665D] mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-serif italic">NetraVaani &bull; Assistive HealthTech Journal</span>
          <span className="font-mono text-[11px]">ESP32 Wi-Fi Communication Active</span>
        </div>
      </footer>
    </div>
  );
}
