import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import { Device, Patient, DeviceAssignment } from "../src/models/index.js";

describe("Nurse Device Allocation - Online Connectivity Enforcement", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;

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
  });

  it("rejects nurse allocation when device has never transmitted a heartbeat (NEVER_SEEN)", async () => {
    // 1. Create a dev device
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Bedside Gateway A", isDevRegistration: true });
    expect(devRes.status).toBe(201);
    const deviceId = devRes.body.data.deviceId;

    // 2. Create an active patient
    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Aarav Patel", bedLabel: "Bed-201", status: "ACTIVE" });
    expect(ptRes.status).toBe(201);
    const patientCode = ptRes.body.data.patientCode;

    // 3. Nurse attempts to allocate device to patient via POST /api/patients/:patientCode/assign-device
    const allocateRes = await request(app)
      .post(`/api/patients/${patientCode}/assign-device`)
      .send({ deviceId, assignedBy: "Nurse Joy" });

    expect(allocateRes.status).toBe(400);
    expect(allocateRes.body.status).toBe("error");
    expect(allocateRes.body.code).toBe("DEVICE_NOT_ONLINE");
    expect(allocateRes.body.message).toMatch(/must be online before allocating/i);
  });

  it("rejects device assignment when requireOnline is true and device is offline", async () => {
    // 1. Create device and patient
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Bedside Gateway B", isDevRegistration: true });
    const deviceId = devRes.body.data.deviceId;

    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Diya Rao", bedLabel: "Bed-202", status: "ACTIVE" });
    const patientCode = ptRes.body.data.patientCode;

    // 2. Call /api/devices/:deviceId/assign with requireOnline: true
    const assignRes = await request(app)
      .post(`/api/devices/${deviceId}/assign`)
      .send({ patientCode, assignedBy: "Nurse Joy", requireOnline: true });

    expect(assignRes.status).toBe(400);
    expect(assignRes.body.status).toBe("error");
    expect(assignRes.body.code).toBe("DEVICE_NOT_ONLINE");
  });

  it("successfully allows nurse allocation when device transmits heartbeat and is ONLINE", async () => {
    // 1. Create device and patient
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Bedside Gateway C", isDevRegistration: true });
    const deviceId = devRes.body.data.deviceId;

    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Kavita Reddy", bedLabel: "Bed-203", status: "ACTIVE" });
    const patientCode = ptRes.body.data.patientCode;

    // 2. Send heartbeat to make device ONLINE
    const hbRes = await request(app)
      .post(`/api/devices/${deviceId}/heartbeat`)
      .send({});
    expect(hbRes.status).toBe(200);

    // Verify device is online
    const devCheck = await request(app).get(`/api/devices/${deviceId}`);
    expect(devCheck.body.data.connectivityStatus).toBe("ONLINE");

    // 3. Nurse allocates online device to patient
    const allocateRes = await request(app)
      .post(`/api/patients/${patientCode}/assign-device`)
      .send({ deviceId, assignedBy: "Nurse Joy" });

    expect(allocateRes.status).toBe(200);
    expect(allocateRes.body.status).toBe("success");
    expect(allocateRes.body.data.isActive).toBe(true);
    expect(allocateRes.body.data.device).toBeDefined();

    // Verify patient assignment
    const ptCheck = await request(app).get(`/api/patients/${patientCode}`);
    expect(ptCheck.body.data.currentAssignment).not.toBeNull();
    expect(ptCheck.body.data.currentAssignment.device.deviceId).toBe(deviceId);
  });

  it("rejects nurse allocation if device heartbeat has expired and status is OFFLINE", async () => {
    // 1. Create device and patient
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: "Bedside Gateway D", isDevRegistration: true });
    const deviceId = devRes.body.data.deviceId;

    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: "Sameer Joshi", bedLabel: "Bed-204", status: "ACTIVE" });
    const patientCode = ptRes.body.data.patientCode;

    // 2. Simulate an expired heartbeat (2 hours ago)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await Device.updateOne({ deviceId }, { lastSeenAt: twoHoursAgo, connectivityStatus: "OFFLINE" });

    // 3. Nurse attempts to allocate device
    const allocateRes = await request(app)
      .post(`/api/patients/${patientCode}/assign-device`)
      .send({ deviceId, assignedBy: "Nurse Joy" });

    expect(allocateRes.status).toBe(400);
    expect(allocateRes.body.status).toBe("error");
    expect(allocateRes.body.code).toBe("DEVICE_NOT_ONLINE");
    expect(allocateRes.body.message).toMatch(/offline/i);
  });
});
