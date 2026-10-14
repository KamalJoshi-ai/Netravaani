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
  PlusCircle,
  Trash2,
  Plus,
  FileText,
  Sparkles,
  Bed,
  Check,
  Bluetooth,
} from "@/lib/noIcons";
import BleCommissioningModal from "@/components/BleCommissioningModal";
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
    badgeColor: "bg-[#C56845] text-[#FFFCF7] border-[#A84A29] font-bold",
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
    return <SessionLoader label="Authenticating clinical session..." />;
  }

  if (!user) {
    return <LoginForm />;
  }

  const onlineDevices = devices.filter((d) => d.connectivityStatus === "ONLINE").length;
  const assignedDevices = devices.filter((d) => d.status === "ASSIGNED").length;

  return (
    <div className="relative min-h-screen text-[#30251F] flex flex-col font-sans selection:bg-[#EED9CD] selection:text-[#30251F]">
      <AmbientBackdrop />

      {/* ================= Header ================= */}
      <header className="nv-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandMark size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="font-semibold text-xl text-[#30251F] tracking-tight">NetraVaani</h1>
                <span className="hidden md:inline nv-chip text-[10px] font-medium uppercase tracking-[0.08em] px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                  Bedside Registry
                </span>
              </div>
              <span className="hidden sm:block text-xs text-[#75665D] truncate">
                Assistive Gaze &amp; Gesture Clinical Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex">
              <BackendStatusPill status={backendStatus} latencyMs={latencyMs} />
            </div>

            <Link
              href="/nurse"
              className="nv-btn-soft hidden lg:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[#7A361E]"
            >
              Nurse Station &rarr;
            </Link>

            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#E7DFD4]">
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
          </div>
        </div>
      </header>

      <Toast
        message={errorMsg || successMsg}
        isError={Boolean(errorMsg)}
        onClose={() => {
          setErrorMsg(null);
          setSuccessMsg(null);
        }}
      />

      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        {/* ================= Hero command band ================= */}
        <Reveal>
          <section className="nv-espresso relative overflow-hidden rounded-3xl">
            <div className="pointer-events-none absolute -right-16 -top-10 h-[320px] w-[420px] opacity-90 hidden md:block">
              <IrisScene tone="dark" className="h-full w-full" />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,252,247,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,252,247,.6) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
                maskImage: "linear-gradient(90deg, black, transparent 70%)",
                WebkitMaskImage: "linear-gradient(90deg, black, transparent 70%)",
              }}
            />
            <div className="relative p-6 sm:p-8">
              <span className="font-medium text-[10px] uppercase tracking-[0.08em] text-[#EED9CD]/70">
                Control Room &bull; {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </span>
              <h2 className="mt-2 font-semibold text-3xl sm:text-4xl tracking-tight text-[#FFFCF7] max-w-xl">
                Bedside network overview
              </h2>
              <p className="mt-1.5 text-sm text-[#EED9CD]/70 max-w-md">
                Devices, patients and live care requests in one place.
              </p>

              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl [perspective:1000px]">
                {[
                  { k: "Devices", v: devices.length, sub: `${onlineDevices} online` },
                  { k: "Assigned", v: assignedDevices, sub: "bed-linked" },
                  { k: "Open Requests", v: activeRequestsCount, sub: "awaiting care", hot: activeRequestsCount > 0 },
                  { k: "Patients", v: patients.length, sub: "registered" },
                ].map((m, i) => (
                  <motion.div
                    key={m.k}
                    initial={{ opacity: 0, rotateX: -30, y: 12 }}
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.07, duration: 0.6, ease: EASE_OUT }}
                    className={`rounded-2xl border px-4 py-3 backdrop-blur-sm ${
 m.hot
 ? "border-[#C56845]/60 bg-[#C56845]/15 shadow-[0_0_30px_-8px_rgba(197,104,69,.7)]"
 : "border-[#FFFCF7]/10 bg-[#FFFCF7]/[0.04]"
 }`}
                  >
                    <span className="font-medium text-[10px] uppercase tracking-[0.08em] text-[#EED9CD]/60 flex items-center gap-1.5">
                      {m.hot && <span className="nv-live-dot !w-1.5 !h-1.5" />}
                      {m.k}
                    </span>
                    <AnimatedNumber value={m.v} className="block font-semibold tracking-tight text-3xl text-[#FFFCF7] mt-0.5" />
                    <span className="text-[11px] text-[#EED9CD]/55">{m.sub}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ================= Tabs ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Segmented
            layoutId="registry-tab"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { value: "devices", label: <>Devices <Count n={devices.length} /></> },
              {
                value: "requests",
                label: (
                  <>
                    Care Requests
                    {activeRequestsCount > 0 && <Count n={activeRequestsCount} hot />}
                  </>
                ),
              },
              { value: "patients", label: <>Patients <Count n={patients.length} /></> },
            ]}
          />
          <div className="md:hidden">
            <BackendStatusPill status={backendStatus} latencyMs={latencyMs} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ======================================================== */}
          {/* TAB 1: DEVICE REGISTRY */}
          {/* ======================================================== */}
          {activeTab === "devices" && (
            <motion.div key="devices" {...tabMotion} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              <motion.section layout className={selectedDevice ? "lg:col-span-6 space-y-4" : "lg:col-span-12 space-y-4"}>
                <SectionHeading
                  title={`Registered Devices (${devices.length})`}
                  subtitle="Connect an NPG Lite device over local Wi-Fi to configure bedside gaze triggers."
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => setShowBleModal(true)}
                        className="nv-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
                        title="Commission NPG Lite device via Web Bluetooth and Wi-Fi"
                      >
                        <Bluetooth className="w-4 h-4" />
                        <span>Connect a Device</span>
                      </button>
                      <RefreshButton spinning={loading} onClick={fetchData} title="Refresh devices" />
                    </>
                  }
                />

                {loading ? (
                  <SkeletonList rows={3} />
                ) : devices.length === 0 ? (
                  <EmptyState
                    title="No Devices Connected Yet"
                    body="Click 'Connect a Device' to commission your NPG Lite device over Web Bluetooth and provision it to bedside Wi-Fi."
                    action={
                      <button
                        type="button"
                        onClick={() => setShowBleModal(true)}
                        className="nv-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium"
                      >
                        <Bluetooth className="w-4 h-4" />
                        Connect a Device
                      </button>
                    }
                  />
                ) : (
                  <motion.div
                    variants={staggerParent}
                    initial="hidden"
                    animate="show"
                    className={`grid gap-3 [perspective:1400px] ${selectedDevice ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}
                  >
                    {devices.map((dev) => {
                      const isSelected = selectedDevice?.deviceId === dev.deviceId;
                      const isAssigned = dev.status === "ASSIGNED";
                      const online = dev.connectivityStatus === "ONLINE";

                      return (
                        <motion.div key={dev.deviceId} variants={staggerChild} layout>
                          <TiltCard
                            intensity={5}
                            onClick={() => openDeviceDetails(dev)}
                            className={`nv-card nv-card-hover rounded-2xl p-4 cursor-pointer flex items-center justify-between gap-4 ${
 isSelected ? "!border-[#C56845]" : ""
 }`}
                            style={isSelected ? { boxShadow: "var(--shadow-2), var(--glow-accent)" } : undefined}
                          >
                            <div className="flex items-center gap-3.5 min-w-0" style={{ transform: "translateZ(18px)" }}>
                              <DeviceGlyph online={online} />
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-base text-[#30251F]">{dev.name}</span>
                                  <span className="text-[10px] font-mono text-[#75665D] bg-[#F5F0E8] px-2 py-0.5 rounded-md border border-[#E7DFD4]">
                                    {dev.deviceId}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-[#75665D]">
                                  <OnlineBadge online={online} />
                                  {dev.hardwareId && (
                                    <span className="text-[10px] font-mono text-[#75665D]">MAC: {dev.hardwareId}</span>
                                  )}
                                  <span className="text-[#D6C7B7]">/</span>
                                  <span className="text-[11px] font-mono text-[#75665D]">
                                    Config: v{dev.appliedConfigVersion || 1}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right space-y-1.5 shrink-0" style={{ transform: "translateZ(12px)" }}>
                              <span
                                className={`nv-chip inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
 isAssigned
 ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
 : "bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]"
 }`}
                              >
                                {dev.status}
                              </span>
                              {dev.currentAssignment?.patient && (
                                <div className="text-xs text-[#30251F] font-medium flex items-center justify-end gap-1">
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
                          </TiltCard>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </motion.section>

              {/* Selected Device Details & Configuration Column */}
              <AnimatePresence mode="popLayout">
                {selectedDevice && (
                  <motion.aside
                    key={selectedDevice.deviceId}
                    initial={{ opacity: 0, x: 40, rotateY: -10 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    exit={{ opacity: 0, x: 40, rotateY: -8 }}
                    transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    style={{ transformPerspective: 1400, transformOrigin: "0% 50%" }}
                    className="lg:col-span-6 space-y-5"
                  >
                    {/* Device Header Card */}
                    <div className="nv-card rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3">
                        <div className="flex items-center gap-3">
                          <DeviceGlyph online={selectedDevice.connectivityStatus === "ONLINE"} large />
                          <div>
                            <span className="nv-eyebrow">Selected device</span>
                            <h3 className="text-xl font-semibold tracking-tight text-[#30251F] leading-tight">{selectedDevice.name}</h3>
                            <div className="flex items-center gap-2 text-xs font-mono text-[#75665D] mt-0.5">
                              <span>{selectedDevice.deviceId}</span>
                              <span className="text-[#D6C7B7]">/</span>
                              <span className="text-[#30251F] font-sans font-semibold">{selectedDevice.status}</span>
                            </div>
                          </div>
                        </div>
                        <CloseButton onClick={() => setSelectedDevice(null)} />
                      </div>
                      <div className="nv-divider" />

                      {/* Device Telemetry Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <Telemetry label="Status">
                          {selectedDevice.connectivityStatus === "ONLINE" ? (
                            <span className="inline-flex items-center gap-1.5 font-mono font-medium text-[#7A361E]">
                              <span className="nv-live-dot !w-1.5 !h-1.5" />
                              ONLINE
                            </span>
                          ) : (
                            <span className="font-mono text-[#75665D]">OFFLINE</span>
                          )}
                        </Telemetry>
                        <Telemetry label="MAC Address">
                          <span className="font-mono text-xs font-semibold text-[#30251F] block truncate">
                            {selectedDevice.hardwareId || "None"}
                          </span>
                        </Telemetry>
                        <Telemetry label="Last Seen">
                          <span className="text-xs font-mono text-[#30251F] block truncate">
                            {selectedDevice.lastSeenAt ? new Date(selectedDevice.lastSeenAt).toLocaleTimeString() : "Never"}
                          </span>
                        </Telemetry>
                        <Telemetry label="Firmware">
                          <span className="font-mono text-xs font-semibold text-[#30251F] block">
                            {selectedDevice.firmwareVersion || "v1.2.0"}
                          </span>
                        </Telemetry>
                      </div>

                      {/* Bedside Patient Assignment Box */}
                      <div className="pt-1">
                        <span className="nv-eyebrow block mb-2">Bedside Patient Assignment</span>
                        {selectedDevice.currentAssignment ? (
                          <div className="nv-well p-3.5 rounded-2xl flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-[#30251F]">
                                {selectedDevice.currentAssignment.patient.displayName}
                              </p>
                              <p className="text-xs text-[#75665D] font-mono mt-0.5">
                                Code: {selectedDevice.currentAssignment.patient.patientCode} &bull; Bed:{" "}
                                {selectedDevice.currentAssignment.patient.bedLabel || "General"}
                              </p>
                            </div>
                            <button
                              onClick={handleUnassignDevice}
                              className="nv-btn-ghost px-3 py-1.5 rounded-lg text-xs font-medium text-[#7A361E]"
                            >
                              Unassign
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleAssignDevice} className="flex gap-2">
                            <select
                              value={assignPatientCode}
                              onChange={(e) => setAssignPatientCode(e.target.value)}
                              className="nv-input flex-1 rounded-xl px-3 py-2 text-xs text-[#30251F]"
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
                              className="nv-btn-primary px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                            >
                              Assign
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Gesture Configuration Card */}
                    <div className="nv-card rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between pb-1">
                        <div>
                          <span className="nv-eyebrow">Mapping matrix</span>
                          <h4 className="text-lg font-semibold tracking-tight text-[#30251F]">Gesture Configuration</h4>
                          <p className="text-xs text-[#75665D]">
                            Map patient eye gaze &amp; blink triggers to clinical requests
                          </p>
                        </div>
                        {latestConfig && (
                          <span className="nv-chip text-xs font-medium font-medium px-2.5 py-0.5 rounded-full bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]">
                            v{latestConfig.version} Active
                          </span>
                        )}
                      </div>
                      <div className="nv-divider" />

                      {selectedDevice.status === "ASSIGNED" ? (
                        <form onSubmit={handleSaveConfiguration} className="space-y-4">
                          {/* Presets Bar */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="nv-eyebrow flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#C56845]" /> Presets
                            </span>
                            {PRESET_MAPPINGS.map((p) => (
                              <motion.button
                                key={p.name}
                                type="button"
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                  setConfigMappings(p.mappings);
                                  showNotification(`Applied preset: ${p.name}`);
                                }}
                                className="nv-btn-ghost text-[11px] px-2.5 py-1 rounded-lg text-[#30251F]"
                              >
                                {p.name}
                              </motion.button>
                            ))}
                          </div>

                          {/* Mapping Rows */}
                          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 -mr-1">
                            <AnimatePresence initial={false}>
                              {configMappings.map((mapping, idx) => (
                                <motion.div
                                  key={idx}
                                  layout
                                  initial={{ opacity: 0, height: 0, rotateX: -40 }}
                                  animate={{ opacity: 1, height: "auto", rotateX: 0 }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.35, ease: EASE_OUT }}
                                  className="nv-well p-3 rounded-2xl space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium uppercase tracking-wider text-[#75665D] flex items-center gap-2">
                                      <span className="h-5 w-5 rounded-md bg-[#30251F] text-[#FFFCF7] grid place-items-center text-[10px]">
                                        {idx + 1}
                                      </span>
                                      Trigger
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMappingRow(idx)}
                                      disabled={configMappings.length <= 1}
                                      className="text-[11px] font-mono text-[#75665D] hover:text-[#C56845] disabled:opacity-30 transition px-1.5 py-0.5 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Remove
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <MiniField label="Gesture Identifier">
                                      <input
                                        type="text"
                                        value={mapping.gestureId}
                                        onChange={(e) => handleMappingChange(idx, "gestureId", e.target.value.toUpperCase())}
                                        className="nv-input w-full rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#30251F]"
                                        required
                                      />
                                    </MiniField>
                                    <MiniField label="Gesture Name">
                                      <input
                                        type="text"
                                        value={mapping.gestureName}
                                        onChange={(e) => handleMappingChange(idx, "gestureName", e.target.value)}
                                        className="nv-input w-full rounded-lg px-2.5 py-1.5 text-xs text-[#30251F]"
                                        required
                                      />
                                    </MiniField>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <MiniField label="Care Request Action">
                                      <select
                                        value={mapping.action}
                                        onChange={(e) => handleMappingChange(idx, "action", e.target.value as RequestAction)}
                                        className="nv-input w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#30251F]"
                                        required
                                      >
                                        {SUPPORTED_ACTIONS.map((act) => (
                                          <option key={act.value} value={act.value}>
                                            {act.label}
                                          </option>
                                        ))}
                                      </select>
                                    </MiniField>
                                    <MiniField label="Bedside Instruction">
                                      <input
                                        type="text"
                                        value={mapping.instruction || ""}
                                        onChange={(e) => handleMappingChange(idx, "instruction", e.target.value)}
                                        placeholder="e.g. Blink twice firmly when thirsty"
                                        className="nv-input w-full rounded-lg px-2.5 py-1.5 text-xs text-[#30251F]"
                                      />
                                    </MiniField>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={handleAddMappingRow}
                              className="nv-btn-ghost inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-[#C56845]"
                            >
                              <Plus className="w-3.5 h-3.5" />+ Add Gesture
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingConfig}
                              className="nv-btn-primary px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {isSubmittingConfig && <Spinner />}
                              <Check className="w-3.5 h-3.5" />
                              Save Configuration
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="nv-well p-6 rounded-2xl text-center space-y-1">
                          <p className="text-sm font-medium text-[#30251F]">Device Not Assigned</p>
                          <p className="text-xs text-[#75665D]">
                            Assign this device to an active patient bed to customize gesture mappings.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bedside Patient Instructions Card */}
                    {latestConfig && latestConfig.mappings.length > 0 && (
                      <div className="nv-card rounded-3xl p-5 space-y-3">
                        <div className="flex items-center justify-between pb-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#C56845]" />
                            <h4 className="nv-eyebrow">Bedside Instructions Guide</h4>
                          </div>
                          <span className="text-[11px] font-mono text-[#75665D]">v{latestConfig.version}</span>
                        </div>
                        <div className="space-y-2">
                          {latestConfig.mappings.map((m, idx) => {
                            const actionInfo = SUPPORTED_ACTIONS.find((a) => a.value === m.action);
                            return (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.04, duration: 0.4, ease: EASE_OUT }}
                                className="nv-well p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs"
                              >
                                <div>
                                  <span className="font-medium text-sm text-[#30251F]">{m.gestureName}</span>
                                  {m.instruction && (
                                    <p className="text-[11px] text-[#75665D]">&ldquo;{m.instruction}&rdquo;</p>
                                  )}
                                </div>
                                <span
                                  className={`nv-chip shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono border ${
 actionInfo?.badgeColor || "bg-[#F5F0E8] text-[#30251F]"
 }`}
                                >
                                  {actionInfo?.label || m.action}
                                </span>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.aside>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CARE REQUESTS */}
          {/* ======================================================== */}
          {activeTab === "requests" && (
            <motion.section key="requests" {...tabMotion} className="space-y-4">
              <SectionHeading
                title={`Bedside Care Requests (${filteredRequests.length})`}
                subtitle={
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>Live requests received from bedside devices.</span>
                    <Link href="/nurse" className="font-sans text-xs font-medium text-[#C56845] hover:underline">
                      Dedicated Nurse Station &rarr;
                    </Link>
                  </span>
                }
                actions={
                  <Segmented
                    size="sm"
                    layoutId="registry-req-filter"
                    value={requestFilter}
                    onChange={setRequestFilter}
                    items={(["ALL", "NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).map((st) => ({
                      value: st,
                      label: st === "ALL" ? "All" : st.replace("_", " "),
                    }))}
                  />
                }
              />

              {loading ? (
                <SkeletonGrid />
              ) : filteredRequests.length === 0 ? (
                <EmptyState
                  title="No Care Requests Found"
                  body={
                    requestFilter === "ALL"
                      ? "No requests have been sent by bedside devices yet."
                      : `No requests with status ${requestFilter}.`
                  }
                />
              ) : (
                <motion.div
                  variants={staggerParent}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [perspective:1400px]"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredRequests.map((req) => {
                      const actionInfo = SUPPORTED_ACTIONS.find((a) => a.value === req.action);
                      const isBusy = actionLoadingMap[req._id] || false;
                      const isNew = req.status === "NEW";

                      return (
                        <motion.div key={req._id} layout variants={staggerChild} exit="exit" className="h-full">
                          <TiltCard
                            intensity={4}
                            className={`nv-card nv-card-hover h-full rounded-3xl p-5 space-y-3 flex flex-col justify-between ${
 isNew
 ? "!border-[#C56845]"
 : req.status === "IN_PROGRESS"
 ? "!border-[#DFBA9C]"
 : req.status === "RESOLVED"
 ? "opacity-80"
 : ""
 }`}
                            style={isNew ? { boxShadow: "var(--shadow-2), var(--glow-accent)" } : undefined}
                          >
                            {isNew && <NewRequestAura />}
                            <div className="space-y-3 relative">
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className={`nv-chip px-3 py-1 rounded-xl text-xs font-mono border ${
 actionInfo?.badgeColor || "bg-[#F5F0E8] text-[#30251F]"
 }`}
                                >
                                  {actionInfo?.label || req.action}
                                </span>
                                <StatusBadge status={req.status} />
                              </div>

                              <div>
                                <h3 className="font-semibold tracking-tight text-xl text-[#30251F]">
                                  {req.patient?.displayName || "Bedside Patient"}
                                </h3>
                                <div className="text-xs text-[#75665D] font-mono flex items-center gap-2 mt-0.5">
                                  <span>Bed: {req.patient?.bedLabel || "ICU"}</span>
                                  <span className="text-[#D6C7B7]">/</span>
                                  <span>{req.patient?.patientCode}</span>
                                </div>
                              </div>

                              <div className="nv-well p-2.5 rounded-xl text-xs space-y-1">
                                <div className="flex items-center justify-between text-[#75665D]">
                                  <span>Triggered Gesture</span>
                                  <strong className="text-[#30251F] font-mono text-[11px]">{req.gestureId}</strong>
                                </div>
                                <div className="flex items-center justify-between text-[#75665D]">
                                  <span>Time</span>
                                  <span className="font-mono text-[11px]">{new Date(req.createdAt).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 relative">
                              <div className="nv-divider mb-3" />
                              {req.status === "NEW" && (
                                <button
                                  onClick={() => handleAcknowledge(req._id)}
                                  disabled={isBusy}
                                  className="nv-btn-primary w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  {isBusy && <Spinner />}
                                  Acknowledge Request
                                </button>
                              )}
                              {req.status === "ACKNOWLEDGED" && (
                                <button
                                  onClick={() => handleStartHandling(req._id)}
                                  disabled={isBusy}
                                  className="nv-btn-soft w-full py-2.5 rounded-xl text-xs font-medium text-[#7A361E] flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  {isBusy && <Spinner dark />}
                                  Start Handling (In Progress)
                                </button>
                              )}
                              {req.status === "IN_PROGRESS" && (
                                <button
                                  onClick={() => handleResolve(req._id)}
                                  disabled={isBusy}
                                  className="nv-btn-dark w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  {isBusy && <Spinner />}
                                  Mark as Resolved
                                </button>
                              )}
                              {req.status === "RESOLVED" && (
                                <div className="py-1 text-center text-xs text-[#75665D] flex items-center justify-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#C56845]" />
                                  Request Resolved
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
            </motion.section>
          )}

          {/* ======================================================== */}
          {/* TAB 3: PATIENTS LIST */}
          {/* ======================================================== */}
          {activeTab === "patients" && (
            <motion.section key="patients" {...tabMotion} className="space-y-4">
              <SectionHeading
                title={`Patients List (${patients.length})`}
                subtitle="Registered patient profiles and bedside assignments."
                actions={
                  <button
                    onClick={() => setShowPatientModal(true)}
                    className="nv-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium"
                  >
                    <PlusCircle className="w-4 h-4" />+ New Patient
                  </button>
                }
              />

              {loading ? (
                <SkeletonGrid />
              ) : patients.length === 0 ? (
                <EmptyState title="No patients registered yet." body="Register a patient to link a bedside device." />
              ) : (
                <motion.div
                  variants={staggerParent}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [perspective:1400px]"
                >
                  {patients.map((pt) => {
                    const na = pt.nurseAssignment;
                    const isApproved = na?.status === "APPROVED";
                    const isPending = na?.status === "PENDING";
                    const hasDevice = Boolean(pt.currentAssignment?.device);

                    return (
                      <motion.div key={pt.patientCode} variants={staggerChild} className="h-full">
                        <TiltCard intensity={4} className="nv-card nv-card-hover h-full rounded-3xl p-5 flex flex-col justify-between space-y-3.5">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <Monogram name={pt.displayName} />
                                <div>
                                  <span className="font-semibold tracking-tight text-lg text-[#1C140F] block leading-tight">{pt.displayName}</span>
                                  <span className="text-[11px] font-mono text-[#75665D]">
                                    {pt.patientCode} &bull; Bed: {pt.bedLabel || "General"}
                                  </span>
                                </div>
                              </div>
                              <span className="nv-chip text-[10px] font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#E8E2D7] text-[#1C140F] border border-[#D6C7B7]">
                                {pt.status}
                              </span>
                            </div>

                            <div className="nv-well p-2.5 rounded-xl text-xs space-y-1">
                              <span className="nv-eyebrow !text-[9px] block">Bedside Device (1-to-1 Allocation)</span>
                              {hasDevice ? (
                                <div className="font-medium text-[#1C140F] flex items-center justify-between">
                                  <span>{pt.currentAssignment?.device.name}</span>
                                  <span className="font-mono text-[11px] text-[#7A361E]">{pt.currentAssignment?.device.deviceId}</span>
                                </div>
                              ) : (
                                <div className="text-[#75665D] text-[11px]">No device allocated (Strict 1-to-1 invariant)</div>
                              )}
                            </div>

                            <div className="text-xs space-y-1">
                              <span className="nv-eyebrow !text-[9px] block">Nurse Care Assignment</span>
                              {isApproved ? (
                                <div className="p-2 rounded-lg bg-[#FFFCF7] border border-[#D6C7B7] text-[#1C140F]">
                                  <span className="font-medium text-[#7A361E]">Assigned: {na?.nurseName}</span>
                                  <span className="block text-[10px] font-mono text-[#75665D]">Approved by Patient</span>
                                </div>
                              ) : isPending ? (
                                <div className="p-2 rounded-lg bg-[#EED9CD]/60 border border-[#D6C7B7] text-[#7A361E]">
                                  <span className="font-medium flex items-center gap-1.5">
                                    <span className="nv-live-dot !w-1.5 !h-1.5" />
                                    Awaiting Patient Approval
                                  </span>
                                  <span className="block text-[10px] font-mono text-[#30251F]">Requested for {na?.nurseName}</span>
                                </div>
                              ) : (
                                <div className="text-[#75665D] text-[11px]">Unassigned &bull; Patient must approve request</div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="nv-divider mb-3" />
                            <div className="flex items-center justify-between">
                              <Link
                                href="/patient"
                                target="_blank"
                                className="text-xs font-medium text-[#C56845] hover:text-[#B05534] inline-flex items-center gap-1"
                              >
                                Bedside Patient Screen &rarr;
                              </Link>
                              <Link href="/nurse" className="text-xs font-medium text-[#75665D] hover:text-[#1C140F]">
                                Nurse Station
                              </Link>
                            </div>
                          </div>
                        </TiltCard>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* ======================================================== */}
      {/* NEW PATIENT MODAL */}
      {/* ======================================================== */}
      <MotionModal open={showPatientModal} onClose={() => setShowPatientModal(false)} className="max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="nv-eyebrow">New record</span>
            <h3 className="font-semibold tracking-tight text-2xl text-[#30251F]">Register New Patient</h3>
          </div>
          <CloseButton onClick={() => setShowPatientModal(false)} />
        </div>

        <form onSubmit={handleCreatePatient} className="space-y-4">
          <div>
            <label className="nv-eyebrow block mb-1.5">Patient Full Name *</label>
            <input
              type="text"
              placeholder="e.g. Eleanor Vance"
              value={patientForm.displayName}
              onChange={(e) => setPatientForm({ ...patientForm, displayName: e.target.value })}
              className="nv-input w-full rounded-xl px-3 py-2.5 text-sm text-[#30251F]"
              required
            />
          </div>
          <div>
            <label className="nv-eyebrow block mb-1.5">Bed Label (Optional)</label>
            <input
              type="text"
              placeholder="e.g. ICU-Bed-04"
              value={patientForm.bedLabel}
              onChange={(e) => setPatientForm({ ...patientForm, bedLabel: e.target.value })}
              className="nv-input w-full rounded-xl px-3 py-2.5 text-sm text-[#30251F]"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPatientModal(false)}
              className="nv-btn-ghost px-4 py-2 rounded-xl text-xs font-medium text-[#75665D]"
            >
              Cancel
            </button>
            <button type="submit" className="nv-btn-primary px-4 py-2 rounded-xl text-xs font-medium">
              Create Patient
            </button>
          </div>
        </form>
      </MotionModal>

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

      <SiteFooter left="NetraVaani · Assistive HealthTech Journal" right="ESP32 Wi-Fi Communication Active" />
    </div>
  );
}

/* ====================================================================== */
/* Presentational helpers (UI only)                                        */
/* ====================================================================== */
const tabMotion = {
  initial: { opacity: 0, y: 18, rotateX: -4 },
  animate: { opacity: 1, y: 0, rotateX: 0 },
  exit: { opacity: 0, y: -10, rotateX: 3 },
  transition: { duration: 0.4, ease: EASE_OUT },
  style: { transformPerspective: 1600, transformOrigin: "50% 0%" },
} as const;

function Count({ n, hot }: { n: number; hot?: boolean }) {
  return (
    <span
      className={`ml-0.5 min-w-[18px] px-1.5 rounded-full text-[10px] font-mono leading-[18px] text-center ${
 hot ? "bg-[#C56845] text-[#FFFCF7]" : "bg-[#E7DFD4] text-[#75665D]"
 }`}
    >
      {n}
    </span>
  );
}

function BackendStatusPill({
  status,
  latencyMs,
}: {
  status: "CONNECTED" | "UNAVAILABLE" | "CHECKING";
  latencyMs?: number;
}) {
  if (status === "CONNECTED") {
    return (
      <div className="nv-chip inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#FFFCF7] text-[#30251F] border border-[#E7DFD4]">
        <span className="nv-live-dot !w-1.5 !h-1.5" />
        <span>Online</span>
        {latencyMs !== undefined && <span className="text-[10px] text-[#75665D]">{latencyMs}ms</span>}
      </div>
    );
  }
  if (status === "UNAVAILABLE") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#EED9CD]/60 text-[#7A361E] border border-[#C56845]/40">
        <span className="w-1.5 h-1.5 rounded-full bg-[#C56845]" />
        <span>Offline</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#FFFCF7] text-[#75665D] border border-[#E7DFD4]">
      <Spinner dark />
      <span>Connecting...</span>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h2 className="nv-engraved text-2xl font-semibold text-[#30251F] tracking-tight">{title}</h2>
        {subtitle && <div className="text-xs text-[#75665D] mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

function RefreshButton({ spinning, onClick, title }: { spinning?: boolean; onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="nv-btn-ghost h-9 w-9 grid place-items-center rounded-xl text-[#75665D]">
      <motion.svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={spinning ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.3 }}
      >
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v4h-4" />
      </motion.svg>
    </button>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="nv-btn-ghost h-8 w-8 grid place-items-center rounded-lg text-[#75665D] hover:text-[#30251F] text-lg leading-none"
    >
      ×
    </button>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full border-2 animate-spin ${
 dark ? "border-[#C56845]/30 border-t-[#C56845]" : "border-white/40 border-t-white"
 }`}
    />
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  return online ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#EED9CD]/60 text-[#7A361E] border border-[#D6C7B7]">
      <span className="nv-live-dot !w-1.5 !h-1.5" />
      Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#F5F0E8] text-[#75665D] border border-[#E7DFD4]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#A2948B]" />
      Offline
    </span>
  );
}

