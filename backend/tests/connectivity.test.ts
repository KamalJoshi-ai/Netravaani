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

describe("Device Connectivity Phase: Telemetry, Constraints & Delivery Foundation", () => {
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

  describe("1. Device Identity & Hardware Registration", () => {
    it("registers a device with backend-generated deviceId and provisional hardwareId", async () => {
      const res = await request(app).post("/api/devices").send({
        name: "Bedside Monitor Unit A",
        hardwareId: "ESP32C6-DEV-101",
        isDevRegistration: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.deviceId).toMatch(/^npg-[a-f0-9]{8}$/);
      expect(res.body.data.hardwareId).toBe("ESP32C6-DEV-101");
      expect(res.body.data.hardwareIdVerified).toBe(false); // Provisional
      expect(res.body.data.connectivityStatus).toBe("NEVER_SEEN");
      expect(res.body.data.lastSeenAt).toBeUndefined();
    });

    it("rejects duplicate registration of the same physical hardware ID", async () => {
      await request(app).post("/api/devices").send({
        name: "First Unit",
        hardwareId: "HW-UNIQUE-999",
        isDevRegistration: true,
      });

      const dupRes = await request(app).post("/api/devices").send({
        name: "Second Unit Claiming Same Hardware",
        hardwareId: "HW-UNIQUE-999",
        isDevRegistration: true,
      });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe("DUPLICATE_HARDWARE_ID");
    });
  });

  describe("2. Assignment Constraints & Historical Preservation", () => {
    let devIdA: string;
    let devIdB: string;
    let ptCode1: string;
    let ptCode2: string;

    beforeEach(async () => {
      const devA = await request(app).post("/api/devices").send({ name: "Device Alpha", isDevRegistration: true });
      const devB = await request(app).post("/api/devices").send({ name: "Device Beta", isDevRegistration: true });
      devIdA = devA.body.data.deviceId;
      devIdB = devB.body.data.deviceId;

      const pt1 = await request(app).post("/api/patients").send({ displayName: "Aarav Gupta", bedLabel: "Bed-01", status: "ACTIVE" });
      const pt2 = await request(app).post("/api/patients").send({ displayName: "Diya Roy", bedLabel: "Bed-02", status: "ACTIVE" });
      ptCode1 = pt1.body.data.patientCode;
      ptCode2 = pt2.body.data.patientCode;
    });

    it("enforces at most one active patient assignment per device", async () => {
      // Assign Device A to Patient 1
      const assign1 = await request(app).post(`/api/devices/${devIdA}/assign`).send({ patientCode: ptCode1 });
      expect(assign1.status).toBe(200);

      // Attempt to assign Device A to Patient 2 while already active
      const conflictRes = await request(app).post(`/api/devices/${devIdA}/assign`).send({ patientCode: ptCode2 });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.code).toBe("DEVICE_ALREADY_ASSIGNED");
    });

    it("enforces at most one active device assignment per patient (V1 invariant)", async () => {
      // Assign Device A to Patient 1
      await request(app).post(`/api/devices/${devIdA}/assign`).send({ patientCode: ptCode1 });

      // Attempt to assign Device B to Patient 1 while Patient 1 already has active device
      const conflictRes = await request(app).post(`/api/devices/${devIdB}/assign`).send({ patientCode: ptCode1 });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.code).toBe("PATIENT_ALREADY_ASSIGNED");
    });

    it("preserves historical assignments when device is unassigned and reassigned", async () => {
      // 1. Assign Dev A to Patient 1
      await request(app).post(`/api/devices/${devIdA}/assign`).send({ patientCode: ptCode1 });

      // 2. Unassign Dev A
      const unassignRes = await request(app).post(`/api/devices/${devIdA}/unassign`).send({ notes: "Bed rotation" });
      expect(unassignRes.status).toBe(200);
      expect(unassignRes.body.data.isActive).toBe(false);
      expect(unassignRes.body.data.unassignedAt).toBeDefined();

      // 3. Assign Dev A to Patient 2
      const assign2 = await request(app).post(`/api/devices/${devIdA}/assign`).send({ patientCode: ptCode2 });
      expect(assign2.status).toBe(200);

      // 4. Retrieve assignment history
      const historyRes = await request(app).get(`/api/devices/${devIdA}/assignments`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(2);

      // Most recent is active (Patient 2), previous is closed (Patient 1)
      expect(historyRes.body.data[0].patient.patientCode).toBe(ptCode2);
      expect(historyRes.body.data[0].isActive).toBe(true);

      expect(historyRes.body.data[1].patient.patientCode).toBe(ptCode1);
      expect(historyRes.body.data[1].isActive).toBe(false);
      expect(historyRes.body.data[1].unassignedAt).toBeDefined();
    });
  });

  describe("3. Configuration Delivery Lifecycle & Acknowledgement API", () => {
    let deviceId: string;
    let patientCode: string;

    beforeEach(async () => {
      const dev = await request(app).post("/api/devices").send({ name: "Configurable Unit", isDevRegistration: true });
      deviceId = dev.body.data.deviceId;

      const pt = await request(app).post("/api/patients").send({ displayName: "Rohan Patel", bedLabel: "ICU-05", status: "ACTIVE" });
      patientCode = pt.body.data.patientCode;

      await request(app).post(`/api/devices/${deviceId}/assign`).send({ patientCode });
    });

    it("leaves configuration in PENDING status upon creation without assuming hardware delivery", async () => {
      const configRes = await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [
          { gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" },
        ],
      });

      expect(configRes.status).toBe(201);
      // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
      expect(configRes.body.data.version).toBe(2);
      expect(configRes.body.data.status).toBe("PENDING");
      expect(configRes.body.data.appliedAt).toBeUndefined();

      // Check device desired vs applied version
      const devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.desiredConfigVersion).toBe(2);
      expect(devRes.body.data.appliedConfigVersion).toBeUndefined();
    });

    it("successfully acknowledges configuration as APPLIED and updates appliedConfigVersion", async () => {
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" }],
      });

      const ackRes = await request(app)
        .post(`/api/devices/${deviceId}/configs/1/ack`)
        .send({ status: "APPLIED", isDevSimulated: true });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe("APPLIED");
      expect(ackRes.body.data.appliedAt).toBeDefined();
      expect(ackRes.body.isIdempotent).toBe(false);

      // Device now reflects confirmed applied configuration version
      const devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.appliedConfigVersion).toBe(1);
    });

    it("handles explicit FAILED acknowledgement with failure reason without falsely marking APPLIED", async () => {
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" }],
      });

      const failRes = await request(app)
        .post(`/api/devices/${deviceId}/configs/1/ack`)
        .send({ status: "FAILED", failureReason: "Flash write verification failed on ESP32" });

      expect(failRes.status).toBe(200);
      expect(failRes.body.data.status).toBe("FAILED");
      expect(failRes.body.data.failureReason).toBe("Flash write verification failed on ESP32");
      expect(failRes.body.data.appliedAt).toBeUndefined();

      // Device appliedConfigVersion must NOT be updated
      const devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.appliedConfigVersion).toBeUndefined();
    });

    it("rejects acknowledgement for non-existent device or unknown configuration version", async () => {
      const unknownDevRes = await request(app)
        .post("/api/devices/npg-99999999/configs/1/ack")
        .send({ status: "APPLIED" });
      expect(unknownDevRes.status).toBe(404);
      expect(unknownDevRes.body.code).toBe("DEVICE_NOT_FOUND");

      const unknownVerRes = await request(app)
        .post(`/api/devices/${deviceId}/configs/99/ack`)
        .send({ status: "APPLIED" });
      expect(unknownVerRes.status).toBe(404);
      expect(unknownVerRes.body.code).toBe("CONFIG_NOT_FOUND");
    });

    it("handles duplicate acknowledgements idempotently", async () => {
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" }],
      });

      // First ACK
      await request(app).post(`/api/devices/${deviceId}/configs/1/ack`).send({ status: "APPLIED" });

      // Duplicate ACK
      const dupAckRes = await request(app).post(`/api/devices/${deviceId}/configs/1/ack`).send({ status: "APPLIED" });
      expect(dupAckRes.status).toBe(200);
      expect(dupAckRes.body.isIdempotent).toBe(true);
      expect(dupAckRes.body.data.status).toBe("APPLIED");
    });

    it("does not downgrade device appliedConfigVersion if an older delayed acknowledgement arrives", async () => {
      // Create v1 and v2
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" }],
      });
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "GAZE_LEFT", gestureName: "Gaze Left", action: "NEED_ASSISTANCE" }],
      });

      // Newer v2 acknowledged first
      await request(app).post(`/api/devices/${deviceId}/configs/2/ack`).send({ status: "APPLIED" });
      const devAfterV2 = await request(app).get(`/api/devices/${deviceId}`);
      expect(devAfterV2.body.data.appliedConfigVersion).toBe(2);

      // Now delayed ACK for older v1 arrives
      await request(app).post(`/api/devices/${deviceId}/configs/1/ack`).send({ status: "APPLIED" });
      const devAfterV1 = await request(app).get(`/api/devices/${deviceId}`);

      // Crucial: appliedConfigVersion must remain 2 (not downgraded to 1)
      expect(devAfterV1.body.data.appliedConfigVersion).toBe(2);
    });
  });

  describe("4. Heartbeat & Live Connectivity", () => {
    let deviceId: string;

    beforeEach(async () => {
      const dev = await request(app).post("/api/devices").send({ name: "Telemetry Unit", isDevRegistration: true });
      deviceId = dev.body.data.deviceId;
    });

    it("shows never-seen device as NEVER_SEEN and not falsely online", async () => {
      const res = await request(app).get(`/api/devices/${deviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.connectivityStatus).toBe("NEVER_SEEN");
      expect(res.body.data.lastSeenAt).toBeUndefined();
    });

    it("updates lastSeenAt and marks device ONLINE upon valid heartbeat", async () => {
      const hbRes = await request(app).post(`/api/devices/${deviceId}/heartbeat`).send({
        firmwareVersion: "NPG-v1.4.2",
        configVersionApplied: 1,
      });

      expect(hbRes.status).toBe(200);
      expect(hbRes.body.status).toBe("success");
      expect(hbRes.body.data.connectivityStatus).toBe("ONLINE");
      expect(hbRes.body.data.lastSeenAt).toBeDefined();
      expect(hbRes.body.data.firmwareVersion).toBe("NPG-v1.4.2");

      const devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.connectivityStatus).toBe("ONLINE");
      expect(devRes.body.data.firmwareVersion).toBe("NPG-v1.4.2");
    });

    it("rejects heartbeat with mismatched device ID in route vs payload", async () => {
      const res = await request(app).post(`/api/devices/${deviceId}/heartbeat`).send({
        deviceId: "npg-different-id",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DEVICE_ID_MISMATCH");
    });

    it("evaluates device as OFFLINE after heartbeat timeout expires and online again after new heartbeat", async () => {
      // 1. Send heartbeat
      await request(app).post(`/api/devices/${deviceId}/heartbeat`).send();
      let devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.connectivityStatus).toBe("ONLINE");

      // 2. Simulate heartbeat timeout by setting lastSeenAt 90 seconds in the past
      const pastTime = new Date(Date.now() - 90 * 1000);
      await Device.updateOne({ deviceId }, { lastSeenAt: pastTime, connectivityStatus: "ONLINE" });

      // Dynamic evaluation with 60s timeout evaluates as OFFLINE
      devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.connectivityStatus).toBe("OFFLINE");

      // Sweeper also updates database
      const modifiedCount = await checkConnectivityTimeouts(60000);
      expect(modifiedCount).toBe(1);

      const dbDevice = await Device.findOne({ deviceId });
      expect(dbDevice?.connectivityStatus).toBe("OFFLINE");

      // 3. New heartbeat restores ONLINE state
      await request(app).post(`/api/devices/${deviceId}/heartbeat`).send();
      devRes = await request(app).get(`/api/devices/${deviceId}`);
      expect(devRes.body.data.connectivityStatus).toBe("ONLINE");
    });

    it("ensures existing care requests remain unchanged when device goes offline", async () => {
      // Setup patient and assignment
      const pt = await request(app).post("/api/patients").send({ displayName: "Kavita Rao", bedLabel: "Bed-20", status: "ACTIVE" });
      await request(app).post(`/api/devices/${deviceId}/assign`).send({ patientCode: pt.body.data.patientCode });

      // Setup gesture config & ack
      await request(app).post(`/api/devices/${deviceId}/configs`).send({
        mappings: [{ gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "NEED_WATER" }],
      });
      // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
      await request(app).post(`/api/devices/${deviceId}/configs/2/ack`).send({ status: "APPLIED" });

      // Ingest care request
      const eventRes = await request(app).post("/api/device-events").send({
        eventId: "event-offline-safety-1",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion: 2,
      });
      expect(eventRes.status).toBe(201);
      const requestId = eventRes.body.data._id;

      // Simulate device going offline
      const pastTime = new Date(Date.now() - 120 * 1000);
      await Device.updateOne({ deviceId }, { lastSeenAt: pastTime, connectivityStatus: "OFFLINE" });

      // Verify care request is untouched and NOT resolved or deleted
      const reqRes = await request(app).get(`/api/care-requests/${requestId}`);
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.data.status).toBe("NEW");
      expect(reqRes.body.data.resolvedAt).toBeUndefined();
    });
  });
});
