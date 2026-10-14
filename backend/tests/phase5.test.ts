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

describe("Phase 5: Nurse Dashboard & Care Request Management", () => {
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

    // 1. Setup registered device
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Nurse Station Bedside Monitor", isDevRegistration: true });
    deviceId = devRes.body.data.deviceId;

    // 2. Setup patient
    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Aarav Sharma", bedLabel: "Bed-12A", status: "ACTIVE" });
    patientCode = ptRes.body.data.patientCode;

    // 3. Assign device
    await request(app)
      .post(`/api/devices/${deviceId}/assign`)
      .send({ patientCode });

    // 4. Setup gesture configuration
    const cfgRes = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          {
            gestureId: "BLINK_DOUBLE",
            gestureName: "Double Blink",
            action: "NEED_WATER",
            instruction: "Double blink firmly for water",
          },
          {
            gestureId: "GAZE_LEFT",
            gestureName: "Gaze Left",
            action: "NEED_ASSISTANCE",
            instruction: "Look left to call assistance",
          },
          {
            gestureId: "BLINK_TRIPLE",
            gestureName: "Triple Blink",
            action: "EMERGENCY",
            instruction: "Triple blink for emergency",
          },
        ],
      });
    configVersion = cfgRes.body.data.version;
  });

  describe("1. Request List Loading, Sorting & Empty State", () => {
    it("returns empty list and zero count when no requests exist (empty state)", async () => {
      const res = await request(app).get("/api/care-requests");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it("retrieves requests and prioritizes NEW requests first, followed by newest createdAt", async () => {
      // Ingest Request 1
      const req1 = await request(app).post("/api/device-events").send({
        eventId: "event-p5-001",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion,
      });
      const id1 = req1.body.data._id;

      // Small delay to ensure timestamp progression
      await new Promise((r) => setTimeout(r, 15));

      // Ingest Request 2
      const req2 = await request(app).post("/api/device-events").send({
        eventId: "event-p5-002",
        deviceId,
        gestureId: "GAZE_LEFT",
        configVersion,
      });
      const id2 = req2.body.data._id;

      // Small delay
      await new Promise((r) => setTimeout(r, 15));

      // Ingest Request 3
      const req3 = await request(app).post("/api/device-events").send({
        eventId: "event-p5-003",
        deviceId,
        gestureId: "BLINK_TRIPLE",
        configVersion,
      });
      const id3 = req3.body.data._id;

      // Move Request 1 to ACKNOWLEDGED
      await request(app).patch(`/api/care-requests/${id1}/acknowledge`);

      // Move Request 3 to IN_PROGRESS (via ACKNOWLEDGED first)
      await request(app).patch(`/api/care-requests/${id3}/acknowledge`);
      await request(app).patch(`/api/care-requests/${id3}/in-progress`);

      // Request 2 remains NEW
      // Now list requests: NEW requests (id2) should appear FIRST!
      const listRes = await request(app).get("/api/care-requests");
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(3);

      // Verify that the first item is the NEW request
      expect(listRes.body.data[0]._id).toBe(id2);
      expect(listRes.body.data[0].status).toBe("NEW");

      // Verify populated details
      expect(listRes.body.data[0].patient.patientCode).toBe(patientCode);
      expect(listRes.body.data[0].patient.displayName).toBe("Aarav Sharma");
      expect(listRes.body.data[0].device.deviceId).toBe(deviceId);
    });
  });

  describe("2. Status Filters", () => {
    let idNew: string;
    let idAck: string;
    let idProg: string;
    let idRes: string;

    beforeEach(async () => {
      // Create 4 requests with distinct events
      const r1 = await request(app).post("/api/device-events").send({
        eventId: "filt-evt-1",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion,
      });
      idNew = r1.body.data._id;

      const r2 = await request(app).post("/api/device-events").send({
        eventId: "filt-evt-2",
        deviceId,
        gestureId: "GAZE_LEFT",
        configVersion,
      });
      idAck = r2.body.data._id;
      await request(app).patch(`/api/care-requests/${idAck}/acknowledge`);

      const r3 = await request(app).post("/api/device-events").send({
        eventId: "filt-evt-3",
        deviceId,
        gestureId: "BLINK_TRIPLE",
        configVersion,
      });
      idProg = r3.body.data._id;
      await request(app).patch(`/api/care-requests/${idProg}/acknowledge`);
      await request(app).patch(`/api/care-requests/${idProg}/in-progress`);

      const r4 = await request(app).post("/api/device-events").send({
        eventId: "filt-evt-4",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion,
      });
      idRes = r4.body.data._id;
      await request(app).patch(`/api/care-requests/${idRes}/acknowledge`);
      await request(app).patch(`/api/care-requests/${idRes}/in-progress`);
      await request(app).patch(`/api/care-requests/${idRes}/resolve`);
    });

    it("filters correctly by NEW", async () => {
      const res = await request(app).get("/api/care-requests?status=NEW");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id).toBe(idNew);
      expect(res.body.data[0].status).toBe("NEW");
    });

    it("filters correctly by ACKNOWLEDGED", async () => {
      const res = await request(app).get("/api/care-requests?status=ACKNOWLEDGED");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id).toBe(idAck);
      expect(res.body.data[0].status).toBe("ACKNOWLEDGED");
    });

    it("filters correctly by IN_PROGRESS", async () => {
      const res = await request(app).get("/api/care-requests?status=IN_PROGRESS");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id).toBe(idProg);
      expect(res.body.data[0].status).toBe("IN_PROGRESS");
    });

    it("filters correctly by RESOLVED", async () => {
      const res = await request(app).get("/api/care-requests?status=RESOLVED");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id).toBe(idRes);
      expect(res.body.data[0].status).toBe("RESOLVED");
    });

    it("returns all requests without status filter", async () => {
      const res = await request(app).get("/api/care-requests");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(4);
    });
  });

  describe("3. Valid Lifecycle Actions & Audit Timestamps", () => {
    it("transitions NEW -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED with timestamps preserved", async () => {
      const eventRes = await request(app).post("/api/device-events").send({
        eventId: "lifecycle-test-01",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion,
      });
      const reqId = eventRes.body.data._id;
      expect(eventRes.body.data.status).toBe("NEW");
      expect(eventRes.body.data.acknowledgedAt).toBeUndefined();
      expect(eventRes.body.data.resolvedAt).toBeUndefined();

      // Step 1: NEW -> ACKNOWLEDGED
      const ackRes = await request(app).patch(`/api/care-requests/${reqId}/acknowledge`);
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe("ACKNOWLEDGED");
      expect(ackRes.body.data.acknowledgedAt).toBeDefined();
      const ackTime = ackRes.body.data.acknowledgedAt;

      // Step 2: ACKNOWLEDGED -> IN_PROGRESS
      const inProgRes = await request(app).patch(`/api/care-requests/${reqId}/in-progress`);
      expect(inProgRes.status).toBe(200);
      expect(inProgRes.body.data.status).toBe("IN_PROGRESS");
      expect(inProgRes.body.data.acknowledgedAt).toBe(ackTime);
      expect(inProgRes.body.data.inProgressAt).toBeDefined();
      const progTime = inProgRes.body.data.inProgressAt;

      // Step 3: IN_PROGRESS -> RESOLVED
      const resolveRes = await request(app).patch(`/api/care-requests/${reqId}/resolve`);
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe("RESOLVED");
      expect(resolveRes.body.data.acknowledgedAt).toBe(ackTime);
      expect(resolveRes.body.data.inProgressAt).toBe(progTime);
      expect(resolveRes.body.data.resolvedAt).toBeDefined();

      // Step 4: Verify persistence when re-fetching
      const singleRes = await request(app).get(`/api/care-requests/${reqId}`);
      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data.status).toBe("RESOLVED");
      expect(singleRes.body.data.acknowledgedAt).toBe(ackTime);
      expect(singleRes.body.data.inProgressAt).toBe(progTime);
      expect(singleRes.body.data.resolvedAt).toBe(resolveRes.body.data.resolvedAt);
    });
  });

  describe("4. Invalid Actions Not Permitted (State Machine Integrity)", () => {
    let freshReqId: string;

    beforeEach(async () => {
      const eventRes = await request(app).post("/api/device-events").send({
        eventId: "invalid-action-evt",
        deviceId,
        gestureId: "BLINK_DOUBLE",
        configVersion,
      });
      freshReqId = eventRes.body.data._id;
    });

    it("rejects transition directly from NEW to IN_PROGRESS", async () => {
      const res = await request(app).patch(`/api/care-requests/${freshReqId}/in-progress`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects transition directly from NEW to RESOLVED", async () => {
      const res = await request(app).patch(`/api/care-requests/${freshReqId}/resolve`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects transition directly from ACKNOWLEDGED to RESOLVED without IN_PROGRESS", async () => {
      await request(app).patch(`/api/care-requests/${freshReqId}/acknowledge`);
      const res = await request(app).patch(`/api/care-requests/${freshReqId}/resolve`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects redundant acknowledge when already ACKNOWLEDGED", async () => {
      await request(app).patch(`/api/care-requests/${freshReqId}/acknowledge`);
      const res = await request(app).patch(`/api/care-requests/${freshReqId}/acknowledge`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("rejects any transitions once request is RESOLVED", async () => {
      await request(app).patch(`/api/care-requests/${freshReqId}/acknowledge`);
      await request(app).patch(`/api/care-requests/${freshReqId}/in-progress`);
      await request(app).patch(`/api/care-requests/${freshReqId}/resolve`);

      // Try acknowledge
      const ackRes = await request(app).patch(`/api/care-requests/${freshReqId}/acknowledge`);
      expect(ackRes.status).toBe(400);
      expect(ackRes.body.code).toBe("INVALID_STATE_TRANSITION");

      // Try in-progress
      const progRes = await request(app).patch(`/api/care-requests/${freshReqId}/in-progress`);
      expect(progRes.status).toBe(400);
      expect(progRes.body.code).toBe("INVALID_STATE_TRANSITION");

      // Try resolve again
      const resRes = await request(app).patch(`/api/care-requests/${freshReqId}/resolve`);
      expect(resRes.status).toBe(400);
      expect(resRes.body.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("5. Failed Updates & Error States", () => {
    it("returns 404 when attempting to acknowledge non-existent request", async () => {
      const res = await request(app).patch(
        "/api/care-requests/65d1234567890abcdef12345/acknowledge"
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("CARE_REQUEST_NOT_FOUND");
    });

    it("returns 404 when attempting to get non-existent request details", async () => {
      const res = await request(app).get(
        "/api/care-requests/65d1234567890abcdef12345"
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("CARE_REQUEST_NOT_FOUND");
    });
  });
});