/** Small isometric hardware tile representing an NPG Lite board */
function DeviceGlyph({ online, large }: { online: boolean; large?: boolean }) {
  const s = large ? 48 : 42;
  return (
    <div
      className="relative shrink-0 rounded-xl grid place-items-center"
      style={{
        width: s,
        height: s,
        background: "linear-gradient(150deg, #F3E9DF 0%, #E7DFD4 100%)",
        boxShadow: "0 1px 0 #fff inset, 0 -2px 0 rgba(48,37,31,.08) inset, 0 3px 0 #D6C7B7, 0 8px 16px -8px rgba(48,37,31,.35)",
      }}
    >
      <svg viewBox="0 0 32 32" className="h-[62%] w-[62%]">
        <rect x="7" y="7" width="18" height="18" rx="3" fill="#30251F" />
        <rect x="11" y="11" width="10" height="10" rx="1.5" fill="none" stroke="#C56845" strokeWidth="1.2" />
        {[10, 14, 18, 22].map((p) => (
          <g key={p} stroke="#75665D" strokeWidth="1.2" strokeLinecap="round">
            <line x1={p} y1="3.5" x2={p} y2="6" />
            <line x1={p} y1="26" x2={p} y2="28.5" />
            <line x1="3.5" y1={p} x2="6" y2={p} />
            <line x1="26" y1={p} x2="28.5" y2={p} />
          </g>
        ))}
      </svg>
      <span
        className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#FFFCF7] ${online ? "bg-[#C56845]" : "bg-[#A2948B]"}`}
        style={online ? { boxShadow: "0 0 10px rgba(197,104,69,.8)" } : undefined}
      />
    </div>
  );
}

