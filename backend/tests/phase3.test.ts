import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import { Device, Patient, DeviceAssignment, DeviceConfig } from "../src/models/index.js";

describe("Phase 3: Gesture Configuration & Patient Instructions", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;
  let deviceId: string;
  let patientCode: string;

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

    // Setup an assigned device for config tests
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Bedside Test Device", isDevRegistration: true });
    deviceId = devRes.body.data.deviceId;

    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Test Patient", status: "ACTIVE" });
    patientCode = ptRes.body.data.patientCode;

    await request(app)
      .post(`/api/devices/${deviceId}/assign`)
      .send({ patientCode });
  });

  it("successfully creates a gesture configuration with human-readable names and instructions", async () => {
    const res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          {
            gestureId: "BLINK_SINGLE",
            gestureName: "Single Blink",
            action: "NEED_WATER",
            instruction: "Blink once firmly to request a glass of water",
          },
          {
            gestureId: "BLINK_DOUBLE",
            gestureName: "Double Blink",
            action: "NEED_ASSISTANCE",
            instruction: "Blink twice quickly to call a nurse for assistance",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
    expect(res.body.data).toHaveProperty("version", 2);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.appliedAt).toBeUndefined();
    expect(res.body.data.mappings).toHaveLength(2);
    expect(res.body.data.mappings[0].gestureName).toBe("Single Blink");
    expect(res.body.data.mappings[0].action).toBe("NEED_WATER");
  });

  it("increments the configuration version for successive configurations", async () => {
    // Version 1
    await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "NEED_WATER" },
        ],
      });

    // Version 2
    const res2 = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "PAIN_DISCOMFORT" },
        ],
      });

    expect(res2.status).toBe(201);
    // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
    expect(res2.body.data.version).toBe(3);
    expect(res2.body.data.status).toBe("PENDING");
  });

  it("historical versions remain unchanged when a new version is created", async () => {
    // Version 1
    const v1Res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "NEED_WATER" },
        ],
      });

    // Version 2
    await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "GAZE_LEFT", gestureName: "Gaze Left", action: "REPOSITION" },
        ],
      });

    // Retrieve history
    const historyRes = await request(app).get(`/api/devices/${deviceId}/configs`);
    expect(historyRes.status).toBe(200);
    // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
    expect(historyRes.body.data).toHaveLength(3);

    const v1History = historyRes.body.data.find((c: { version: number }) => c.version === 2);
    expect(v1History.mappings[0].gestureId).toBe("BLINK_SINGLE");
    expect(v1History.status).toBe("PENDING");
  });

  it("retrieves the latest configuration via /configs/latest", async () => {
    await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "NEED_WATER" },
        ],
      });

    await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_DOUBLE", gestureName: "Double Blink", action: "EMERGENCY" },
        ],
      });

    const latestRes = await request(app).get(`/api/devices/${deviceId}/configs/latest`);
    expect(latestRes.status).toBe(200);
    // Version 1 is the default command rules seeded at registration, so legacy configs start at 2.
    expect(latestRes.body.data.version).toBe(3);
    expect(latestRes.body.data.mappings[0].action).toBe("EMERGENCY");
  });

  it("rejects invalid request actions", async () => {
    const res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "INVALID_ACTION_NAME" },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty gesture mappings array", async () => {
    const res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate gesture identifiers within the same configuration", async () => {
    const res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Blink 1", action: "NEED_WATER" },
          { gestureId: "BLINK_SINGLE", gestureName: "Blink Again", action: "NEED_ASSISTANCE" },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects configuration for an unknown device", async () => {
    const res = await request(app)
      .post("/api/devices/npg-99999999/configs")
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "NEED_WATER" },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("DEVICE_NOT_FOUND");
  });

  it("rejects configuration for an unassigned device", async () => {
    // Unassign device
    await request(app).post(`/api/devices/${deviceId}/unassign`).send({});

    const res = await request(app)
      .post(`/api/devices/${deviceId}/configs`)
      .send({
        mappings: [
          { gestureId: "BLINK_SINGLE", gestureName: "Single Blink", action: "NEED_WATER" },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DEVICE_NOT_ASSIGNED");
  });
});
