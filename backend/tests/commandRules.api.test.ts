import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import { resetTransactionSupportCache } from "../src/lib/transaction.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { Device, DeviceConfig, CommandRule, CareRequest, Patient, DeviceAssignment } from "../src/models/index.js";
import { commandRuleService } from "../src/services/commandRuleService.js";
import { DEFAULT_RULES } from "../src/shared/commandRules.js";

const nurseToken = generateAccessToken({ _id: new Types.ObjectId(), name: "Sister Priya", email: "priya@ward.test", role: "nurse" });
const patientToken = generateAccessToken({ _id: new Types.ObjectId(), name: "Pat", role: "patient" });
const asNurse = (r: request.Test) => r.set("Authorization", `Bearer ${nurseToken}`);

describe("Command rules: registration, editor API, device delivery and acknowledgement", () => {
  const app = createApp();
  let replSet: MongoMemoryReplSet;
  let deviceId: string;

  beforeAll(async () => {
    // A replica set, so the rule saves really run inside MongoDB transactions.
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    resetTransactionSupportCache();
    await connectDatabase(replSet.getUri());
    await Promise.all([Device.init(), DeviceConfig.init(), CommandRule.init(), CareRequest.init()]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Device.deleteMany({}),
      DeviceConfig.deleteMany({}),
      CommandRule.deleteMany({}),
      CareRequest.deleteMany({}),
      Patient.deleteMany({}),
      DeviceAssignment.deleteMany({}),
    ]);
    const res = await request(app).post("/api/devices/register").send({ hardwareId: "AA:BB:CC:00:11:22" });
    deviceId = res.body.deviceId;
  });

  const event = (body: Record<string, unknown>) =>
    request(app)
      .post("/api/device-events")
      .send({ eventId: `ev-${Math.random().toString(36).slice(2)}`, deviceId, ...body });

  it("a new registration gets the six default rules and config version 1", async () => {
    const res = await asNurse(request(app).get(`/api/devices/${deviceId}/rules`));
    expect(res.status).toBe(200);
    expect(res.body.data.rules.map((r: { id: string }) => r.id)).toEqual(DEFAULT_RULES.map((r) => r.id));
    expect(res.body.data.latestVersion).toMatchObject({ version: 1, status: "PENDING", kind: "rules" });
    expect(res.body.data.desiredConfigVersion).toBe(1);
  });

  it("GET /config returns the compact payload exactly as firmware nv-4.0.0 expects", async () => {
    const res = await request(app).get(`/api/devices/${deviceId}/config`).set("Authorization", "Bearer device-token");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.text).not.toContain("\n");
    expect(Buffer.byteLength(res.text)).toBeLessThan(3500);
    const body = JSON.parse(res.text);
    expect(Object.keys(body)).toEqual(["version", "rules"]);
    expect(body.version).toBe(1);
    expect(body.rules[0]).toEqual({ id: "yes", label: "YES", eog: [3, 4], emgLeft: [0, 0], emgRight: [0, 0] });
    expect(body.rules[1]).toEqual({ id: "no", label: "NO", eog: [0, 0], emgLeft: [1, 2], emgRight: [1, 2], simultaneous: true });
    expect(body.rules[5]).toMatchObject({ id: "emergency", simultaneous: true, urgent: true, alarm: true });
  });

  it("rejects an invalid rule set with 422 and field-level errors", async () => {
    const rules = [...DEFAULT_RULES, { id: "x", label: "X", eog: [3, 4], emgLeft: [0, 0], emgRight: [0, 0] }];
    const res = await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe("two rules can match the same gesture");
    expect(res.body.details.rules).toEqual([0, 6]);
    expect(res.body.details.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 6, field: "counts", message: "two rules can match the same gesture" })])
    );
    // Nothing was written
    const versions = await DeviceConfig.countDocuments({});
    expect(versions).toBe(1);
  });

  it("save -> PENDING -> CONFIG_APPLIED -> APPLIED, and the heartbeat tells the device to fetch", async () => {
    const rules = [
      ...DEFAULT_RULES,
      { id: "tv", label: "Turn on the TV", displayLabel: "टीवी चालू करो 📺", eog: [1, 1], emgLeft: [1, 1], emgRight: [0, 0] },
    ];
    const save = await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules });
    expect(save.status).toBe(201);
    expect(save.body.data).toMatchObject({ version: 2, status: "PENDING", createdBy: "Sister Priya" });

    const hb = await request(app).post(`/api/devices/${deviceId}/heartbeat`).send({});
    expect(hb.body.desiredConfigVersion).toBe(2);
    expect(hb.body.silenceAlarm).toBe(false);

    const cfg = JSON.parse((await request(app).get(`/api/devices/${deviceId}/config`)).text);
    expect(cfg.version).toBe(2);
    expect(cfg.rules[6]).toEqual({ id: "tv", label: "Turn on the TV", eog: [1, 1], emgLeft: [1, 1], emgRight: [0, 0] });
    expect(JSON.stringify(cfg)).not.toContain("displayLabel");

    const applied = await event({ eventType: "CONFIG_APPLIED", appliedVersion: 2 });
    expect(applied.status).toBe(201);

    const after = await asNurse(request(app).get(`/api/devices/${deviceId}/rules`));
    expect(after.body.data.latestVersion.status).toBe("APPLIED");
    expect(after.body.data.latestVersion.appliedAt).toBeTruthy();
    expect(after.body.data.appliedConfigVersion).toBe(2);
    expect(after.body.data.rules[6].displayLabel).toBe("टीवी चालू करो 📺");
  });

  it("save -> CONFIG_FAILED stores the device's error and keeps the applied version", async () => {
    await event({ eventType: "CONFIG_APPLIED", appliedVersion: 1 });
    const save = await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules: DEFAULT_RULES.slice().reverse() });
    expect(save.body.data.version).toBe(2);

    const failed = await event({ eventType: "CONFIG_FAILED", rejectedVersion: 2, appliedVersion: 1, error: "rule 3: label too long" });
    expect(failed.status).toBe(201);

    const after = await asNurse(request(app).get(`/api/devices/${deviceId}/rules`));
    expect(after.body.data.latestVersion).toMatchObject({ version: 2, status: "FAILED", error: "rule 3: label too long" });
    expect(after.body.data.appliedConfigVersion).toBe(1);
    expect(after.body.data.versions.find((v: { version: number }) => v.version === 1).status).toBe("APPLIED");
  });

  it("reset restores the defaults and revert re-issues an older version as a new one", async () => {
    const custom = DEFAULT_RULES.map((r) => (r.id === "water" ? { ...r, label: "PANI" } : r));
    await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules: custom }); // v2

    const reset = await asNurse(request(app).post(`/api/devices/${deviceId}/rules/reset`));
    expect(reset.body.data.version).toBe(3);
    let rules = (await asNurse(request(app).get(`/api/devices/${deviceId}/rules`))).body.data.rules;
    expect(rules.find((r: { id: string }) => r.id === "water").label).toBe("WATER");

    const revert = await asNurse(request(app).post(`/api/devices/${deviceId}/rules/revert/2`));
    expect(revert.status).toBe(201);
    expect(revert.body.data).toMatchObject({ version: 4, status: "PENDING" });
    rules = (await asNurse(request(app).get(`/api/devices/${deviceId}/rules`))).body.data.rules;
    expect(rules.find((r: { id: string }) => r.id === "water").label).toBe("PANI");

    const missing = await asNurse(request(app).post(`/api/devices/${deviceId}/rules/revert/99`));
    expect(missing.status).toBe(404);
  });

  it("only staff roles can read or change rules", async () => {
    expect((await request(app).get(`/api/devices/${deviceId}/rules`)).status).toBe(401);
    const asPatient = await request(app)
      .put(`/api/devices/${deviceId}/rules`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ rules: DEFAULT_RULES });
    expect(asPatient.status).toBe(403);
  });

  it("stores rule-based PATIENT_REQUESTs and lists them by display name, alarms first", async () => {
    const rules = DEFAULT_RULES.map((r) => (r.id === "water" ? { ...r, displayLabel: "पानी" } : r));
    await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules });

    const water = await event({
      eventType: "PATIENT_REQUEST",
      ruleId: "water",
      label: "WATER",
      counts: { eog: 4, emgLeft: 0, emgRight: 0, together: 0 },
      urgent: false,
      alarm: false,
      configVersion: 2,
      gestureId: "water",
      action: "WATER",
    });
    expect(water.status).toBe(201);
    expect(water.body.data).toMatchObject({ ruleId: "water", label: "WATER", alarm: false, urgent: false });
    expect(water.body.data.counts).toEqual({ eog: 4, emgLeft: 0, emgRight: 0, together: 0 });

    await event({
      eventType: "PATIENT_REQUEST",
      ruleId: "emergency",
      label: "EMERGENCY / SEVERE PAIN",
      counts: { eog: 0, emgLeft: 3, emgRight: 3, together: 3 },
      urgent: true,
      alarm: true,
      configVersion: 2,
    });

    const list = await request(app).get("/api/care-requests");
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ ruleId: "emergency", alarm: true, urgent: true, displayLabel: "EMERGENCY / SEVERE PAIN" });
    expect(list.body.data[1]).toMatchObject({ ruleId: "water", displayLabel: "पानी" });
  });

  it("stores voice phrases per rule and returns them with each request", async () => {
    const seeded = await asNurse(request(app).get(`/api/devices/${deviceId}/rules`));
    expect(seeded.body.data.rules.find((r: { id: string }) => r.id === "water").speechTemplate).toBe("wants {command}");

    const rules = seeded.body.data.rules.map((r: { id: string }) =>
      r.id === "water" ? { ...r, speechTemplate: "would like some {command}" } : r
    );
    await asNurse(request(app).put(`/api/devices/${deviceId}/rules`)).send({ rules });

    // The phrase is dashboard-only: the device payload is unchanged
    const cfg = (await request(app).get(`/api/devices/${deviceId}/config`)).text;
    expect(cfg).not.toContain("speechTemplate");

    await event({ eventType: "PATIENT_REQUEST", ruleId: "water", label: "WATER", configVersion: 2 });
    await event({ eventType: "PATIENT_REQUEST", ruleId: "emergency", label: "EMERGENCY / SEVERE PAIN", alarm: true, urgent: true, configVersion: 2 });
    const list = await request(app).get("/api/care-requests");
    const byRule = (id: string) => list.body.data.find((r: { ruleId: string }) => r.ruleId === id);
    expect(byRule("water").speechTemplate).toBe("would like some {command}");
    expect(byRule("emergency").speechTemplate).toBe("is in {command}");
  });

  it("backfill gives existing devices without rules the defaults, once", async () => {
    await Device.create({ deviceId: "npg-legacy01", name: "Old unit", status: "AVAILABLE", connectivityStatus: "NEVER_SEEN" });
    expect(await commandRuleService.backfillDefaults()).toBe(1);
    expect(await commandRuleService.backfillDefaults()).toBe(0);
    const legacy = await Device.findOne({ deviceId: "npg-legacy01" });
    expect(await CommandRule.countDocuments({ device: legacy!._id })).toBe(6);
    expect(legacy!.desiredConfigVersion).toBe(1);
  });
});
