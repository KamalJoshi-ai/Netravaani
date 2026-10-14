import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import { Device, Patient, DeviceAssignment, DeviceConfig } from "../src/models/index.js";

describe("Phase 2: Device Registry, Patient Management & Assignment", () => {
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
    await DeviceConfig.deleteMany({});
  });

  describe("Device Registration & Validation", () => {
    it("successfully registers a device with isDevRegistration: true", async () => {
      const res = await request(app)
        .post("/api/devices")
        .send({
          name: "Bedside NPG 01",
          hardwareId: "ESP32C6-A1B2C3D4",
          firmwareVersion: "v1.0.0-rc1",
          isDevRegistration: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("deviceId");
      expect(res.body.data.deviceId).toMatch(/^npg-[a-f0-9]{8}$/);
      expect(res.body.data.status).toBe("AVAILABLE");
      expect(res.body.data.hardwareId).toBe("ESP32C6-A1B2C3D4");
    });

    it("rejects registration without isDevRegistration: true", async () => {
      const res = await request(app)
        .post("/api/devices")
        .send({
          name: "Bedside NPG 01",
          hardwareId: "ESP32C6-TEST",
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe("error");
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration with duplicate hardware identity", async () => {
      await request(app)
        .post("/api/devices")
        .send({
          name: "Device A",
          hardwareId: "ESP32C6-DUP-01",
          isDevRegistration: true,
        });

      const res = await request(app)
        .post("/api/devices")
        .send({
          name: "Device B",
          hardwareId: "ESP32C6-DUP-01",
          isDevRegistration: true,
        });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe("error");
      expect(res.body.code).toBe("DUPLICATE_HARDWARE_ID");
    });

    it("rejects invalid input (short name)", async () => {
      const res = await request(app)
        .post("/api/devices")
        .send({
          name: "A",
          isDevRegistration: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Patient Management", () => {
    it("creates a patient successfully and generates patientCode", async () => {
      const res = await request(app)
        .post("/api/patients")
        .send({
          displayName: "Jane Doe",
          bedLabel: "ICU-Bed-04",
          status: "ACTIVE",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("patientCode");
      expect(res.body.data.patientCode).toMatch(/^PT-\d{6}$/);
      expect(res.body.data.displayName).toBe("Jane Doe");
    });

    it("lists patients with pagination", async () => {
      await Patient.create([
        { patientCode: "PT-000001", displayName: "Patient One", status: "ACTIVE" },
        { patientCode: "PT-000002", displayName: "Patient Two", status: "INACTIVE" },
      ]);

      const res = await request(app).get("/api/patients?page=1&limit=10");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it("returns 404 for nonexistent patient", async () => {
      const res = await request(app).get("/api/patients/PT-999999");
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("PATIENT_NOT_FOUND");
    });
  });

  describe("Device Assignment & Invariants", () => {
    let deviceId: string;
    let patientCode: string;

    beforeEach(async () => {
      const devRes = await request(app)
        .post("/api/devices")
        .send({ name: "Ward Bed 1 Device", isDevRegistration: true });
      deviceId = devRes.body.data.deviceId;

      const ptRes = await request(app)
        .post("/api/patients")
        .send({ displayName: "John Smith", bedLabel: "Bed-01", status: "ACTIVE" });
      patientCode = ptRes.body.data.patientCode;
    });

    it("successfully assigns a device to an active patient", async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode, assignedBy: "Nurse Sarah" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.isActive).toBe(true);

      // Check device status transitioned to ASSIGNED
      const devCheck = await request(app).get(`/api/devices/${deviceId}`);
      expect(devCheck.body.data.status).toBe("ASSIGNED");
      expect(devCheck.body.data.currentAssignment).not.toBeNull();
      expect(devCheck.body.data.currentAssignment.patient.patientCode).toBe(patientCode);
    });

    it("rejects assignment if device does not exist", async () => {
      const res = await request(app)
        .post("/api/devices/npg-nonexistent/assign")
        .send({ patientCode });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("DEVICE_NOT_FOUND");
    });

    it("rejects assignment if patient does not exist", async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode: "PT-NONEXISTENT" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("PATIENT_NOT_FOUND");
    });

    it("rejects assignment to an inactive patient", async () => {
      const inactPt = await request(app)
        .post("/api/patients")
        .send({ displayName: "Inactive Patient", status: "INACTIVE" });

      const res = await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode: inactPt.body.data.patientCode });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PATIENT_INACTIVE");
    });

    it("prevents duplicate active assignment on the same device", async () => {
      // First assignment
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      // Second patient
      const pt2 = await request(app)
        .post("/api/patients")
        .send({ displayName: "Second Patient", status: "ACTIVE" });

      // Second assignment attempt on same device
      const res = await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode: pt2.body.data.patientCode });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DEVICE_ALREADY_ASSIGNED");
    });

    it("prevents a patient from having two active device assignments", async () => {
      // Assign patient to device 1
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      // Register device 2
      const dev2Res = await request(app)
        .post("/api/devices")
        .send({ name: "Device 2", isDevRegistration: true });
      const deviceId2 = dev2Res.body.data.deviceId;

      // Attempt to assign same patient to device 2
      const res = await request(app)
        .post(`/api/devices/${deviceId2}/assign`)
        .send({ patientCode });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PATIENT_ALREADY_ASSIGNED");
    });

    it("unassigns a device, updates status to AVAILABLE, and preserves history", async () => {
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      // Unassign
      const unassignRes = await request(app)
        .post(`/api/devices/${deviceId}/unassign`)
        .send({});

      expect(unassignRes.status).toBe(200);
      expect(unassignRes.body.data.isActive).toBe(false);
      expect(unassignRes.body.data.unassignedAt).toBeDefined();

      // Device is AVAILABLE again
      const devCheck = await request(app).get(`/api/devices/${deviceId}`);
      expect(devCheck.body.data.status).toBe("AVAILABLE");
      expect(devCheck.body.data.currentAssignment).toBeNull();

      // Check assignment history is preserved
      const historyRes = await request(app).get(`/api/devices/${deviceId}/assignments`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(1);
      expect(historyRes.body.data[0].isActive).toBe(false);
    });

    it("returns 404 if trying to unassign a device with no active assignment", async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/unassign`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NO_ACTIVE_ASSIGNMENT");
    });
  });

  describe("Device Configuration Foundation", () => {
    let deviceId: string;
    let patientCode: string;

    beforeEach(async () => {
      const devRes = await request(app)
        .post("/api/devices")
        .send({ name: "Config Test Device", isDevRegistration: true });
      deviceId = devRes.body.data.deviceId;

      const ptRes = await request(app)
        .post("/api/patients")
        .send({ displayName: "Config Patient", status: "ACTIVE" });
      patientCode = ptRes.body.data.patientCode;
    });

    it("rejects configuration if device is not assigned to a patient", async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/configs`)
        .send({
          mappings: [
            {
              gestureId: "BLINK_DOUBLE",
              gestureName: "Double Blink",
              action: "NEED_ASSISTANCE",
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DEVICE_NOT_ASSIGNED");
    });

    it("creates configuration version 1 when device is assigned, in PENDING status", async () => {
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      const res = await request(app)
        .post(`/api/devices/${deviceId}/configs`)
        .send({
          mappings: [
            {
              gestureId: "BLINK_DOUBLE",
              gestureName: "Double Blink",
              action: "NEED_ASSISTANCE",
              instruction: "Blink twice firmly",
            },
            {
              gestureId: "GAZE_LEFT",
              gestureName: "Look Left",
              action: "NEED_WATER",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.status).toBe("PENDING");
      expect(res.body.data.mappings).toHaveLength(2);
    });

    it("increments version number sequentially for subsequent configurations", async () => {
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      // Version 1
      await request(app)
        .post(`/api/devices/${deviceId}/configs`)
        .send({
          mappings: [
            {
              gestureId: "BLINK_SINGLE",
              gestureName: "Single Blink",
              action: "NEED_ASSISTANCE",
            },
          ],
        });

      // Version 2
      const res2 = await request(app)
        .post(`/api/devices/${deviceId}/configs`)
        .send({
          mappings: [
            {
              gestureId: "BLINK_DOUBLE",
              gestureName: "Double Blink",
              action: "PAIN_DISCOMFORT",
            },
          ],
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.version).toBe(2);

      // Verify list endpoint returns both versions in descending order
      const listRes = await request(app).get(`/api/devices/${deviceId}/configs`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(2);
      expect(listRes.body.data[0].version).toBe(2);
      expect(listRes.body.data[1].version).toBe(1);
    });

    it("rejects invalid configuration payload (empty mappings)", async () => {
      await request(app)
        .post(`/api/devices/${deviceId}/assign`)
        .send({ patientCode });

      const res = await request(app)
        .post(`/api/devices/${deviceId}/configs`)
        .send({
          selectionMode: "SINGLE_TAP",
          mappings: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });
});
