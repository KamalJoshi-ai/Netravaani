import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import {
  Device,
  Patient,
  DeviceAssignment,
  CareRequest,
  CommandRule,
  PatientCommunicationState,
} from "../src/models/index.js";
import { DEFAULT_RULES } from "../src/shared/commandRules.js";

describe("NetraVaani Mandatory Initial Communication Handshake & Request Gating", () => {
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
    await Promise.all([
      Device.deleteMany({}),
      Patient.deleteMany({}),
      DeviceAssignment.deleteMany({}),
      CareRequest.deleteMany({}),
      CommandRule.deleteMany({}),
      PatientCommunicationState.deleteMany({}),
    ]);
  });

  // Helper to create online device, patient, and assign them
  async function setupActivePatientDevice(patientName = "Rohan Sharma", deviceName = "NPG-01") {
    // 1. Device registration & online heartbeat
    const devRes = await request(app)
      .post("/api/devices")
      .send({ name: deviceName, isDevRegistration: true });
    const deviceId = devRes.body.data.deviceId;

    await request(app)
      .post(`/api/devices/${deviceId}/heartbeat`)
      .send({ batteryLevel: 95, firmwareVersion: "nv-4.0.0" });

    // 2. Patient registration
    const ptRes = await request(app)
      .post("/api/patients")
      .send({ displayName: patientName, bedLabel: "Bed-101", status: "ACTIVE" });
    const patientCode = ptRes.body.data.patientCode;

    // For direct dispatch testing in scenario 8
    await Patient.findByIdAndUpdate(ptRes.body.data._id, {
      $set: { "confirmationSettings.requireDispatchConfirmation": false },
    });

    // 3. Nurse allocates device to patient
    const assignRes = await request(app)
      .post(`/api/patients/${patientCode}/assign-device`)
      .send({ deviceId, assignedBy: "Head Nurse" });
    expect([200, 201]).toContain(assignRes.status);

    return { deviceId, patientCode, deviceDoc: devRes.body.data, patientDoc: ptRes.body.data };
  }

  // 1. Patient sends YES -> YES acknowledged & displayed; ledger remains empty
  it("Scenario 1: Patient sends YES -> YES validated; ledger remains empty", async () => {
    const { deviceId } = await setupActivePatientDevice();

    const yesEvent = await request(app)
      .post("/api/device-events")
      .send({
        eventId: `evt-yes-${Date.now()}`,
        deviceId,
        ruleId: "yes",
        label: "YES",
        counts: { eog: 3, emgLeft: 0, emgRight: 0, together: 0 },
      });

    expect(yesEvent.status).toBe(201);
    expect(yesEvent.body.accepted).toBe(true);

    // Communication state updated to WAITING_FOR_NO
    const stateRes = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(stateRes.body.data.handshakeStatus).toBe("WAITING_FOR_NO");
    expect(stateRes.body.data.communicationMode).toBe("MANDATORY_HANDSHAKE");
    expect(stateRes.body.data.yesSentAt).toBeDefined();

    // Live Calls Ledger MUST REMAIN EMPTY
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 2. Patient sends NO -> NO acknowledged & displayed; ledger remains empty
  it("Scenario 2: Patient sends NO first -> NO validated; ledger remains empty", async () => {
    const { deviceId } = await setupActivePatientDevice();

    const noEvent = await request(app)
      .post("/api/device-events")
      .send({
        eventId: `evt-no-${Date.now()}`,
        deviceId,
        ruleId: "no",
        label: "NO",
        counts: { eog: 0, emgLeft: 1, emgRight: 1, together: 1 },
      });

    expect(noEvent.status).toBe(201);
    expect(noEvent.body.accepted).toBe(true);

    // State updated to WAITING_FOR_YES
    const stateRes = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(stateRes.body.data.handshakeStatus).toBe("WAITING_FOR_YES");
    expect(stateRes.body.data.communicationMode).toBe("MANDATORY_HANDSHAKE");
    expect(stateRes.body.data.noSentAt).toBeDefined();

    // Ledger MUST REMAIN EMPTY
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 3. Only YES sent -> Additional commands remain blocked
  it("Scenario 3: Only YES sent -> Additional commands remain blocked", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Send YES
    await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "yes", counts: { eog: 3, emgLeft: 0, emgRight: 0, together: 0 } });

    // Attempt WATER command
    const waterEvent = await request(app)
      .post("/api/device-events")
      .send({
        deviceId,
        ruleId: "water",
        label: "WATER",
        counts: { eog: 5, emgLeft: 0, emgRight: 0, together: 0 },
      });

    expect(waterEvent.status).toBe(200);
    expect(waterEvent.body.accepted).toBe(false);
    expect(waterEvent.body.message).toMatch(/handshake is incomplete/i);

    // Ledger remains empty
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 4. Only NO sent -> Additional commands remain blocked
  it("Scenario 4: Only NO sent -> Additional commands remain blocked", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Send NO
    await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "no", counts: { eog: 0, emgLeft: 1, emgRight: 1, together: 1 } });

    // Attempt CALL NURSE command
    const callNurseEvent = await request(app)
      .post("/api/device-events")
      .send({
        deviceId,
        ruleId: "call_nurse",
        label: "CALL NURSE",
        counts: { eog: 0, emgLeft: 3, emgRight: 0, together: 0 },
      });

    expect(callNurseEvent.status).toBe(200);
    expect(callNurseEvent.body.accepted).toBe(false);
    expect(callNurseEvent.body.message).toMatch(/handshake is incomplete/i);

    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 5. Both sent successfully -> Normal communication enabled automatically
  it("Scenario 5: Both sent successfully -> Normal communication enabled automatically", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Send YES
    await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "yes", counts: { eog: 3, emgLeft: 0, emgRight: 0, together: 0 } });

    // Send NO
    const noEvent = await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "no", counts: { eog: 0, emgLeft: 1, emgRight: 1, together: 1 } });

    expect(noEvent.body.accepted).toBe(true);

    // State is COMPLETED and NORMAL_COMMUNICATION
    const stateRes = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(stateRes.body.data.handshakeStatus).toBe("COMPLETED");
    expect(stateRes.body.data.communicationMode).toBe("NORMAL_COMMUNICATION");
    expect(stateRes.body.data.completedAt).toBeDefined();

    // Ledger still empty (YES/NO never appear in ledger)
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 6. WATER before handshake -> Rejected and not displayed
  it("Scenario 6: WATER before handshake -> Rejected and not displayed", async () => {
    const { deviceId } = await setupActivePatientDevice();

    const waterEvent = await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "water", label: "WATER" });

    expect(waterEvent.body.accepted).toBe(false);
    expect(waterEvent.body.reason).toBe("HANDSHAKE_INCOMPLETE");

    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 7. CALL NURSE before handshake -> Rejected and not displayed
  it("Scenario 7: CALL NURSE before handshake -> Rejected and not displayed", async () => {
    const { deviceId } = await setupActivePatientDevice();

    const callNurseEvent = await request(app)
      .post("/api/device-events")
      .send({ deviceId, ruleId: "call_nurse", label: "CALL NURSE" });

    expect(callNurseEvent.body.accepted).toBe(false);
    expect(callNurseEvent.body.reason).toBe("HANDSHAKE_INCOMPLETE");

    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(0);
  });

  // 8. WATER after handshake -> Displayed on nurse dashboard
  it("Scenario 8: WATER after handshake -> Displayed on nurse dashboard", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Complete handshake: YES + NO
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "no" });

    // Send WATER
    const waterEvent = await request(app)
      .post("/api/device-events")
      .send({
        deviceId,
        ruleId: "water",
        label: "WATER",
        counts: { eog: 5, emgLeft: 0, emgRight: 0, together: 0 },
      });

    expect(waterEvent.status).toBe(201);
    expect(waterEvent.body.accepted).toBe(true);
    expect(waterEvent.body.data.action).toBe("WATER");

    // Displayed on nurse dashboard ledger
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(1);
    expect(ledgerRes.body.data[0].action).toBe("WATER");
  });

  // 9. Emergency before handshake -> Emergency alert triggered (Safety Exception)
  it("Scenario 9: Emergency before handshake -> Emergency alert triggered immediately", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Emergency signal arrives in MANDATORY_HANDSHAKE mode
    const emergEvent = await request(app)
      .post("/api/device-events")
      .send({
        deviceId,
        ruleId: "emergency",
        label: "EMERGENCY / SEVERE PAIN",
        alarm: true,
        urgent: true,
        counts: { eog: 0, emgLeft: 3, emgRight: 3, together: 3 },
      });

    expect(emergEvent.status).toBe(201);
    expect(emergEvent.body.accepted).toBe(true);
    expect(emergEvent.body.data.alarm).toBe(true);

    // Emergency MUST be present in Live Calls Ledger
    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(1);
    expect(ledgerRes.body.data[0].alarm).toBe(true);
    expect(ledgerRes.body.data[0].action).toBe("EMERGENCY");
  });

  // 10. Emergency after handshake -> Emergency alert triggered
  it("Scenario 10: Emergency after handshake -> Emergency alert triggered", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Handshake
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "no" });

    const emergEvent = await request(app)
      .post("/api/device-events")
      .send({
        deviceId,
        ruleId: "emergency",
        alarm: true,
        urgent: true,
      });

    expect(emergEvent.status).toBe(201);
    expect(emergEvent.body.data.alarm).toBe(true);

    const ledgerRes = await request(app).get("/api/care-requests");
    expect(ledgerRes.body.data).toHaveLength(1);
    expect(ledgerRes.body.data[0].alarm).toBe(true);
  });

  // 11. Duplicate YES event -> No duplicate request or false completion
  it("Scenario 11: Duplicate YES event -> No duplicate request or false completion", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Send YES 1st time
    const yes1 = await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });
    expect(yes1.body.isDuplicate).toBe(false);

    // Send YES 2nd time (duplicate/repeated)
    const yes2 = await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });
    expect(yes2.body.isDuplicate).toBe(true);

    // State MUST STILL BE WAITING_FOR_NO (not completed!)
    const stateRes = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(stateRes.body.data.handshakeStatus).toBe("WAITING_FOR_NO");
    expect(stateRes.body.data.communicationMode).toBe("MANDATORY_HANDSHAKE");

    // WATER remains blocked
    const water = await request(app).post("/api/device-events").send({ deviceId, ruleId: "water" });
    expect(water.body.accepted).toBe(false);
  });

  // 12. Dashboard refresh -> Handshake progress preserved
  it("Scenario 12: Dashboard refresh -> Handshake progress preserved", async () => {
    const { deviceId, patientCode } = await setupActivePatientDevice();

    // Send YES
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });

    // Nurse dashboard refreshes by calling GET /api/patients
    const ptList = await request(app).get("/api/patients");
    const ptItem = ptList.body.data.find((p: any) => p.patientCode === patientCode);

    expect(ptItem.communicationState).toBeDefined();
    expect(ptItem.communicationState.handshakeStatus).toBe("WAITING_FOR_NO");
    expect(ptItem.communicationState.communicationMode).toBe("MANDATORY_HANDSHAKE");

    // GET /api/patients/:patientCode
    const ptSingle = await request(app).get(`/api/patients/${patientCode}`);
    expect(ptSingle.body.data.communicationState.handshakeStatus).toBe("WAITING_FOR_NO");
  });

  // 13. Device reconnects -> Previous handshake progress restored
  it("Scenario 13: Device reconnects -> Previous handshake progress restored", async () => {
    const { deviceId } = await setupActivePatientDevice();

    // Send YES
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });

    // Device goes offline / reconnects with new heartbeat
    await request(app).post(`/api/devices/${deviceId}/heartbeat`).send({ batteryLevel: 90 });

    // Check state is preserved
    const devState = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(devState.body.data.handshakeStatus).toBe("WAITING_FOR_NO");

    // Now send NO on the reconnected device
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "no" });

    const finalState = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(finalState.body.data.handshakeStatus).toBe("COMPLETED");
    expect(finalState.body.data.communicationMode).toBe("NORMAL_COMMUNICATION");
  });

  // 14. New patient assigned -> Fresh independent handshake
  it("Scenario 14: New patient assigned -> Fresh independent handshake", async () => {
    const { deviceId, patientCode } = await setupActivePatientDevice("Patient A", "NPG-Alpha");

    // Complete handshake for Patient A
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "yes" });
    await request(app).post("/api/device-events").send({ deviceId, ruleId: "no" });

    const stateA = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(stateA.body.data.handshakeStatus).toBe("COMPLETED");

    // Unassign device from Patient A
    const unassign = await request(app)
      .post(`/api/patients/${patientCode}/unassign-device`)
      .send({ deviceId });
    expect(unassign.status).toBe(200);

    // Register Patient B
    const ptB = await request(app)
      .post("/api/patients")
      .send({ displayName: "Patient B", bedLabel: "Bed-202", status: "ACTIVE" });
    const patientCodeB = ptB.body.data.patientCode;

    // Allocate same device to Patient B
    await request(app)
      .post(`/api/patients/${patientCodeB}/assign-device`)
      .send({ deviceId, assignedBy: "Nurse Joy" });

    // New patient MUST start in fresh independent MANDATORY_HANDSHAKE / PENDING!
    const stateB = await request(app).get(`/api/patients/${patientCodeB}/communication-state`);
    expect(stateB.body.data.handshakeStatus).toBe("PENDING");
    expect(stateB.body.data.communicationMode).toBe("MANDATORY_HANDSHAKE");
    expect(stateB.body.data.yesSentAt).toBeUndefined();
    expect(stateB.body.data.noSentAt).toBeUndefined();

    // Additional commands for Patient B are blocked!
    const water = await request(app).post("/api/device-events").send({ deviceId, ruleId: "water" });
    expect(water.body.accepted).toBe(false);
  });

  // 15. Network failure during YES/NO -> No false completion; retry safely
  it("Scenario 15: Network retry with same eventId -> Safe idempotent retry without false completion", async () => {
    const { deviceId } = await setupActivePatientDevice();

    const eventId = "retry-event-12345";

    // Transmit YES
    const res1 = await request(app).post("/api/device-events").send({
      eventId,
      deviceId,
      ruleId: "yes",
    });
    expect(res1.body.accepted).toBe(true);
    expect(res1.body.isDuplicate).toBe(false);

    // Network retry of identical packet
    const res2 = await request(app).post("/api/device-events").send({
      eventId,
      deviceId,
      ruleId: "yes",
    });
    expect(res2.body.accepted).toBe(true);
    expect(res2.body.duplicate || res2.body.isDuplicate).toBe(true);

    // State MUST remain WAITING_FOR_NO, NOT falsely completed!
    const state = await request(app).get(`/api/devices/${deviceId}/communication-state`);
    expect(state.body.data.handshakeStatus).toBe("WAITING_FOR_NO");
    expect(state.body.data.communicationMode).toBe("MANDATORY_HANDSHAKE");
  });
});