function Telemetry({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="nv-well p-2.5 rounded-xl">
      <span className="nv-eyebrow !text-[9px] block">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#75665D] block mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`nv-chip px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
 status === "NEW"
 ? "bg-[#C56845] text-[#FFFCF7]"
 : status === "ACKNOWLEDGED"
 ? "bg-[#EED9CD] text-[#7A361E] border border-[#D6C7B7]"
 : status === "IN_PROGRESS"
 ? "bg-[#F4DFC8] text-[#8C4318] border border-[#DFBA9C]"
 : "bg-[#E8E2D7] text-[#30251F] border border-[#D6C7B7]"
 }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function NewRequestAura() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      animate={{ boxShadow: ["0 0 0 0 rgba(197,104,69,0.35)", "0 0 0 10px rgba(197,104,69,0)"] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="h-10 w-10 shrink-0 rounded-xl grid place-items-center font-medium text-sm text-[#7A361E]"
      style={{
        background: "linear-gradient(150deg, #F3E2D7 0%, #EED9CD 100%)",
        boxShadow: "0 1px 0 #fff inset, 0 2px 0 #DFBA9C, 0 6px 12px -6px rgba(197,104,69,.5)",
      }}
    >
      {initials}
    </span>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="nv-card rounded-3xl p-12 text-center space-y-3"
    >
      <div className="mx-auto h-16 w-16 [perspective:400px]">
        <motion.div
          className="h-full w-full rounded-2xl border border-[#D6C7B7] bg-[#F5F0E8]"
          style={{ boxShadow: "0 1px 0 #fff inset, 0 10px 24px -12px rgba(48,37,31,.4)" }}
          animate={{ rotateY: [0, 18, 0, -18, 0], rotateX: [8, 0, -8, 0, 8] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="h-full w-full grid place-items-center">
            <span className="h-3 w-3 rounded-full bg-[#C56845]/70" />
          </div>
        </motion.div>
      </div>
      <p className="text-[#30251F] text-lg font-semibold tracking-tight">{title}</p>
      <p className="text-xs text-[#75665D] max-w-sm mx-auto">{body}</p>
      {action && <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{action}</div>}
    </motion.div>
  );
}

function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="nv-card rounded-2xl p-4 flex items-center gap-4">
          <div className="nv-shimmer h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="nv-shimmer h-3 w-1/3 rounded" />
            <div className="nv-shimmer h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="nv-card rounded-3xl p-5 space-y-3">
          <div className="nv-shimmer h-5 w-24 rounded-lg" />
          <div className="nv-shimmer h-6 w-2/3 rounded" />
          <div className="nv-shimmer h-16 w-full rounded-xl" />
          <div className="nv-shimmer h-9 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
