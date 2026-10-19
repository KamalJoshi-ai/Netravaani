import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import {
  Device,
  Patient,
  DeviceAssignment,
  DeviceConfig,
  CareRequest,
} from "../src/models/index.js";
import {
  deviceService,
  checkConnectivityTimeouts,
  stopConnectivityWatchdog,
} from "../src/services/deviceService.js";

describe("ESP32 Wi-Fi Device Connection System", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
  });

  afterAll(async () => {
    stopConnectivityWatchdog();
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Device.deleteMany({});
    await Patient.deleteMany({});
    await DeviceAssignment.deleteMany({});
    await DeviceConfig.deleteMany({});
    await CareRequest.deleteMany({});
  });

  describe("Feature 1: Backend Network & Health Endpoint Accessibility", () => {
    it("GET /api/health responds with 200 OK and valid health telemetry", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ok");
      expect(res.body).toHaveProperty("service", "netravaani-backend");
      expect(res.body).toHaveProperty("timestamp");
      expect(typeof res.body.uptime).toBe("number");
    });

    it("GET /api/v1/health alias endpoint also responds with 200 OK", async () => {
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("GET /api/health/ready responds with 200 OK and database connectivity", async () => {
      const res = await request(app).get("/api/health/ready");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ready");
      expect(res.body.database).toHaveProperty("connected", true);
    });
  });

  describe("Feature 3: ESP32 Wi-Fi Registration & Idempotency", () => {
    it("provisions a new ESP32 device with stable hardware identity and returns minimal credentials", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "24:6F:28:AB:CD:EF",
          name: "Bedside ESP32 Unit 1",
          firmwareVersion: "v1.2.0-esp32",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("deviceId");
      expect(res.body.data.deviceId).toMatch(/^npg-[a-f0-9]{8}$/);
      expect(res.body.data.hardwareId).toBe("24:6F:28:AB:CD:EF");
      expect(res.body.data.registered).toBe(true);
      expect(res.body.data.isNew).toBe(true);

      // Verify stored record in database
      const dbDevice = await Device.findOne({ hardwareId: "24:6F:28:AB:CD:EF" });
      expect(dbDevice).not.toBeNull();
      expect(dbDevice?.hardwareIdVerified).toBe(true);
      expect(dbDevice?.isDevRegistration).toBe(false);
      expect(dbDevice?.registrationSource).toBe("ESP32_WIFI");
      expect(dbDevice?.connectivityStatus).toBe("NEVER_SEEN"); // Never seen until first heartbeat
    });

    it("is completely idempotent: repeated requests with same hardwareId do not create duplicate devices", async () => {
      // First registration
      const firstRes = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "ESP32-CHIP-998877",
          firmwareVersion: "v1.0.0",
        });
      expect(firstRes.status).toBe(201);
      const generatedDeviceId = firstRes.body.data.deviceId;

      // Second registration (e.g. ESP32 reboot / re-connect)
      const secondRes = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "ESP32-CHIP-998877",
          firmwareVersion: "v1.0.1",
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.status).toBe("success");
      expect(secondRes.body.data.deviceId).toBe(generatedDeviceId);
      expect(secondRes.body.data.isNew).toBe(false);
      expect(secondRes.body.data.registered).toBe(true);

      // Verify that exactly 1 device exists in the database
      const count = await Device.countDocuments({ hardwareId: "ESP32-CHIP-998877" });
      expect(count).toBe(1);

      // Verify firmware was updated
      const updated = await Device.findOne({ hardwareId: "ESP32-CHIP-998877" });
      expect(updated?.firmwareVersion).toBe("v1.0.1");
    });

    it("supports ESP32 registration via primary POST /api/devices with registrationSource", async () => {
      const res = await request(app)
        .post("/api/devices")
        .send({
          hardwareId: "ESP32-WIFI-PRIMARY",
          registrationSource: "ESP32_WIFI",
          firmwareVersion: "v2.0.0",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.hardwareId).toBe("ESP32-WIFI-PRIMARY");
      expect(res.body.data.registered).toBe(true);
    });

    it("does not trust client-supplied application deviceId during registration", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          deviceId: "npg-fakeclientid",
          hardwareId: "ESP32-LEGIT-1234",
        });

      expect(res.status).toBe(201);
      // The backend must issue its own authentic generated deviceId
      expect(res.body.data.deviceId).not.toBe("npg-fakeclientid");
      expect(res.body.data.deviceId).toMatch(/^npg-[a-f0-9]{8}$/);
    });
  });

  describe("Invalid Hardware Identity Validation", () => {
    it("rejects registration when hardwareId is missing", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          firmwareVersion: "v1.0.0",
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe("error");
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration when hardwareId is too short (< 3 chars)", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "AB",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration when hardwareId contains illegal characters (spaces, special symbols)", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "ESP32 WITH SPACES",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");

      const res2 = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: "ESP32$#!@BAD",
        });

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe("VALIDATION_ERROR");
    });

    it("preserves Phase 2 requirement: rejects dev registration without isDevRegistration: true", async () => {
      const res = await request(app)
        .post("/api/devices")
        .send({
          name: "Bedside Monitor",
          hardwareId: "ESP32-DEV-REJECT",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Feature 4: Heartbeat & Device Connectivity", () => {
    let testDeviceId: string;
    const testHardwareId = "ESP32-HB-TEST-01";

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/devices/esp32/register")
        .send({
          hardwareId: testHardwareId,
          name: "Telemetry Test Device",
          firmwareVersion: "v1.0.0",
        });
      testDeviceId = reg.body.data.deviceId;
    });

    it("newly registered device retains NEVER_SEEN status until first valid heartbeat", async () => {
      const res = await request(app).get(`/api/devices/${testDeviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.connectivityStatus).toBe("NEVER_SEEN");
      expect(res.body.data.lastSeenAt).toBeUndefined();
    });

    it("valid heartbeat by URL deviceId updates lastSeenAt to server time and transitions status to ONLINE", async () => {
      const beforeTime = Date.now();
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/heartbeat`)
        .send({
          firmwareVersion: "v1.0.1",
          configVersionApplied: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.connectivityStatus).toBe("ONLINE");
      expect(res.body.data.lastSeenAt).toBeDefined();

      const lastSeenEpoch = new Date(res.body.data.lastSeenAt).getTime();
      expect(lastSeenEpoch).toBeGreaterThanOrEqual(beforeTime - 1000);
    });

    it("valid heartbeat by payload hardwareId sets device to ONLINE", async () => {
      const res = await request(app)
        .post("/api/devices/heartbeat")
        .send({
          hardwareId: testHardwareId,
          firmwareVersion: "v1.0.2",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.deviceId).toBe(testDeviceId);
      expect(res.body.data.connectivityStatus).toBe("ONLINE");
    });

    it("valid heartbeat via /api/devices/esp32/heartbeat alias sets device to ONLINE", async () => {
      const res = await request(app)
        .post("/api/devices/esp32/heartbeat")
        .send({
          hardwareId: testHardwareId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.connectivityStatus).toBe("ONLINE");
    });

    it("rejects heartbeat with non-existent device identifier", async () => {
      const res = await request(app)
        .post("/api/devices/npg-nonexistent/heartbeat")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("DEVICE_NOT_FOUND");
    });

    it("rejects heartbeat when payload deviceId contradicts URL deviceId", async () => {
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/heartbeat`)
        .send({
          deviceId: "npg-differentid",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DEVICE_ID_MISMATCH");
    });

    it("rejects heartbeat for DISABLED device", async () => {
      await Device.updateOne({ deviceId: testDeviceId }, { status: "DISABLED" });

      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/heartbeat`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DEVICE_DISABLED");
    });

    it("repeated heartbeats update the device in-place without creating extra records", async () => {
      const countBefore = await Device.countDocuments({});

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/devices/${testDeviceId}/heartbeat`)
          .send({ firmwareVersion: `v1.0.${i}` });
      }

      const countAfter = await Device.countDocuments({});
      expect(countAfter).toBe(countBefore);
    });

    it("device transitions to OFFLINE when heartbeat timeout has expired", async () => {
      // Send heartbeat in the past (exceeding default 60s timeout)
      const pastDate = new Date(Date.now() - 65 * 1000);
      await Device.updateOne(
        { deviceId: testDeviceId },
        { lastSeenAt: pastDate, connectivityStatus: "ONLINE" }
      );

      // Querying the device dynamically computes OFFLINE
      const devRes = await request(app).get(`/api/devices/${testDeviceId}`);
      expect(devRes.status).toBe(200);
      expect(devRes.body.data.connectivityStatus).toBe("OFFLINE");

      // Watchdog marks it as OFFLINE in DB
      const sweptCount = await checkConnectivityTimeouts(60000);
      expect(sweptCount).toBe(1);

      const dbDev = await Device.findOne({ deviceId: testDeviceId });
      expect(dbDev?.connectivityStatus).toBe("OFFLINE");

      // New heartbeat brings it back to ONLINE
      const recoverRes = await request(app)
        .post(`/api/devices/${testDeviceId}/heartbeat`)
        .send({});
      expect(recoverRes.status).toBe(200);
      expect(recoverRes.body.data.connectivityStatus).toBe("ONLINE");
    });
  });

  describe("Preservation of Care Requests & Assignments When Device Goes Offline", () => {
    it("ensures care requests and patient assignments remain completely unchanged when device goes OFFLINE", async () => {
      // 1. Register ESP32 device
      const reg = await request(app)
        .post("/api/devices/esp32/register")
        .send({ hardwareId: "ESP32-CARE-OFFLINE-TEST" });
      const devId = reg.body.data.deviceId;

      // 2. Register Patient
      const ptRes = await request(app)
        .post("/api/patients")
        .send({ displayName: "Priya Sharma", bedLabel: "Bed-ICU-03" });
      const ptCode = ptRes.body.data.patientCode;

      // 3. Assign Device to Patient
      await request(app)
        .post(`/api/devices/${devId}/assign`)
        .send({ patientCode: ptCode });

      // 4. Configure gesture and send initial heartbeat
      await request(app).post(`/api/devices/${devId}/heartbeat`).send({});
      await request(app)
        .post(`/api/devices/${devId}/configs`)
        .send({
          mappings: [{ gestureId: "LOOK_UP", action: "NEED_WATER" }],
        });

      // 5. Ingest recognized care request
      const eventRes = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-offline-test-001",
          deviceId: devId,
          gestureId: "LOOK_UP",
          // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
          configVersion: 2,
        });
      expect(eventRes.status).toBe(201);
      const reqId = eventRes.body.data._id;

      // 6. Device goes OFFLINE due to timeout
      await Device.updateOne(
        { deviceId: devId },
        { lastSeenAt: new Date(Date.now() - 120 * 1000), connectivityStatus: "OFFLINE" }
      );
      await checkConnectivityTimeouts(60000);

      // 7. Verify device is OFFLINE
      const devCheck = await request(app).get(`/api/devices/${devId}`);
      expect(devCheck.body.data.connectivityStatus).toBe("OFFLINE");

      // 8. CRITICAL INVARIANT: Verify Patient Assignment is STILL ACTIVE
      const activeAssign = await DeviceAssignment.findOne({
        device: devCheck.body.data._id,
        isActive: true,
      });
      expect(activeAssign).not.toBeNull();
      expect(devCheck.body.data.currentAssignment).not.toBeNull();

      // 9. CRITICAL INVARIANT: Verify Care Request is STILL NEW and NOT deleted or resolved
      const careReq = await CareRequest.findById(reqId);
      expect(careReq).not.toBeNull();
      expect(careReq?.status).toBe("NEW");
    });
  });
});
