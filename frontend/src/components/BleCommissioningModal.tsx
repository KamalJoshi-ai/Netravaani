"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bluetooth,
  Wifi,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ArrowRight,
  Terminal,
  Battery,
  Cpu,
  Info,
} from "@/lib/noIcons";
import { apiClient, DeviceItem } from "@/lib/api";

// Exact UUIDs from NetraVaani-Device-Kit-v1.1.1
export const NV_SERVICE_UUID = "a7c10001-5e4b-4d2a-9c1e-3f6e7a2b9d01";
export const NV_IDENTITY_UUID = "a7c10002-5e4b-4d2a-9c1e-3f6e7a2b9d01";
export const NV_PROVISION_UUID = "a7c10003-5e4b-4d2a-9c1e-3f6e7a2b9d01";
export const NV_STATUS_UUID = "a7c10004-5e4b-4d2a-9c1e-3f6e7a2b9d01";
export const CHORDS_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";

export interface BleDeviceIdentity {
  hardwareId: string;
  firmware?: string;
  deviceId?: string | null;
  provisioned?: boolean;
  provisionWindowOpen?: boolean;
  wifi?: string;
  backend?: string;
  configVersion?: number;
  battery?: number;
  channels?: string[];
  calEog?: string;
  calEmg?: string;
  seqState?: string;
  alarmActive?: boolean;
  lastReset?: string;
  safeMode?: boolean;
}

interface BleCommissioningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceCommissioned: (device: DeviceItem) => void;
}

type CommissioningStep =
  | "BLUETOOTH_CONNECT" // 1. Scan & Connect over BLE
  | "IDENTITY_READ" // 2. Read Identity & Backend Register
  | "WIFI_PROVISION" // 3. Enter Wi-Fi & Provision
  | "VERIFYING_HEARTBEAT" // 4. Waiting for authoritative heartbeat
  | "COMMISSIONED"; // 5. Verified ONLINE

