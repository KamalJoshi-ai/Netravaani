import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import User from "../src/models/User.js";
import { Bed } from "../src/models/Bed.js";
import { Patient } from "../src/models/Patient.js";
import { Device } from "../src/models/Device.js";
import { DeviceAssignment } from "../src/models/DeviceAssignment.js";

describe("Dashboard, Registration & Device Assignment Improvements", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
    await User.deleteMany({});
    await Bed.deleteMany({});
    await Patient.deleteMany({});
    await Device.deleteMany({});
    await DeviceAssignment.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe("1. Unique Username During Registration", () => {
    it("successfully registers a user with a unique username and normalizes it to lowercase and trimmed", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Nurse Maya",
        username: "  Nurse_Maya01  ",
        email: "maya@hospital.org",
        password: "SecurePassword123!",
        role: "nurse",
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.user.username).toBe("nurse_maya01");

      const dbUser = await User.findOne({ username: "nurse_maya01" });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.username).toBe("nurse_maya01");
    });

    it("rejects duplicate registration with case-insensitive username match", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Another Maya",
        username: "NURSE_MAYA01",
        email: "maya.another@hospital.org",
        password: "SecurePassword123!",
        role: "nurse",
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("USERNAME_TAKEN");
      expect(res.body.message).toContain("already taken");
    });

    it("handles concurrent registration attempts gracefully by enforcing unique index", async () => {
      const p1 = request(app).post("/api/auth/register").send({
        name: "Concurrent Nurse A",
        username: "concurrent_nurse",
        email: "nurse.a@hospital.org",
        password: "SecurePassword123!",
        role: "nurse",
      });

      const p2 = request(app).post("/api/auth/register").send({
        name: "Concurrent Nurse B",
        username: "concurrent_nurse",
        email: "nurse.b@hospital.org",
        password: "SecurePassword123!",
        role: "nurse",
      });

      const results = await Promise.all([p1, p2]);
      const statusCodes = results.map((r) => r.status).sort();
      expect(statusCodes).toEqual([201, 409]);
    });
  });

  describe("2. Nurse-Controlled Patient Registration & Bed Assignment Workflow", () => {
    let patientCode: string;

    beforeAll(async () => {
      // Seed beds
      await Bed.create({ bedNumber: "BED-ICU-01", status: "AVAILABLE" });
      await Bed.create({ bedNumber: "BED-ICU-02", status: "AVAILABLE" });
      await Bed.create({ bedNumber: "BED-ICU-03", status: "AVAILABLE" });
    });

    it("nurse initiates patient registration with an available bed, marking it PENDING_APPROVAL", async () => {
      const res = await request(app).post("/api/beds/initiate-registration").send({
        displayName: "Robert Chen",
        bedNumber: "BED-ICU-01",
        email: "robert@hospital.org",
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.patient.status).toBe("PENDING_BED_APPROVAL");
      expect(res.body.data.patient.pendingBedLabel).toBe("BED-ICU-01");
      expect(res.body.data.bed.status).toBe("PENDING_APPROVAL");

      patientCode = res.body.data.patient.patientCode;

      // Bed is claimed
      const dbBed = await Bed.findOne({ bedNumber: "BED-ICU-01" });
      expect(dbBed?.status).toBe("PENDING_APPROVAL");
    });

    it("prevents another nurse from claiming the same bed while pending approval", async () => {
      const res = await request(app).post("/api/beds/initiate-registration").send({
        displayName: "Another Patient",
        bedNumber: "BED-ICU-01",
        email: "another@hospital.org",
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BED_UNAVAILABLE");
    });

    it("patient cannot trigger bedside commands while bed is pending approval", async () => {
      const res = await request(app)
        .post(`/api/patients/${patientCode}/trigger-command`)
        .send({ action: "NEED_WATER" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BED_NOT_CONFIRMED");
    });

    it("another patient is forbidden from approving another patient's bed assignment", async () => {
      const res = await request(app)
        .post(`/api/patients/${patientCode}/approve-bed`)
        .send({ userIdentifier: "intruder_patient_code" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("patient explicitly approves proposed bed, confirming bed and making registration ACTIVE", async () => {
      const res = await request(app)
        .post(`/api/patients/${patientCode}/approve-bed`)
        .send({ userIdentifier: patientCode });

      expect(res.status).toBe(200);
      expect(res.body.data.patient.status).toBe("ACTIVE");
      expect(res.body.data.patient.bedLabel).toBe("BED-ICU-01");
      expect(res.body.data.patient.pendingBedLabel).toBeUndefined();

      const dbBed = await Bed.findOne({ bedNumber: "BED-ICU-01" });
      expect(dbBed?.status).toBe("OCCUPIED");
    });

    it("nurse proposes a bed change which remains pending without replacing confirmed bed", async () => {
      const res = await request(app)
        .post(`/api/patients/${patientCode}/propose-bed`)
        .send({ newBedNumber: "BED-ICU-02" });

      expect(res.status).toBe(200);
      expect(res.body.data.patient.bedLabel).toBe("BED-ICU-01"); // old bed preserved
      expect(res.body.data.patient.pendingBedLabel).toBe("BED-ICU-02"); // new bed proposed

      const oldBed = await Bed.findOne({ bedNumber: "BED-ICU-01" });
      const newBed = await Bed.findOne({ bedNumber: "BED-ICU-02" });
      expect(oldBed?.status).toBe("OCCUPIED");
      expect(newBed?.status).toBe("PENDING_APPROVAL");
    });

    it("rejecting proposed bed change preserves original confirmed bed and frees proposed bed", async () => {
      const res = await request(app)
        .post(`/api/patients/${patientCode}/reject-bed`)
        .send({ userIdentifier: patientCode });

      expect(res.status).toBe(200);
      expect(res.body.data.patient.bedLabel).toBe("BED-ICU-01"); // retained
      expect(res.body.data.patient.pendingBedLabel).toBeUndefined();

      const oldBed = await Bed.findOne({ bedNumber: "BED-ICU-01" });
      const proposedBed = await Bed.findOne({ bedNumber: "BED-ICU-02" });
      expect(oldBed?.status).toBe("OCCUPIED");
      expect(proposedBed?.status).toBe("AVAILABLE"); // freed
    });

    it("approving a bed change atomically updates new bed to OCCUPIED and releases old bed to AVAILABLE", async () => {
      // Propose BED-ICU-03
      await request(app)
        .post(`/api/patients/${patientCode}/propose-bed`)
        .send({ newBedNumber: "BED-ICU-03" });

      // Approve BED-ICU-03
      const res = await request(app)
        .post(`/api/patients/${patientCode}/approve-bed`)
        .send({ userIdentifier: patientCode });

      expect(res.status).toBe(200);
      expect(res.body.data.patient.bedLabel).toBe("BED-ICU-03");

      const oldBed = await Bed.findOne({ bedNumber: "BED-ICU-01" });
      const newBed = await Bed.findOne({ bedNumber: "BED-ICU-03" });
      expect(oldBed?.status).toBe("AVAILABLE");
      expect(oldBed?.currentPatient).toBeNull();
      expect(newBed?.status).toBe("OCCUPIED");
    });
  });

  describe("3. Strict NPG Device Allocation Rules", () => {
    let ptA: string;
    let ptB: string;
    const dev1 = "npg-strict-01";
    const dev2 = "npg-strict-02";

    beforeAll(async () => {
      // Create devices and mark online
      await Device.create({
        deviceId: dev1,
        name: "NPG Device 1",
        status: "AVAILABLE",
        connectivityStatus: "ONLINE",
        lastSeenAt: new Date(),
        isDevRegistration: true,
      });

      await Device.create({
        deviceId: dev2,
        name: "NPG Device 2",
        status: "AVAILABLE",
        connectivityStatus: "ONLINE",
        lastSeenAt: new Date(),
        isDevRegistration: true,
      });

      // Create two active patients with confirmed beds
      const p1 = await Patient.create({
        patientCode: "PT-DEV-A",
        displayName: "Patient Alpha",
        bedLabel: "BED-DEV-10",
        bedStatus: "OCCUPIED",
        status: "ACTIVE",
      });
      ptA = p1.patientCode;

      const p2 = await Patient.create({
        patientCode: "PT-DEV-B",
        displayName: "Patient Beta",
        bedLabel: "BED-DEV-20",
        bedStatus: "OCCUPIED",
        status: "ACTIVE",
      });
      ptB = p2.patientCode;
    });

    it("successfully allocates available online device to patient", async () => {
      const res = await request(app)
        .post(`/api/devices/${dev1}/assign`)
        .send({ patientCode: ptA });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);

      const dbDev = await Device.findOne({ deviceId: dev1 });
      expect(dbDev?.status).toBe("ASSIGNED");
    });

    it("prevents assigning the same device to another patient (1-to-1 enforcement)", async () => {
      const res = await request(app)
        .post(`/api/devices/${dev1}/assign`)
        .send({ patientCode: ptB });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DEVICE_ALREADY_ASSIGNED");
    });

    it("prevents assigning a second device to a patient while current device is still allocated (no silent switch)", async () => {
      const res = await request(app)
        .post(`/api/devices/${dev2}/assign`)
        .send({ patientCode: ptA });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PATIENT_ALREADY_ASSIGNED");
    });

    it("releasing device explicitly makes it available again", async () => {
      const res = await request(app).post(`/api/devices/${dev1}/unassign`).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      const dbDev = await Device.findOne({ deviceId: dev1 });
      expect(dbDev?.status).toBe("AVAILABLE");
    });

    it("after unassigning old device, patient can be assigned the new device", async () => {
      const res = await request(app)
        .post(`/api/devices/${dev2}/assign`)
        .send({ patientCode: ptA });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });

    it("enables bedside commands once confirmed bed AND valid assigned device are present", async () => {
      const res = await request(app)
        .post(`/api/patients/${ptA}/trigger-command`)
        .send({ action: "WATER" });

      expect(res.status).toBe(201);
      expect(res.body.data.action).toBe("WATER");
    });
  });

  describe("Nurse Bed Number Entry & Patient-Only Care Request Link Approval", () => {
    let testPtCode: string;

    beforeAll(async () => {
      const p = await Patient.create({
        patientCode: "PT-TEST88",
        displayName: "Care Link Test Patient",
        status: "PENDING_BED_APPROVAL",
        bedStatus: "NONE",
      });
      testPtCode = p.patientCode;
    });

    it("allows nurse to enter a custom bed number when dispatching a care request link", async () => {
      const res = await request(app)
        .post(`/api/patients/${testPtCode}/request-nurse`)
        .send({
          nurseName: "Nurse Elena",
          nurseRole: "nurse",
          bedNumber: "ICU-42",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.nurseAssignment.status).toBe("PENDING");
      expect(res.body.data.nurseAssignment.nurseName).toBe("Nurse Elena");
      expect(res.body.data.pendingBedLabel).toBe("ICU-42");

      const dbBed = await Bed.findOne({ bedNumber: "ICU-42" });
      expect(dbBed).not.toBeNull();
      expect(dbBed?.status).toBe("PENDING_APPROVAL");
    });

    it("forbids an unauthorized intruder or non-matching patient from approving the care request link", async () => {
      const res = await request(app)
        .post(`/api/patients/${testPtCode}/approve-nurse`)
        .send({ userIdentifier: "PT-INTRUDER-99" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("forbids a nurse from self-approving the care request link", async () => {
      // Create nurse token or simulate nurse auth context
      const nurseUser = await User.create({
        name: "Nurse Tester",
        username: "nurse_approver_block",
        email: "approver.block@hospital.org",
        passwordHash: "hash123",
        role: "nurse",
        isVerified: true,
      });

      const res = await request(app)
        .post(`/api/patients/${testPtCode}/approve-nurse`)
        .set("Cookie", `netravaani_token=mock_or_test`)
        .send({ userIdentifier: nurseUser.email });

      expect(res.status).toBe(403);
    });

    it("allows ONLY the patient themselves to approve the care request link and confirms the bed", async () => {
      const res = await request(app)
        .post(`/api/patients/${testPtCode}/approve-nurse`)
        .send({ userIdentifier: testPtCode });

      expect(res.status).toBe(200);
      expect(res.body.data.nurseAssignment.status).toBe("APPROVED");
      expect(res.body.data.bedLabel).toBe("ICU-42");
      expect(res.body.data.bedStatus).toBe("OCCUPIED");
      expect(res.body.data.status).toBe("ACTIVE");

      const dbBed = await Bed.findOne({ bedNumber: "ICU-42" });
      expect(dbBed?.status).toBe("OCCUPIED");
    });
  });
});
