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

describe("Phase 4: Care Request API & Lifecycle", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;
  let deviceId: string;
  let patientCode: string;
  let configVersion: number;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
  });

  afterAll(async () => {
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

    // 1. Create Device
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Phase4 Bedside Device", isDevRegistration: true });
    deviceId = devRes.body.data.deviceId;

    // 2. Create Patient
    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Jane Doe", bedLabel: "ICU-04", status: "ACTIVE" });
    patientCode = ptRes.body.data.patientCode;

    // 3. Assign Device to Patient
    await request(app)
      .post(`/api/devices/${deviceId}/assign`)
      .send({ patientCode });

    // 4. Create Gesture Configuration (version 1)
    const cfgRes = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          {
            gestureId: "BLINK_DOUBLE",
            gestureName: "Double Blink",
            action: "NEED_WATER",
            instruction: "Blink twice for water",
          },
          {
            gestureId: "GAZE_LEFT",
            gestureName: "Gaze Left",
            action: "NEED_ASSISTANCE",
          },
        ],
      });
    configVersion = cfgRes.body.data.version;
  });

  describe("Event Ingestion (POST /api/device-events)", () => {
    it("creates a new care request for valid event with derived patient and mapped action", async () => {
      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-test-001",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.eventId).toBe("evt-test-001");
      expect(res.body.data.gestureId).toBe("BLINK_DOUBLE");
      expect(res.body.data.action).toBe("NEED_WATER");
      expect(res.body.data.status).toBe("NEW");
      expect(res.body.data.patient.patientCode).toBe(patientCode);
      expect(res.body.data.patient.displayName).toBe("Jane Doe");
      expect(res.body.data.device.deviceId).toBe(deviceId);
      expect(res.body.isDuplicate).toBe(false);
    });

    it("rejects unknown device", async () => {
      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-unknown-dev",
          deviceId: "nonexistent-device-id",
          gestureId: "BLINK_DOUBLE",
          configVersion: 1,
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("DEVICE_NOT_FOUND");
    });

    it("rejects unassigned device", async () => {
      // Unassign the device
      await request(app).post(`/api/devices/${deviceId}/unassign`).send({});

      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-unassigned-dev",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DEVICE_NOT_ASSIGNED");
    });

    it("rejects unknown configuration version", async () => {
      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-unknown-cfg",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion: 999, // Doesn't exist
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CONFIG_VERSION_NOT_FOUND");
    });

    it("rejects unknown gesture not present in that config version", async () => {
      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-unknown-gesture",
          deviceId,
          gestureId: "UNKNOWN_GESTURE_XYZ",
          configVersion,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("GESTURE_NOT_CONFIGURED");
    });

    it("deduplicates event: duplicate eventId returns existing care request without creating new one", async () => {
      // First submission
      const firstRes = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-dup-check",
          deviceId,
          gestureId: "GAZE_LEFT",
          configVersion,
        });
      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data.action).toBe("NEED_ASSISTANCE");

      // Duplicate submission
      const dupRes = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-dup-check",
          deviceId,
          gestureId: "GAZE_LEFT",
          configVersion,
        });

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.isDuplicate).toBe(true);
      expect(dupRes.body.data._id).toBe(firstRes.body.data._id);

      // Verify DB contains only 1 CareRequest document
      const totalRequests = await CareRequest.countDocuments();
      expect(totalRequests).toBe(1);
    });

    it("ignores client-supplied patient and action, resolving strictly from configuration", async () => {
      const fakePatientCode = "PT-FAKE-999";
      const fakeAction = "EMERGENCY";

      const res = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-tamper-check",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion,
          patientCode: fakePatientCode, // Attempted spoof
          action: fakeAction,           // Attempted spoof
        });

      expect(res.status).toBe(201);
      // Action MUST be resolved from config ("NEED_WATER", not "EMERGENCY")
      expect(res.body.data.action).toBe("NEED_WATER");
      // Patient MUST be resolved from active assignment ("Jane Doe", not spoofed)
      expect(res.body.data.patient.patientCode).toBe(patientCode);
    });
  });

  describe("Request Lifecycle (Acknowledge, In-Progress, Resolve)", () => {
    let careRequestId: string;

    beforeEach(async () => {
      const eventRes = await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-lifecycle-test",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion,
        });
      careRequestId = eventRes.body.data._id;
    });

    it("progresses correctly: NEW -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED with timestamps", async () => {
      // 1. Acknowledge
      const ackRes = await request(app).patch(
        `/api/care-requests/${careRequestId}/acknowledge`
      );
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe("ACKNOWLEDGED");
      expect(ackRes.body.data.acknowledgedAt).toBeDefined();

      // 2. Start Handling (IN_PROGRESS)
      const inProgRes = await request(app).patch(
        `/api/care-requests/${careRequestId}/in-progress`
      );
      expect(inProgRes.status).toBe(200);
      expect(inProgRes.body.data.status).toBe("IN_PROGRESS");
      expect(inProgRes.body.data.inProgressAt).toBeDefined();

      // 3. Resolve
      const resolveRes = await request(app).patch(
        `/api/care-requests/${careRequestId}/resolve`
      );
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe("RESOLVED");
      expect(resolveRes.body.data.resolvedAt).toBeDefined();
    });

    it("rejects invalid state transition from NEW directly to IN_PROGRESS", async () => {
      const res = await request(app).patch(
        `/api/care-requests/${careRequestId}/in-progress`
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects invalid state transition from NEW directly to RESOLVED", async () => {
      const res = await request(app).patch(
        `/api/care-requests/${careRequestId}/resolve`
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects any transition once request is already RESOLVED", async () => {
      // Move to RESOLVED properly first
      await request(app).patch(`/api/care-requests/${careRequestId}/acknowledge`);
      await request(app).patch(`/api/care-requests/${careRequestId}/in-progress`);
      await request(app).patch(`/api/care-requests/${careRequestId}/resolve`);

      // Attempt to acknowledge already resolved request
      const res = await request(app).patch(
        `/api/care-requests/${careRequestId}/acknowledge`
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects lifecycle transitions for nonexistent request ID", async () => {
      const res = await request(app).patch(
        "/api/care-requests/65d1234567890abcdef12345/acknowledge"
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("CARE_REQUEST_NOT_FOUND");
    });
  });

  describe("Request Retrieval (GET /api/care-requests)", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-query-1",
          deviceId,
          gestureId: "BLINK_DOUBLE",
          configVersion,
        });

      await request(app)
        .post("/api/device-events")
        .send({
          eventId: "evt-query-2",
          deviceId,
          gestureId: "GAZE_LEFT",
          configVersion,
        });
    });

    it("retrieves list of care requests with populated patient and device", async () => {
      const res = await request(app).get("/api/care-requests");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].patient.patientCode).toBe(patientCode);
      expect(res.body.data[0].device.deviceId).toBe(deviceId);
    });

    it("filters care requests by status", async () => {
      const allRes = await request(app).get("/api/care-requests");
      const firstId = allRes.body.data[0]._id;

      // Acknowledge one request
      await request(app).patch(`/api/care-requests/${firstId}/acknowledge`);

      const ackList = await request(app).get("/api/care-requests?status=ACKNOWLEDGED");
      expect(ackList.status).toBe(200);
      expect(ackList.body.data).toHaveLength(1);
      expect(ackList.body.data[0].status).toBe("ACKNOWLEDGED");

      const newList = await request(app).get("/api/care-requests?status=NEW");
      expect(newList.status).toBe(200);
      expect(newList.body.data).toHaveLength(1);
      expect(newList.body.data[0].status).toBe("NEW");
    });

    it("retrieves a single care request by ID", async () => {
      const allRes = await request(app).get("/api/care-requests");
      const id = allRes.body.data[0]._id;

      const singleRes = await request(app).get(`/api/care-requests/${id}`);
      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data._id).toBe(id);
      expect(singleRes.body.data.action).toBeDefined();
    });
  });
});