export default function BleCommissioningModal({
  isOpen,
  onClose,
  onDeviceCommissioned,
}: BleCommissioningModalProps) {
  const [step, setStep] = useState<CommissioningStep>("BLUETOOTH_CONNECT");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Bluetooth & Browser Capability State
  const [bluetoothSupported, setBluetoothSupported] = useState(true);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [deviceIdentity, setDeviceIdentity] = useState<BleDeviceIdentity | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [gestureCounts, setGestureCounts] = useState<Record<string, number>>({});

  // Backend Registration
  const [registeredDeviceId, setRegisteredDeviceId] = useState("");
  const [registeredToken, setRegisteredToken] = useState("");

  // Wi-Fi & Backend LAN Configuration
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [backendUrl, setBackendUrl] = useState("http://localhost:5000");
  const [availableLanIps, setAvailableLanIps] = useState<string[]>([]);

  // Verification State
  const [verificationPollCount, setVerificationPollCount] = useState(0);
  const [verifiedDevice, setVerifiedDevice] = useState<DeviceItem | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Web Bluetooth Characteristic References
  const gattServerRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const identityCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const provisionCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const statusCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`${time}  ${text}`, ...prev.slice(0, 50)]);
  };

  // Check Web Bluetooth support and auto-detect server LAN URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isSec = !!window.isSecureContext;
      setIsSecureContext(isSec);
      const hasBle = !!navigator.bluetooth;
      setBluetoothSupported(hasBle);

      // Auto-detect backend LAN IP & port from /api/info
      apiClient
        .getServerInfo()
        .then((info) => {
          if (info.lanIps && info.lanIps.length > 0) {
            setAvailableLanIps(info.lanIps);
            setBackendUrl(`http://${info.lanIps[0]}:${info.port}`);
          }
        })
        .catch(() => {
          // Fallback to location hostname
          if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
            setBackendUrl(`http://${window.location.hostname}:5000`);
          }
        });
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // 1. Connect over Web Bluetooth
  const handleConnectBluetooth = async () => {
    setErrorMsg(null);
    setIsBusy(true);

    if (!navigator.bluetooth) {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setErrorMsg(
          `Web Bluetooth is disabled on "${window.location.origin}" because Chromium requires a Secure Context (localhost or HTTPS). Please open http://localhost:3000 in your browser.`
        );
      } else {
        setErrorMsg(
          "Web Bluetooth is not enabled in Microsoft Edge or Chrome. In Edge, enable it at edge://flags/#enable-web-bluetooth (restart Edge), and ensure Windows Bluetooth is turned ON."
        );
      }
      setIsBusy(false);
      return;
    }

    try {
      addLog("Opening Bluetooth device chooser for prefix 'NPG'...");

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "NPG" }],
        optionalServices: [
          NV_SERVICE_UUID,
          CHORDS_SERVICE_UUID,
          "battery_service",
          "generic_access",
          "generic_attribute",
        ],
      });

      setBleDeviceName(device.name || "NPG Lite Device");
      addLog(`Selected device: ${device.name || "NPG Lite"}`);



      device.addEventListener("gattserverdisconnected", () => {
        addLog("Device Bluetooth disconnected");
      });

      addLog("Connecting to GATT server...");
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Could not connect to Bluetooth GATT server");
      gattServerRef.current = server;

      addLog("Accessing NPG Lite Primary Service...");
      let service: BluetoothRemoteGATTService | null = null;
      try {
        service = await server.getPrimaryService(NV_SERVICE_UUID);
      } catch {
        addLog("Direct service lookup failed; discovering all services on board...");
        try {
          const allServices = await server.getPrimaryServices();
          const foundUuids = allServices.map((s) => s.uuid);
          addLog(`Discovered ${allServices.length} service(s) on board: ${foundUuids.join(", ")}`);
          service = allServices.find((s) => s.uuid.toLowerCase() === NV_SERVICE_UUID.toLowerCase()) || null;
        } catch (enumErr: unknown) {
          addLog(`Service discovery error: ${enumErr instanceof Error ? enumErr.message : String(enumErr)}`);
        }
      }

      if (!service) {
        throw new Error(
          `Service ${NV_SERVICE_UUID} not found on ${device.name}. ` +
          `If this board has factory firmware, please flash 'NetraVaani-Device-Kit-v1.1.1/NetraVaani-Device' in Arduino IDE. ` +
          `If you recently flashed it, unpair '${device.name}' in Windows Bluetooth Settings to clear Windows's cached GATT services.`
        );
      }

      identityCharRef.current = await service.getCharacteristic(NV_IDENTITY_UUID);
      provisionCharRef.current = await service.getCharacteristic(NV_PROVISION_UUID);
      const statusChar = await service.getCharacteristic(NV_STATUS_UUID);
      statusCharRef.current = statusChar;

      // Subscribe to real-time status and gesture notifications
      statusChar.addEventListener("characteristicvaluechanged", (event: Event) => {
        const target = event.target as unknown as { value: DataView };
        if (target && target.value) {
          const text = new TextDecoder().decode(target.value);
          addLog(`[Device] ${text}`);

          try {
            const m = JSON.parse(text);
            if (m.type === "gesture") {
              setGestureCounts((prev) => ({
                ...prev,
                [m.name || m.gestureId]: (prev[m.name || m.gestureId] || 0) + 1,
              }));
            }
          } catch {
            // Non-JSON status log
          }
        }
      });

      await statusChar.startNotifications();
      addLog("Subscribed to live device status notifications");

      // Read device identity immediately
      await readIdentity();

      setStep("IDENTITY_READ");
      addLog("Connected and identity read successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bluetooth connection cancelled or failed";
      setErrorMsg(msg);
      addLog(`Bluetooth error: ${msg}`);
    } finally {
      setIsBusy(false);
    }
  };

  // Read device identity characteristic
  const readIdentity = async () => {
    if (!identityCharRef.current) return;
    try {
      addLog("Reading hardware identity characteristic...");
      const val = await identityCharRef.current.readValue();
      const text = new TextDecoder().decode(val);
      const idObj: BleDeviceIdentity = JSON.parse(text);
      setDeviceIdentity(idObj);
      addLog(`Hardware ID: ${idObj.hardwareId} | Firmware: ${idObj.firmware || "N/A"}`);
      if (idObj.deviceId) {
        setRegisteredDeviceId(idObj.deviceId);
      }
    } catch (err: unknown) {
      addLog(`Failed reading identity: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 2. Register hardwareId with Netravaani Backend
  const handleRegisterDevice = async () => {
    if (!deviceIdentity?.hardwareId) {
      setErrorMsg("No hardware ID available to register");
      return;
    }

    setErrorMsg(null);
    setIsBusy(true);
    addLog(`Registering hardware ID ${deviceIdentity.hardwareId} with backend...`);

    try {
      const res = await apiClient.registerEsp32Device({
        hardwareId: deviceIdentity.hardwareId,
        name: bleDeviceName || `NPG-Lite-${deviceIdentity.hardwareId.replace(/[^a-zA-Z0-9]/g, "").slice(-6)}`,
        firmwareVersion: deviceIdentity.firmware,
      });

      const { deviceId, token } = res.data;
      setRegisteredDeviceId(deviceId);
      setRegisteredToken(token);
      addLog(`Registered successfully! Device ID: ${deviceId}`);
      setStep("WIFI_PROVISION");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setErrorMsg(msg);
      addLog(`Backend registration error: ${msg}`);
    } finally {
      setIsBusy(false);
    }
  };

  // 3. Send Wi-Fi Provisioning Command via BLE
  const handleSendProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) {
      setErrorMsg("Wi-Fi network name (SSID) is required");
      return;
    }
    if (!backendUrl.trim()) {
      setErrorMsg("Backend URL is required");
      return;
    }
    if (!registeredDeviceId.trim() || !registeredToken.trim()) {
      setErrorMsg("Device must be registered before provisioning");
      return;
    }

    setErrorMsg(null);
    setIsBusy(true);

    const cmd = {
      cmd: "provision",
      ssid: ssid.trim(),
      password: password,
      api: backendUrl.trim(),
      deviceId: registeredDeviceId.trim(),
      token: registeredToken.trim(),
    };

    if (provisionCharRef.current) {
      addLog(`Sending provision command to ESP32: SSID "${cmd.ssid}", API "${cmd.api}"...`);
      try {
        const payload = new TextEncoder().encode(JSON.stringify(cmd));
        await provisionCharRef.current.writeValueWithResponse(payload);
        addLog("Settings written to device over BLE. Device is now connecting to Wi-Fi...");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed writing provisioning settings to device";
        setErrorMsg(msg);
        addLog(`Provision error: ${msg}`);
        setIsBusy(false);
        return;
      }
    } else {
      addLog(`Settings recorded for ${registeredDeviceId}. Device connecting to Wi-Fi network "${cmd.ssid}"...`);
    }

    setStep("VERIFYING_HEARTBEAT");
    startHeartbeatVerification(registeredDeviceId.trim());
  };

  // Send Test Alarm command (from device kit)
  const handleTestAlarm = async () => {
    if (!provisionCharRef.current) return;
    try {
      addLog("Sending test_alarm command...");
      const cmd = { cmd: "test_alarm" };
      await provisionCharRef.current.writeValueWithResponse(new TextEncoder().encode(JSON.stringify(cmd)));
      addLog("Alarm test command sent (board LEDs should pulse)");
    } catch (err: unknown) {
      addLog(`Test alarm error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCalibrateRest = async () => {
    if (!provisionCharRef.current) return;
    try {
      addLog("Sending cal_rest command (keep still 4.5s)...");
      const cmd = { cmd: "cal_rest" };
      await provisionCharRef.current.writeValueWithResponse(new TextEncoder().encode(JSON.stringify(cmd)));
      addLog("Baseline recalibration started");
    } catch (err: unknown) {
      addLog(`Calibration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCalibrateUp = async () => {
    if (!provisionCharRef.current) return;
    try {
      addLog("Sending cal_up command (look up and hold)...");
      const cmd = { cmd: "cal_up" };
      await provisionCharRef.current.writeValueWithResponse(new TextEncoder().encode(JSON.stringify(cmd)));
      addLog("Look-up calibration command sent");
    } catch (err: unknown) {
      addLog(`Calibration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCalibrateDown = async () => {
    if (!provisionCharRef.current) return;
    try {
      addLog("Sending cal_down command (look down and hold)...");
      const cmd = { cmd: "cal_down" };
      await provisionCharRef.current.writeValueWithResponse(new TextEncoder().encode(JSON.stringify(cmd)));
      addLog("Look-down calibration command sent");
    } catch (err: unknown) {
      addLog(`Calibration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 4. Poll for authoritative heartbeat from real ESP32
  const startHeartbeatVerification = (targetDeviceId: string) => {
    let attempts = 0;
    setVerificationPollCount(0);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      setVerificationPollCount(attempts);
      addLog(`Checking for live heartbeat from ${targetDeviceId} (Attempt ${attempts}/30)...`);

      try {
        const res = await apiClient.getDevice(targetDeviceId);
        const dev = res.data;

        if (dev.connectivityStatus === "ONLINE") {
          addLog(`Valid heartbeat received! Device is ONLINE (Last seen: ${new Date(dev.lastSeenAt || "").toLocaleTimeString()})`);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setVerifiedDevice(dev);
          setStep("COMMISSIONED");
          setIsBusy(false);
        } else if (attempts >= 30) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setErrorMsg(
            "Heartbeat timeout: ESP32 has not contacted the backend yet. Check Wi-Fi password, 2.4 GHz network availability, and ensure your laptop firewall allows port 5000."
          );
          setIsBusy(false);
        }
      } catch {
        // Continue polling until max attempts
        if (attempts >= 30) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setErrorMsg("Heartbeat verification timed out. Please check device Wi-Fi status.");
          setIsBusy(false);
        }
      }
    }, 2000);
  };

  const handleFinish = () => {
    if (verifiedDevice) {
      onDeviceCommissioned(verifiedDevice);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#30251F]/70 backdrop-blur-sm flex items-center justify-center p-4 selection:bg-[#EED9CD]">
      <div className="bg-[#FFFCF7] border border-[#E7DFD4] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-[#30251F]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E7DFD4]">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-[#EED9CD]/60 border border-[#C56845]/30 flex items-center justify-center text-[#C56845]">
              <Bluetooth className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-[#30251F] text-lg leading-tight">
                NPG Lite Device Commissioning
              </h3>
              <span className="text-xs text-[#75665D]">
                GATT Bluetooth pairing, identity verification &amp; Wi-Fi provisioning (Protocol v1.1.1)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#75665D] hover:text-[#30251F] p-1.5 rounded-lg hover:bg-[#F5F0E8] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Step Pipeline Indicator */}
        <div className="flex items-center justify-between bg-[#F5F0E8] p-2.5 rounded-xl text-xs font-semibold text-[#75665D] border border-[#E7DFD4]">
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              step === "BLUETOOTH_CONNECT" ? "bg-[#FFFCF7] shadow-xs text-[#C56845] font-bold" : ""
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" /> 1. Bluetooth
          </span>
          <ArrowRight className="w-3 h-3 text-[#A2948B]" />
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              step === "IDENTITY_READ" ? "bg-[#FFFCF7] shadow-xs text-[#C56845] font-bold" : ""
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> 2. Identity
          </span>
          <ArrowRight className="w-3 h-3 text-[#A2948B]" />
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              step === "WIFI_PROVISION" ? "bg-[#FFFCF7] shadow-xs text-[#C56845] font-bold" : ""
            }`}
          >
            <Wifi className="w-3.5 h-3.5" /> 3. Provision
          </span>
          <ArrowRight className="w-3 h-3 text-[#A2948B]" />
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              step === "VERIFYING_HEARTBEAT" || step === "COMMISSIONED"
                ? "bg-[#FFFCF7] shadow-xs text-emerald-800 font-bold"
                : ""
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> 4. Verify
          </span>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Commissioning Error:</span>
              <p className="leading-relaxed">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 1: BLUETOOTH PAIRING & CAPABILITY CHECK */}
        {step === "BLUETOOTH_CONNECT" && (
          <div className="space-y-4 my-auto py-1">
            <div className="p-6 bg-[#F5F0E8] border border-[#E7DFD4] rounded-2xl text-center space-y-3">
              <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#EED9CD] animate-ping opacity-60" />
                <div className="relative h-12 w-12 rounded-full bg-[#C56845] text-white flex items-center justify-center shadow-md">
                  <Bluetooth className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h4 className="font-serif font-bold text-base text-[#30251F]">Connect NPG Lite Device via Bluetooth</h4>
                <p className="text-xs text-[#75665D] max-w-md mx-auto mt-1 leading-relaxed">
                  Ensure the NPG Lite / ESP32 board is powered on. If previously provisioned, press the board&apos;s
                  <strong className="text-[#30251F]"> RESET</strong> button (or hold BOOT for 3s) to open the 5-minute setup window.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleConnectBluetooth}
                  disabled={isBusy}
                  className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#C56845] hover:bg-[#B05534] text-white shadow-xs transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                  <span>Connect NPG Lite</span>
                </button>
              </div>

              {/* Edge / Browser Diagnostics Banner */}
              {!bluetoothSupported && (
                <div className="pt-2 text-left space-y-2">
                  {!isSecureContext ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        Chromium Security Rule: Non-Localhost Origin
                      </p>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        You are browsing on <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">{typeof window !== "undefined" ? window.location.origin : ""}</code>.
                        Chromium (Edge &amp; Chrome) strictly removes Web Bluetooth on non-localhost HTTP addresses.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") window.location.href = "http://localhost:3000";
                        }}
                        className="px-3 py-1.5 rounded-lg font-bold bg-[#04c8c8] text-white hover:bg-[#03adad] transition text-xs shadow-xs"
                      >
                        Switch to http://localhost:3000
                      </button>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-slate-700 space-y-2">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-blue-600 shrink-0" />
                        How to Enable Web Bluetooth in Microsoft Edge:
                      </p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px]">
                        <li>Open a new tab and paste: <code className="font-mono bg-blue-100 px-1 py-0.5 rounded font-bold text-slate-900 select-all">edge://flags/#enable-web-bluetooth</code></li>
                        <li>Set <strong>Web Bluetooth</strong> to <strong>Enabled</strong>.</li>
                        <li>Click the <strong>Restart</strong> button at the bottom of Edge.</li>
                        <li>Ensure Bluetooth is turned ON in Windows Quick Settings (<kbd className="font-mono bg-white px-1 border rounded">Win + A</kbd>).</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: IDENTITY READ & BACKEND REGISTRATION */}
        {step === "IDENTITY_READ" && deviceIdentity && (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="p-4 bg-[#F5F0E8] border border-[#E7DFD4] rounded-2xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E7DFD4]">
                <span className="font-bold text-xs text-[#30251F] flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-[#C56845]" />
                  Verified Hardware Identity (Read over BLE)
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  BLE GATT Connected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Hardware MAC ID</span>
                  <span className="font-mono font-bold text-slate-900 block truncate">
                    {deviceIdentity.hardwareId}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Firmware Version</span>
                  <span className="font-mono text-slate-800 block">
                    {deviceIdentity.firmware || "v1.1.1-esp32"}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Battery Level</span>
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5" /> {deviceIdentity.battery || 100}%
                  </span>
                </div>
              </div>

              {/* nv-2.0.0 Calibration & Diagnostics status */}
              {(deviceIdentity.calEog || deviceIdentity.calEmg || deviceIdentity.seqState) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">EOG Calibration</span>
                    <span className="font-bold text-slate-800 uppercase block">{deviceIdentity.calEog || "-"}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">EMG Calibration</span>
                    <span className="font-bold text-slate-800 uppercase block">{deviceIdentity.calEmg || "-"}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Detector State</span>
                    <span className="font-mono text-slate-800 block">{deviceIdentity.seqState || "IDLE"}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Reset Source</span>
                    <span className="font-mono text-slate-800 block">{deviceIdentity.lastReset || "POWERON"}</span>
                  </div>
                </div>
              )}

              {deviceIdentity.channels && (
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs">
                  <span className="text-[10px] text-slate-500 block mb-1">Analog BioAmp Channels:</span>
                  <div className="flex items-center gap-2">
                    {deviceIdentity.channels.map((ch, idx) => (
                      <span
                        key={idx}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          ch === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        Channel {idx + 1}: {ch.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={readIdentity}
                disabled={isBusy}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-read Identity
              </button>

              <button
                type="button"
                onClick={handleRegisterDevice}
                disabled={isBusy}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#C56845] hover:bg-[#B05534] text-white shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Register with Backend &amp; Continue &rarr;</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: WI-FI PROVISIONING & SEND SETTINGS */}
        {step === "WIFI_PROVISION" && (
          <form onSubmit={handleSendProvisioning} className="space-y-4 overflow-y-auto pr-1">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-800">Assigned Backend Credentials</span>
                <span className="font-mono text-[10px] text-slate-500">
                  App Device ID: <strong>{registeredDeviceId}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-slate-200 truncate">
                  <span className="text-[10px] text-slate-400 block font-sans">Device ID:</span>
                  {registeredDeviceId}
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200 truncate">
                  <span className="text-[10px] text-slate-400 block font-sans">Token (Bearer):</span>
                  {registeredToken ? `${registeredToken.slice(0, 16)}...` : "Generated"}
                </div>
              </div>
            </div>

            {/* Wi-Fi & Backend URL Inputs */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Wi-Fi Network Name (2.4 GHz SSID) *
                </label>
                <input
                  type="text"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  placeholder="e.g. Hospital-Guest or Home-WiFi"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-[#59c7f3]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Wi-Fi Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Wi-Fi password (leave blank if open network)"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-[#59c7f3]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Backend URL the Device Will Use *
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Must be reachable LAN IP (not localhost)
                  </span>
                </div>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://192.168.1.100:5000"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-[#59c7f3]"
                  required
                />
                {availableLanIps.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span>Detected LAN IPs:</span>
                    {availableLanIps.map((ip) => (
                      <button
                        key={ip}
                        type="button"
                        onClick={() => setBackendUrl(`http://${ip}:5000`)}
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[#0284c7] underline"
                      >
                        {ip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestAlarm}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
              >
                Test Alarm LED
              </button>

              <button
                type="submit"
                disabled={isBusy || !ssid.trim() || !backendUrl.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#C56845] hover:bg-[#B05534] text-white shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                <span>Send Settings to Device</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: VERIFYING REAL HEARTBEAT FROM ESP32 */}
        {step === "VERIFYING_HEARTBEAT" && (
          <div className="p-6 text-center space-y-4 my-auto bg-[#F5F0E8] border border-[#E7DFD4] rounded-2xl">
            <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#EED9CD] animate-ping opacity-60" />
              <div className="relative h-12 w-12 rounded-full bg-[#C56845] text-white flex items-center justify-center shadow-md">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            </div>
            <div>
              <h4 className="font-serif font-bold text-base text-[#30251F]">
                Verifying Wi-Fi &amp; Waiting for Authoritative Heartbeat...
              </h4>
              <p className="text-xs text-[#75665D] mt-1 max-w-md mx-auto leading-relaxed">
                Provisioning packet configured. The ESP32 is connecting to &ldquo;{ssid}&rdquo; and transmitting its initial HTTP heartbeat to Netravaani backend.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFCF7] text-[#30251F] text-xs font-mono border border-[#E7DFD4]">
              <RefreshCw className="w-3 h-3 animate-spin text-[#C56845]" />
              <span>Checking backend: Attempt {verificationPollCount}/30</span>
            </div>

          </div>
        )}

        {/* STEP 5: VERIFIED & COMMISSIONED ONLINE */}
        {step === "COMMISSIONED" && verifiedDevice && (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-950">
                  Device Verified &amp; ONLINE!
                </h4>
                <p className="text-xs text-emerald-700">
                  Real HTTP heartbeat received from hardware over Wi-Fi. Device is authoritative and active.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-800">Confirmed Device Telemetry</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">App Device ID</span>
                  <span className="font-mono font-bold text-slate-900 block truncate">
                    {verifiedDevice.deviceId}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Hardware MAC</span>
                  <span className="font-mono font-bold text-slate-900 block truncate">
                    {verifiedDevice.hardwareId}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Status</span>
                  <span className="font-bold text-slate-900 block">
                    {verifiedDevice.status}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Firmware</span>
                  <span className="font-mono text-slate-800 block">
                    {verifiedDevice.firmwareVersion || "v1.1.1-esp32"}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Config State</span>
                  <span className="text-slate-800 font-mono block">
                    v{verifiedDevice.appliedConfigVersion || 1} (Applied)
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Last Seen</span>
                  <span className="text-emerald-700 font-bold block">
                    {new Date(verifiedDevice.lastSeenAt || "").toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleFinish}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#C56845] hover:bg-[#B05534] text-white shadow-xs transition flex items-center gap-1.5"
              >
                <span>Finish &amp; View in Registry</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Eye Calibration (nv-2.0.0 Section 4) */}
        {provisionCharRef.current && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Eye Calibration (Per-Patient)</span>
              <span className="text-[11px] text-slate-400">Run while patient is wearing electrodes</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCalibrateRest}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition"
              >
                1. Recalibrate (Keep Still 4.5s)
              </button>
              <button
                type="button"
                onClick={handleCalibrateUp}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition"
              >
                2. Calibrate UP (Look Up)
              </button>
              <button
                type="button"
                onClick={handleCalibrateDown}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition"
              >
                3. Calibrate DOWN (Look Down)
              </button>
              <button
                type="button"
                onClick={handleTestAlarm}
                className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[11px] font-semibold text-amber-800 transition"
              >
                Test Alarm LEDs
              </button>
            </div>
          </div>
        )}

        {/* Live Device Log & Gesture Counters (from nv-setup.html Section 4) */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              Live Device Messages &amp; BLE Notifications
            </span>
            {Object.keys(gestureCounts).length > 0 && (
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#0284c7]">
                {Object.entries(gestureCounts).map(([name, count]) => (
                  <span key={name} className="bg-[#59c7f3]/15 px-1.5 py-0.5 rounded">
                    {name}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="bg-slate-900 text-slate-200 p-2.5 rounded-xl font-mono text-[11px] max-h-28 overflow-y-auto space-y-0.5 select-all">
            {logs.length === 0 ? (
              <span className="text-slate-500 italic">No messages yet. Logs will appear here when connected over BLE.</span>
            ) : (
              logs.map((line, idx) => <div key={idx} className="leading-tight">{line}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
