/* eslint-disable @typescript-eslint/no-explicit-any */
export interface HealthStatusResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
}

export interface ReadinessResponse {
  status: string;
  database: {
    connected: boolean;
    state: string;
  };
  timestamp: string;
}

export interface ApiResponse<T> {
  status: "success" | "error";
  message?: string;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DeviceItem {
  _id: string;
  deviceId: string;
  name: string;
  hardwareId?: string;
  hardwareIdVerified?: boolean;
  token?: string;
  status: "AVAILABLE" | "ASSIGNED" | "OFFLINE" | "DISABLED";
  connectivityStatus?: "NEVER_SEEN" | "ONLINE" | "OFFLINE";
  firmwareVersion?: string;
  lastSeenAt?: string;
  desiredConfigVersion?: number;
  appliedConfigVersion?: number;
  isDevRegistration: boolean;
  registeredBy?: string;
  createdAt: string;
  updatedAt: string;
  currentAssignment?: {
    _id: string;
    patient: {
      _id: string;
      patientCode: string;
      displayName: string;
      bedLabel?: string;
      status: "ACTIVE" | "INACTIVE";
    };
    assignedAt: string;
    isActive: boolean;
  } | null;
}

export interface DiscoveredWifiDevice {
  hardwareId: string;
  name: string;
  model: string;
  ipAddress: string;
  firmwareVersion: string;
  signalStrength: string;
  batteryLevel: number;
  sensors: string[];
  isPaired: boolean;
}

export interface WifiConnectResult {
  device: DeviceItem;
  isNew: boolean;
  handshake: {
    protocol: string;
    transport: string;
    ipAddress: string;
    batteryLevel: number;
    sensorsActive: string[];
    connectedAt: string;
  };
}

export interface PatientItem {
  _id: string;
  patientCode: string;
  displayName: string;
  bedLabel?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  currentAssignment?: {
    _id: string;
    device: {
      deviceId: string;
      name: string;
      status: string;
      firmwareVersion?: string;
      connectivityStatus?: string;
      hardwareId?: string;
    };
  } | null;
  nurseAssignment?: {
    nurseId?: string;
    nurseName?: string;
    nurseRole?: string;
    requestedAt?: string;
    approvedAt?: string;
    rejectedAt?: string;
    status: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  };
}

export interface DeviceAssignmentRecord {
  _id: string;
  device: string | DeviceItem;
  patient: PatientItem;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy?: string;
  isActive: boolean;
}

export type RequestAction =
  | "NEED_WATER"
  | "NEED_ASSISTANCE"
  | "PAIN_DISCOMFORT"
  | "REPOSITION"
  | "EMERGENCY"
  | "YES"
  | "NO"
  | "CALL_NURSE"
  | "WATER"
  | "REQUEST";

export interface PredefinedCommandItem {
  action: RequestAction;
  gestureId: string;
  gestureName: string;
  serialCommand: string;
  dashboardLabel: string;
  instruction: string;
  badgeColor: string;
  isEmergency?: boolean;
}

export interface GestureMappingItem {
  gestureId: string;
  gesture?: string;
  gestureName: string;
  action: RequestAction;
  instruction?: string;
}

export interface DeviceConfigItem {
  _id: string;
  device: string;
  version: number;
  selectionMode?: "SINGLE_TAP" | "DWELL" | "TWO_STEP_CONFIRM";
  mappings: GestureMappingItem[];
  status: "PENDING" | "APPLIED" | "FAILED";
  appliedAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export type CareRequestStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED";

export interface CareRequestItem {
  _id: string;
  eventId: string;
  device: {
    _id: string;
    deviceId: string;
    name: string;
    status: string;
  };
  patient: {
    _id: string;
    patientCode: string;
    displayName: string;
    bedLabel?: string;
    status: string;
  };
  gestureId: string;
  gesture?: string;
  urgent?: boolean;
  alarm?: boolean;
  ruleId?: string;
  label?: string;
  displayLabel?: string;
  counts?: { eog: number; emgLeft: number; emgRight: number; together: number };
  action: RequestAction;
  configVersion: number;
  status: CareRequestStatus;
  acknowledgedAt?: string;
  inProgressAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A command rule as the editor sends and receives it (device rule + dashboard name). */
export interface CommandRuleItem {
  id: string;
  label: string;
  displayLabel?: string;
  eog: [number, number];
  emgLeft: [number, number];
  emgRight: [number, number];
  simultaneous?: boolean;
  urgent?: boolean;
  alarm?: boolean;
}

export type RuleVersionStatus = "PENDING" | "APPLIED" | "FAILED";

export interface RuleVersionItem {
  version: number;
  status: RuleVersionStatus;
  error: string | null;
  appliedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  ruleCount: number;
  kind: "rules" | "legacy";
}

export interface DeviceRulesResponse {
  deviceId: string;
  rules: CommandRuleItem[];
  latestVersion: RuleVersionItem | null;
  versions: RuleVersionItem[];
  appliedConfigVersion: number | null;
  desiredConfigVersion: number | null;
  lastSeenAt: string | null;
}

/** Body of a 422 from PUT /rules. */
export interface RuleFieldError {
  rule: number | null;
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    const rawUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    // Strip trailing /v1 or slashes if present to ensure route matching
    this.baseUrl = rawUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    };

