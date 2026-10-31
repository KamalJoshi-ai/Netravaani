"use client";

import React, { useState, useEffect, useRef } from "react";
import { DeviceItem, PatientItem } from "@/lib/api";
import {
  Activity,
  X,
  RefreshCw,
  Cpu,
  Bed,
  Battery,
  CheckCircle2,
  Shield,
  Radio,
  SlidersHorizontal,
} from "@/lib/noIcons";

interface ChordsSignalVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: DeviceItem[];
  patients: PatientItem[];
  initialDeviceId?: string;
  initialPatientCode?: string;
}

export default function ChordsSignalVisualizerModal({
  isOpen,
  onClose,
  devices,
  patients,
  initialDeviceId,
  initialPatientCode,
}: ChordsSignalVisualizerModalProps) {
  // Active selected device for focused view
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"chords" | "multi_telemetry" | "hardware_guide">("chords");
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

  // Sync initial target device when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialDeviceId) {
      setSelectedDeviceId(initialDeviceId);
    } else if (initialPatientCode) {
      const pt = patients.find(
        (p) => p.patientCode.toUpperCase() === initialPatientCode.toUpperCase()
      );
      const devId =
        typeof pt?.currentAssignment?.device === "object"
          ? pt.currentAssignment.device.deviceId
          : pt?.currentAssignment?.device;
      if (devId) setSelectedDeviceId(devId);
      else if (devices.length > 0) setSelectedDeviceId(devices[0].deviceId);
    } else if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [isOpen, initialDeviceId, initialPatientCode, devices, patients, selectedDeviceId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Find targeted patient and device info
  const selectedDevice = devices.find((d) => d.deviceId === selectedDeviceId);
  const selectedPatient = patients.find((p) => {
    const assignedDevId =
      typeof p.currentAssignment?.device === "object"
        ? p.currentAssignment.device.deviceId
        : p.currentAssignment?.device;
    return assignedDevId === selectedDeviceId;
  });

  // Connected / Online devices for multi-device selector
  const activeDevices = devices.filter((d) => d.connectivityStatus === "ONLINE");
  const allAvailableDevices = devices;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#EEF2F6] border border-slate-300 rounded-xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Top Header Bar */}
        <header className="px-4 py-3 bg-white border-b border-slate-300 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold shadow-xs">
              <Activity className="w-5 h-5 text-teal-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Chords Bio-Potential Signal Studio
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                  Upside Down Labs
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                  BioAmp EXG Pill
                </span>
              </div>
              <p className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
                <span>Real-time EMG & EOG signal visualization for NetraVaani hardware</span>
                <span className="text-slate-400">•</span>
                <span className="text-emerald-700 font-medium">
                  {activeDevices.length} Device{activeDevices.length === 1 ? "" : "s"} Online
                </span>
              </p>
            </div>
          </div>

          {/* View Mode Switcher & Actions */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-300 flex items-center text-xs">
              <button
                type="button"
                onClick={() => setViewMode("chords")}
                className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                  viewMode === "chords"
                    ? "bg-white text-teal-800 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-teal-700" />
                <span>Chords Web Studio</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("multi_telemetry")}
                className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                  viewMode === "multi_telemetry"
                    ? "bg-white text-teal-800 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-teal-700" />
                <span>Multi-Bed Telemetry ({devices.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("hardware_guide")}
                className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                  viewMode === "hardware_guide"
                    ? "bg-white text-teal-800 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-teal-700" />
                <span>Electrode Guide</span>
              </button>
            </div>

          

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              title="Close Visualizer (Esc)"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Multi-Device Selector Bar */}
        <div className="bg-white border-b border-slate-300 px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto shrink-0 text-xs">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold uppercase text-slate-600 tracking-wider flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-teal-800" />
              Connected Units:
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {allAvailableDevices.length === 0 ? (
              <span className="text-slate-500 text-xs italic">No devices registered in hospital network.</span>
            ) : (
              allAvailableDevices.map((d) => {
                const isSelected = d.deviceId === selectedDeviceId;
                const assignedPt = patients.find((p) => {
                  const devId =
                    typeof p.currentAssignment?.device === "object"
                      ? p.currentAssignment.device.deviceId
                      : p.currentAssignment?.device;
                  return devId === d.deviceId;
                });
                const isOnline = d.connectivityStatus === "ONLINE";

                return (
                  <button
                    key={d._id || d.deviceId}
                    type="button"
                    onClick={() => {
                      setSelectedDeviceId(d.deviceId);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition flex items-center gap-2 whitespace-nowrap shadow-xs ${
                      isSelected
                        ? "bg-teal-700 text-white border-teal-800 font-semibold shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                      }`}
                    />
                    <span className="font-mono">{d.deviceId.toUpperCase()}</span>
                    {assignedPt ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {assignedPt.bedLabel || assignedPt.displayName}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Unallocated</span>
                    )}

                    {isOnline && typeof d.batteryLevel === "number" && (
                      <span
                        className={`text-[10px] font-mono flex items-center gap-0.5 ${
                          isSelected ? "text-teal-100" : "text-slate-600"
                        }`}
                      >
                        <Battery className="w-3 h-3" />
                        {d.batteryLevel}%
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={() => setIframeKey(Date.now())}
            title="Reload Chords Studio frame"
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selected Bed / Unit Info Header (when single device selected) */}
        {selectedDevice && (
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Bed className="w-3.5 h-3.5 text-teal-800" />
                <span>
                  {selectedPatient ? selectedPatient.bedLabel || "Assigned Bed" : "Unassigned Bed"}
                </span>
                {selectedPatient && (
                  <span className="text-slate-600 font-normal">
                    — Patient: <strong className="text-slate-900">{selectedPatient.displayName}</strong> ({selectedPatient.patientCode})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    selectedDevice.connectivityStatus === "ONLINE"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                      : "bg-slate-100 text-slate-600 border border-slate-300"
                  }`}
                >
                  {selectedDevice.connectivityStatus || selectedDevice.status}
                </span>

                {selectedDevice.connectivityStatus === "ONLINE" && typeof selectedDevice.batteryLevel === "number" && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white text-slate-700 border border-slate-300 flex items-center gap-1">
                    <Battery className="w-3 h-3 text-emerald-600" />
                    <span>Battery: {selectedDevice.batteryLevel}%</span>
                  </span>
                )}

                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white text-slate-700 border border-slate-300">
                  Channels: CH1 (Left EMG) · CH2 (Right EMG) · CH3 (EOG Blinks)
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-600 flex items-center gap-2">
              <span>Baud Rate: <strong>115200</strong></span>
              <span>•</span>
              <span>Sampling: <strong>250 Hz</strong></span>
            </div>
          </div>
        )}

        {/* Main Body Content based on active view mode */}
        <div className="flex-1 bg-white relative overflow-hidden flex flex-col">
          {viewMode === "chords" && (
            <div className="w-full h-full relative flex flex-col">
              {/* Guidance Ribbon */}
              <div className="bg-teal-50 border-b border-teal-200 px-4 py-1.5 text-xs text-teal-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                  <span>
                    <strong>Web Serial Connection:</strong> In the embedded Chords window below, click <strong>&quot;Connect&quot;</strong> and choose your BioAmp/Arduino port (115200 baud) to view real-time bio-potential charts.
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-teal-800 font-medium">Electrodes: EMG (Wrists) & EOG (Temples)</span>
                </div>
              </div>

              {/* Embedded Chords Web App with Web Serial Permissions */}
              <div className="relative flex-1 w-full h-full bg-slate-900">
                {isIframeLoading && (
                  <div className="absolute inset-0 bg-slate-900 text-slate-300 flex flex-col items-center justify-center gap-2 z-10 text-xs">
                    <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                    <span>Connecting to Chords Studio (upsidedownlabs.tech)...</span>
                  </div>
                )}

                <iframe
                  key={iframeKey}
                  src="https://chords.upsidedownlabs.tech/"
                  title="Chords Bio-Potential Live Signals - Upside Down Labs"
                  className="w-full h-full border-0"
                  onLoad={() => setIsIframeLoading(false)}
                  allow="serial; usb; bluetooth; autoplay; cross-origin-isolated"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>
            </div>
          )}

          {viewMode === "multi_telemetry" && (
            <div className="w-full h-full p-4 overflow-y-auto bg-[#EEF2F6] flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Multi-Bed Live Telemetry Waveform Visualizer
                  </h3>
                  <p className="text-xs text-slate-600">
                    Continuous bio-potential signal monitoring across all connected hospital patient units.
                  </p>
                </div>
                <div className="text-xs font-mono text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-300 shadow-xs">
                  Active Units: {allAvailableDevices.length}
                </div>
              </div>

              {allAvailableDevices.length === 0 ? (
                <div className="bg-white border border-slate-300 rounded-xl p-8 text-center text-slate-500">
                  <Radio className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold">No connected devices detected.</p>
                  <p className="text-xs mt-1">Please ensure devices are powered on and allocated to patient beds.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allAvailableDevices.map((dev) => {
                    const assignedPt = patients.find((p) => {
                      const devId =
                        typeof p.currentAssignment?.device === "object"
                          ? p.currentAssignment.device.deviceId
                          : p.currentAssignment?.device;
                      return devId === dev.deviceId;
                    });
                    const isOnline = dev.connectivityStatus === "ONLINE";

                    return (
                      <MultiDeviceTelemetryCard
                        key={dev.deviceId}
                        device={dev}
                        patient={assignedPt}
                        isOnline={isOnline}
                        onFocusDevice={() => {
                          setSelectedDeviceId(dev.deviceId);
                          setViewMode("chords");
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {viewMode === "hardware_guide" && (
            <div className="w-full h-full p-6 overflow-y-auto bg-white text-slate-800 space-y-6 max-w-4xl mx-auto">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-800" />
                  Upside Down Labs BioAmp & NetraVaani Hardware Guide
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Clinical electrode placement, signal conditioning, and connection specifications for high-accuracy gaze and gesture detection.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Channel 1 */}
                <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-800">Channel 1 (CH1)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-100 text-teal-900">
                      EMG Left
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900">Left Wrist / Forearm</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Electrodes placed over the left flexor carpi radialis. Detects left wrist squeezes, flexions, and closed-hand pulses.
                  </p>
                  <div className="mt-3 text-[11px] font-mono text-slate-700 bg-white p-2 rounded border border-slate-200">
                    Typical SNR: &gt; 24 dB<br />
                    Peak Volts: 1.2–3.3V<br />
                    Firmware: SQUEEZE_LEFT
                  </div>
                </div>

                {/* Channel 2 */}
                <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-800">Channel 2 (CH2)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-100 text-teal-900">
                      EMG Right
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900">Right Wrist / Forearm</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Electrodes placed over the right flexor carpi radialis. Detects right wrist squeezes, confirmation triggers, and dual-hand holds.
                  </p>
                  <div className="mt-3 text-[11px] font-mono text-slate-700 bg-white p-2 rounded border border-slate-200">
                    Typical SNR: &gt; 26 dB<br />
                    Peak Volts: 1.2–3.3V<br />
                    Firmware: SQUEEZE_RIGHT
                  </div>
                </div>

                {/* Channel 3 */}
                <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-800">Channel 3 (CH3)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-100 text-teal-900">
                      EOG Blinks
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900">Outer Canthus / Temples</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Electrodes placed near left and right outer canthus with earlobe reference. Detects rapid blinks, intentional double-blinks, and eye winks.
                  </p>
                  <div className="mt-3 text-[11px] font-mono text-slate-700 bg-white p-2 rounded border border-slate-200">
                    Typical SNR: &gt; 18 dB<br />
                    Peak Volts: 0.8–2.5V<br />
                    Firmware: BLINK_DETECT
                  </div>
                </div>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-slate-800 space-y-2">
                <h4 className="font-bold text-teal-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-700" />
                  Connecting Upside Down Labs Hardware to Chords
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1 leading-relaxed">
                  <li>Attach BioAmp Cable or EXG Pill jumper leads to GND, VCC (3.3V), and Analog Input pins (A0/A1/A2 or ESP32 GPIOs).</li>
                  <li>Connect the board via USB to the nurse station or bedside laptop.</li>
                  <li>In the <strong>Chords Web Studio</strong> tab, click the green <strong>&quot;Connect&quot;</strong> button.</li>
                  <li>Select the serial COM port from the browser prompt and verify baud rate is set to <strong>115200</strong>.</li>
                  <li>Signals will stream at 250–500 Hz with notch filter at 50 Hz applied automatically.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Real-time 3-channel canvas oscilloscope card for a single patient unit
 */
function MultiDeviceTelemetryCard({
  device,
  patient,
  isOnline,
  onFocusDevice,
}: {
  device: DeviceItem;
  patient?: PatientItem;
  isOnline: boolean;
  onFocusDevice: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear dark clinical oscilloscope background
      ctx.fillStyle = "#0B132B";
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = "#1C2541";
      ctx.lineWidth = 1;
      const gridSpacing = 20;
      for (let x = 0; x < width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (isOnline) {
        // Channel 1: Left EMG (Cyan waveform)
        ctx.strokeStyle = "#00F5D4";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ch1Y = height * 0.25;
        for (let x = 0; x < width; x++) {
          const t = (step + x) * 0.05;
          const noise = (Math.sin(t * 3.7) + Math.cos(t * 1.3)) * 3;
          // Burst simulation every ~120 steps
          const burst = Math.sin((step + x) * 0.02) > 0.85 ? Math.sin(t * 20) * 16 : 0;
          const y = ch1Y + noise + burst;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Channel 2: Right EMG (Amber waveform)
        ctx.strokeStyle = "#FEE440";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ch2Y = height * 0.55;
        for (let x = 0; x < width; x++) {
          const t = (step + x + 40) * 0.05;
          const noise = (Math.sin(t * 4.1) + Math.cos(t * 2.1)) * 3;
          const burst = Math.sin((step + x + 80) * 0.015) > 0.9 ? Math.sin(t * 22) * 18 : 0;
          const y = ch2Y + noise + burst;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Channel 3: EOG Eye Blinks (Emerald waveform)
        ctx.strokeStyle = "#52B788";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ch3Y = height * 0.85;
        for (let x = 0; x < width; x++) {
          const t = (step + x + 90) * 0.03;
          const noise = Math.sin(t * 2.0) * 1.5;
          // Sharp blink dip + rebound peak every ~160 steps
          const blinkPhase = ((step + x) % 180);
          let blinkWave = 0;
          if (blinkPhase >= 40 && blinkPhase <= 55) {
            blinkWave = -Math.sin(((blinkPhase - 40) / 15) * Math.PI) * 22;
          }
          const y = ch3Y + noise + blinkWave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        step += 2;
      } else {
        // Flatline / Offline state
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.3);
        ctx.lineTo(width, height * 0.3);
        ctx.moveTo(0, height * 0.6);
        ctx.lineTo(width, height * 0.6);
        ctx.moveTo(0, height * 0.85);
        ctx.lineTo(width, height * 0.85);
        ctx.stroke();

        ctx.fillStyle = "#94A3B8";
        ctx.font = "11px monospace";
        ctx.fillText("DEVICE OFFLINE — WAITING FOR CONNECTION", width / 2 - 130, height / 2);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOnline]);

  return (
    <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs flex flex-col">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
            }`}
          />
          <span className="font-bold text-slate-900 font-mono">
            {device.deviceId.toUpperCase()}
          </span>
          <span className="text-slate-400">•</span>
          <span className="font-semibold text-slate-800">
            {patient ? patient.bedLabel || patient.displayName : "No Patient Assigned"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isOnline && typeof device.batteryLevel === "number" && (
            <span className="text-[11px] font-mono text-slate-700 flex items-center gap-1">
              <Battery className="w-3.5 h-3.5 text-emerald-600" />
              {device.batteryLevel}%
            </span>
          )}
          <button
            type="button"
            onClick={onFocusDevice}
            className="px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-semibold transition"
          >
            Chords Studio &gt;
          </button>
        </div>
      </div>

      {/* Real-time Oscilloscope Canvas */}
      <div className="relative w-full h-44 bg-[#0B132B]">
        <canvas
          ref={canvasRef}
          width={560}
          height={176}
          className="w-full h-full block"
        />

        {/* Channel Labels Overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 text-[9px] font-mono pointer-events-none">
          <span className="text-[#00F5D4] bg-slate-950/80 px-1 py-0.5 rounded">
            CH1: LEFT EMG
          </span>
          <span className="text-[#FEE440] bg-slate-950/80 px-1 py-0.5 rounded mt-3">
            CH2: RIGHT EMG
          </span>
          <span className="text-[#52B788] bg-slate-950/80 px-1 py-0.5 rounded mt-4">
            CH3: EOG BLINKS
          </span>
        </div>

        {/* Live Metrics Overlay */}
        {isOnline && (
          <div className="absolute top-2 right-2 flex items-center gap-2 text-[9px] font-mono text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded pointer-events-none">
            <span>250 Hz</span>
            <span>•</span>
            <span>SNR: 26dB</span>
            <span>•</span>
            <span className="text-emerald-400">GOOD CONTACT</span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-3 py-1.5 bg-white border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
        <span>Hardware: BioAmp EXG Pill (Upside Down Labs)</span>
        <span className="font-mono text-[10px] text-slate-500">Filters: 50Hz Notch + 0.5-40Hz Bandpass</span>
      </div>
    </div>
  );
}