    const res = await fetch(url, { ...options, headers, credentials: "include" });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      let message = data?.message || `Request failed with status ${res.status}`;
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        message = data.errors.map((e: { path?: string; message: string }) => `${e.path ? `${e.path}: ` : ""}${e.message}`).join(", ");
      }
      throw new ApiError(
        res.status,
        data?.code || "REQUEST_FAILED",
        message,
        data
      );
    }

    return data as T;
  }

  // Health
  async getHealth(): Promise<HealthStatusResponse> {
    return this.request<HealthStatusResponse>("/health");
  }

  async getReadiness(): Promise<ReadinessResponse> {
    return this.request<ReadinessResponse>("/health/ready");
  }

  async checkBackendHealth(): Promise<{ isOnline: boolean; uptime?: number; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const res = await this.getHealth();
      const latencyMs = Date.now() - start;
      return { isOnline: res.status === "ok", uptime: res.uptime, latencyMs };
    } catch (err: unknown) {
      return {
        isOnline: false,
        error: err instanceof Error ? err.message : "Backend unreachable",
        latencyMs: Date.now() - start,
      };
    }
  }

  // Devices
  async getDevices(params?: { page?: number; limit?: number; status?: string; registeredBy?: string }): Promise<ApiResponse<DeviceItem[]>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.status) searchParams.set("status", params.status);
    if (params?.registeredBy) searchParams.set("registeredBy", params.registeredBy);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<ApiResponse<DeviceItem[]>>(`/devices${query}`);
  }

  async getDevice(deviceId: string): Promise<ApiResponse<DeviceItem>> {
    return this.request<ApiResponse<DeviceItem>>(`/devices/${deviceId}`);
  }

  async registerDevice(data: {
    name: string;
    hardwareId?: string;
    firmwareVersion?: string;
    registeredBy?: string;
    isDevRegistration: true;
  }): Promise<ApiResponse<DeviceItem>> {
    return this.request<ApiResponse<DeviceItem>>("/devices", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async registerEsp32Device(data: {
    hardwareId: string;
    name?: string;
    firmwareVersion?: string;
    registeredBy?: string;
  }): Promise<ApiResponse<{ deviceId: string; hardwareId: string; token: string; name: string; status: string; registered: boolean; isNew: boolean }>> {
    return this.request<ApiResponse<{ deviceId: string; hardwareId: string; token: string; name: string; status: string; registered: boolean; isNew: boolean }>>("/devices/esp32/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async registerDeviceDirect(hardwareId: string): Promise<{ deviceId: string; token: string }> {
    return this.request<{ deviceId: string; token: string }>("/devices/register", {
      method: "POST",
      body: JSON.stringify({ hardwareId }),
    });
  }

  async getServerInfo(): Promise<{ port: number; lanIps: string[]; status: string; service: string }> {
    return this.request<{ port: number; lanIps: string[]; status: string; service: string }>("/info");
  }

  async discoverWifiDevices(): Promise<ApiResponse<DiscoveredWifiDevice[]>> {
    return this.request<ApiResponse<DiscoveredWifiDevice[]>>("/devices/discover");
  }

  async connectWifiDevice(data: {
    hardwareId: string;
    name?: string;
    firmwareVersion?: string;
    ipAddress?: string;
    registeredBy?: string;
  }): Promise<ApiResponse<WifiConnectResult>> {
    return this.request<ApiResponse<WifiConnectResult>>("/devices/wifi-connect", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDevice(
    deviceId: string,
    data: { name?: string; firmwareVersion?: string }
  ): Promise<ApiResponse<DeviceItem>> {
    return this.request<ApiResponse<DeviceItem>>(`/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Assignments
  async getDeviceAssignments(deviceId: string): Promise<ApiResponse<DeviceAssignmentRecord[]>> {
    return this.request<ApiResponse<DeviceAssignmentRecord[]>>(`/devices/${deviceId}/assignments`);
  }

  async assignDevice(
    deviceId: string,
    data: { patientCode: string; assignedBy?: string }
  ): Promise<ApiResponse<DeviceAssignmentRecord>> {
    return this.request<ApiResponse<DeviceAssignmentRecord>>(`/devices/${deviceId}/assign`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async unassignDevice(deviceId: string): Promise<ApiResponse<DeviceAssignmentRecord>> {
    return this.request<ApiResponse<DeviceAssignmentRecord>>(`/devices/${deviceId}/unassign`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  // Configurations
  async getDeviceConfigs(deviceId: string): Promise<ApiResponse<DeviceConfigItem[]>> {
    return this.request<ApiResponse<DeviceConfigItem[]>>(`/devices/${deviceId}/configs`);
  }

  // Command rules (firmware nv-4.0.0)
  async getCommandRules(deviceId: string): Promise<ApiResponse<DeviceRulesResponse>> {
    return this.request<ApiResponse<DeviceRulesResponse>>(`/devices/${deviceId}/rules`);
  }

  async saveCommandRules(deviceId: string, rules: CommandRuleItem[]): Promise<ApiResponse<RuleVersionItem>> {
    return this.request<ApiResponse<RuleVersionItem>>(`/devices/${deviceId}/rules`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    });
  }

  async resetCommandRules(deviceId: string): Promise<ApiResponse<RuleVersionItem>> {
    return this.request<ApiResponse<RuleVersionItem>>(`/devices/${deviceId}/rules/reset`, { method: "POST" });
  }

  async revertCommandRules(deviceId: string, version: number): Promise<ApiResponse<RuleVersionItem>> {
    return this.request<ApiResponse<RuleVersionItem>>(`/devices/${deviceId}/rules/revert/${version}`, { method: "POST" });
  }

  async getLatestDeviceConfig(deviceId: string): Promise<ApiResponse<DeviceConfigItem | null>> {
    return this.request<ApiResponse<DeviceConfigItem | null>>(`/devices/${deviceId}/configs/latest`);
  }

  async createDeviceConfig(
    deviceId: string,
    data: {
      selectionMode?: "SINGLE_TAP" | "DWELL" | "TWO_STEP_CONFIRM";
      mappings: GestureMappingItem[];
    }
  ): Promise<ApiResponse<DeviceConfigItem>> {
    return this.request<ApiResponse<DeviceConfigItem>>(`/devices/${deviceId}/configs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async acknowledgeDeviceConfig(
    deviceId: string,
    version: number,
    data: { status: "APPLIED" | "FAILED"; failureReason?: string; isDevSimulated?: boolean }
  ): Promise<ApiResponse<DeviceConfigItem>> {
    return this.request<ApiResponse<DeviceConfigItem>>(`/devices/${deviceId}/configs/${version}/ack`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Device Telemetry / Heartbeat
  async sendHeartbeat(
    deviceId: string,
    data?: {
      firmwareVersion?: string;
      configVersionApplied?: number;
      timestamp?: string;
      batteryLevel?: number;
      signalStrength?: number;
      status?: string;
    },
    token?: string
  ): Promise<ApiResponse<Partial<DeviceItem>>> {
    return this.request<ApiResponse<Partial<DeviceItem>>>(`/devices/${deviceId}/heartbeat`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify(data || {}),
    });
  }

  // Patients
  async getPatients(params?: { page?: number; limit?: number; status?: string }): Promise<ApiResponse<PatientItem[]>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<ApiResponse<PatientItem[]>>(`/patients${query}`);
  }

  async getPatient(patientCode: string): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}`);
  }

  async createPatient(data: {
    displayName: string;
    bedLabel?: string;
    status?: "ACTIVE" | "INACTIVE";
  }): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>("/patients", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Phase 4: Device Events & Care Requests
  async sendDeviceEvent(data: {
    eventId: string;
    deviceId: string;
    gestureId: string;
    configVersion: number;
    timestamp?: string;
  }): Promise<ApiResponse<CareRequestItem> & { isDuplicate?: boolean }> {
    return this.request<ApiResponse<CareRequestItem> & { isDuplicate?: boolean }>("/device-events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCareRequests(params?: {
    status?: string;
    deviceId?: string;
    patientCode?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<CareRequestItem[]>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.deviceId) searchParams.set("deviceId", params.deviceId);
    if (params?.patientCode) searchParams.set("patientCode", params.patientCode);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<ApiResponse<CareRequestItem[]>>(`/care-requests${query}`);
  }

  async getCareRequest(id: string): Promise<ApiResponse<CareRequestItem>> {
    return this.request<ApiResponse<CareRequestItem>>(`/care-requests/${id}`);
  }

  async acknowledgeCareRequest(id: string): Promise<ApiResponse<CareRequestItem>> {
    return this.request<ApiResponse<CareRequestItem>>(`/care-requests/${id}/acknowledge`, {
      method: "PATCH",
    });
  }

  async startHandlingCareRequest(id: string): Promise<ApiResponse<CareRequestItem>> {
    return this.request<ApiResponse<CareRequestItem>>(`/care-requests/${id}/in-progress`, {
      method: "PATCH",
    });
  }

  async resolveCareRequest(id: string): Promise<ApiResponse<CareRequestItem>> {
    return this.request<ApiResponse<CareRequestItem>>(`/care-requests/${id}/resolve`, {
      method: "PATCH",
    });
  }

  async clearAllCareRequests(): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.request<ApiResponse<{ deletedCount: number }>>("/care-requests", {
      method: "DELETE",
    });
  }

  async resolveAllCareRequests(): Promise<ApiResponse<{ modifiedCount: number }>> {
    return this.request<ApiResponse<{ modifiedCount: number }>>("/care-requests/resolve-all", {
      method: "POST",
    });
  }

  // Auth Methods
  async login(identifier: string, password: string): Promise<ApiResponse<{ id?: string; username?: string; email?: string; name: string; role: string; user?: any }>> {
    return this.request<ApiResponse<{ id?: string; username?: string; email?: string; name: string; role: string; user?: any }>>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: identifier, username: identifier, password }),
    });
  }

  async register(data: { name: string; email: string; password: string; role?: string }): Promise<ApiResponse<{ user: any }>> {
    return this.request<ApiResponse<{ user: any }>>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(token: string): Promise<ApiResponse<{ user: any; accessToken: string }>> {
    return this.request<ApiResponse<{ user: any; accessToken: string }>>(`/auth/verify-email/${token}`);
  }

  async getCurrentUser(): Promise<ApiResponse<{ id?: string; username?: string; email?: string; name: string; role: string; user?: any }>> {
    return this.request<ApiResponse<{ id?: string; username?: string; email?: string; name: string; role: string; user?: any }>>("/auth/me");
  }

  async logout(): Promise<ApiResponse<null>> {
    return this.request<ApiResponse<null>>("/auth/logout", {
      method: "POST",
    });
  }

  // Patient Methods & Bedside Authentication
  async patientLogin(patientCode: string, password = ""): Promise<ApiResponse<{ token: string; patient: PatientItem }>> {
    return this.request<ApiResponse<{ token: string; patient: PatientItem }>>("/patients/login", {
      method: "POST",
      body: JSON.stringify({ patientCode, password }),
    });
  }

  async getPatientMe(): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>("/patients/me");
  }

  async requestNurseAssignment(patientCode: string, nurseData: { nurseName: string; nurseId?: string; nurseRole?: string }): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}/request-nurse`, {
      method: "POST",
      body: JSON.stringify(nurseData),
    });
  }

  async allocateNurse(patientCode: string, nurseData: { nurseName: string; nurseId?: string; nurseRole?: string; bedLabel?: string }): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}/allocate-nurse`, {
      method: "POST",
      body: JSON.stringify(nurseData),
    });
  }

  async deallocateNurse(patientCode: string): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}/deallocate-nurse`, {
      method: "POST",
    });
  }

  async approveNurseAssignment(patientCode: string, bedLabel?: string): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}/approve-nurse`, {
      method: "POST",
      body: JSON.stringify({ bedLabel }),
    });
  }

  async rejectNurseAssignment(patientCode: string): Promise<ApiResponse<PatientItem>> {
    return this.request<ApiResponse<PatientItem>>(`/patients/${patientCode}/reject-nurse`, {
      method: "POST",
    });
  }

  async triggerPatientCommand(patientCode: string, action: string): Promise<ApiResponse<CareRequestItem>> {
    return this.request<ApiResponse<CareRequestItem>>(`/patients/${patientCode}/trigger-command`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  }

  async getPredefinedCommands(): Promise<ApiResponse<PredefinedCommandItem[]>> {
    return this.request<ApiResponse<PredefinedCommandItem[]>>("/patients/commands");
  }
}

export const apiClient = new ApiClient();
