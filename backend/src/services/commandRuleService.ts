import { ClientSession, Types } from "mongoose";
import { Device, IDevice } from "../models/Device.js";
import { CommandRule, ICommandRule } from "../models/CommandRule.js";
import { DeviceConfig, IDeviceConfig, IRuleSnapshot } from "../models/DeviceConfig.js";
import { AppError } from "../middleware/errorHandler.js";
import { runInTransaction } from "../lib/transaction.js";
import {
  CommandRule as RuleSpec,
  DEFAULT_RULES,
  MAX_PAYLOAD_BYTES,
  buildDevicePayload,
  payloadBytes,
  validateRule,
  validateRuleSet,
  validateRuleSetAll,
} from "../shared/commandRules.js";
import { DEFAULT_SPEECH_TEMPLATES } from "../shared/speechDefaults.js";

/** The six defaults with their voice phrases. */
const defaultEditableRules = (): EditableRule[] =>
  DEFAULT_RULES.map((r) => ({ ...r, speechTemplate: DEFAULT_SPEECH_TEMPLATES[r.id] }));

/** A rule as the dashboard edits it: the device rule plus its dashboard-only name. */
export interface EditableRule extends RuleSpec {
  displayLabel?: string;
  speechTemplate?: string;
}

export interface FieldError {
  rule: number | null; // 0-based index, or null for a rule-set problem
  field: string; // "id", "label", "eog", "emgLeft", "emgRight", "simultaneous", "alarm" or "rules"
  message: string;
}

export interface RuleVersionSummary {
  version: number;
  status: string;
  error: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  ruleCount: number;
  kind: "rules" | "legacy";
}

/* ---------------- conversions ---------------- */

function docToRule(r: ICommandRule): EditableRule {
  const out: EditableRule = {
    id: r.ruleKey,
    label: r.label,
    eog: [r.eogMin, r.eogMax],
    emgLeft: [r.leftMin, r.leftMax],
    emgRight: [r.rightMin, r.rightMax],
  };
  if (r.simultaneous) out.simultaneous = true;
  if (r.urgent) out.urgent = true;
  if (r.alarm) out.alarm = true;
  if (r.displayLabel) out.displayLabel = r.displayLabel;
  if (r.speechTemplate) out.speechTemplate = r.speechTemplate;
  return out;
}

function ruleToDoc(device: Types.ObjectId, r: EditableRule, sortOrder: number) {
  return {
    device,
    ruleKey: r.id,
    label: r.label,
    displayLabel: r.displayLabel?.trim() || undefined,
    speechTemplate: r.speechTemplate?.trim() || undefined,
    eogMin: r.eog[0],
    eogMax: r.eog[1],
    leftMin: r.emgLeft[0],
    leftMax: r.emgLeft[1],
    rightMin: r.emgRight[0],
    rightMax: r.emgRight[1],
    simultaneous: Boolean(r.simultaneous),
    urgent: Boolean(r.urgent),
    alarm: Boolean(r.alarm),
    sortOrder,
  };
}

function toSnapshot(r: EditableRule): IRuleSnapshot {
  const s: IRuleSnapshot = {
    id: r.id,
    label: r.label,
    eog: [r.eog[0], r.eog[1]],
    emgLeft: [r.emgLeft[0], r.emgLeft[1]],
    emgRight: [r.emgRight[0], r.emgRight[1]],
  };
  if (r.simultaneous) s.simultaneous = true;
  if (r.urgent) s.urgent = true;
  if (r.alarm) s.alarm = true;
  if (r.displayLabel?.trim()) s.displayLabel = r.displayLabel.trim();
  if (r.speechTemplate?.trim()) s.speechTemplate = r.speechTemplate.trim();
  return s;
}

/** Maps a validator message to the field the editor should highlight. */
function fieldFor(message: string): string {
  if (message.startsWith("id") || message.includes("same id")) return "id";
  if (message.startsWith("label")) return "label";
  if (message.includes("both hands together")) return "simultaneous";
  if (message.includes("alarm")) return "alarm";
  if (message.includes("1 to 10")) return "rules";
  return "counts";
}

/** Field-level errors for a 422 response, every problem at once. */
export function describeRuleErrors(rules: RuleSpec[]): FieldError[] {
  const errors: FieldError[] = [];
  for (const e of validateRuleSetAll(rules)) {
    if (e.rules.length === 0) errors.push({ rule: null, field: fieldFor(e.message), message: e.message });
    for (const i of e.rules) errors.push({ rule: i, field: fieldFor(e.message), message: e.message });
  }
  return errors;
}

function versionSummary(c: IDeviceConfig): RuleVersionSummary {
  return {
    version: c.version,
    status: c.status,
    error: c.failureReason || null,
    appliedAt: c.appliedAt || null,
    createdAt: c.createdAt,
    createdBy: c.createdBy || null,
    ruleCount: c.ruleSnapshot?.length ?? (Array.isArray(c.payload?.rules) ? c.payload!.rules.length : 0),
    kind: c.payload ? "rules" : "legacy",
  };
}

/* ---------------- service ---------------- */

export class CommandRuleService {
  private async findDevice(deviceId: string, session?: ClientSession): Promise<IDevice> {
    const device = await Device.findOne({ deviceId }).session(session || null);
    if (!device) throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    return device;
  }

  /**
   * Replaces the device's rules and writes the next immutable config version.
   * Must run inside runInTransaction so both writes commit together.
   */
  private async writeVersion(
    device: IDevice,
    rules: EditableRule[],
    createdBy: string | undefined,
    session: ClientSession | undefined
  ): Promise<IDeviceConfig> {
    const latest = await DeviceConfig.findOne({ device: device._id })
      .sort({ version: -1 })
      .select("version")
      .session(session || null)
      .lean();
    const version = latest ? latest.version + 1 : 1;
    const payload = buildDevicePayload(version, rules);

    if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) {
      throw new AppError(
        422,
        "CONFIG_TOO_LARGE",
        `This rule set is ${payloadBytes(payload)} bytes; the device accepts at most ${MAX_PAYLOAD_BYTES}`
      );
    }

    await CommandRule.deleteMany({ device: device._id }, { session });
    await CommandRule.insertMany(
      rules.map((r, i) => ruleToDoc(device._id as Types.ObjectId, r, i)),
      { session }
    );

    const [config] = await DeviceConfig.create(
      [
        {
          device: device._id,
          version,
          payload,
          ruleSnapshot: rules.map(toSnapshot),
          createdBy: createdBy || undefined,
          status: "PENDING",
        },
      ],
      { session }
    );

    device.desiredConfigVersion = version;
    await device.save({ session });
    return config;
  }

  /** Throws 422 with field-level errors if the rule set is not valid on the device. */
  private assertValid(rules: EditableRule[]): void {
    const verdict = validateRuleSet(rules);
    if (verdict) {
      throw new AppError(422, "RULES_INVALID", verdict.message, {
        rules: verdict.rules,
        errors: describeRuleErrors(rules),
      });
    }
  }

  /**
   * Gives a device the six default rules and config version 1. Pass the
   * session of the registration transaction so both commit together.
   * Does nothing if the device already has rules.
   */
  async seedDefaults(device: IDevice, session?: ClientSession, createdBy = "system"): Promise<boolean> {
    const existing = await CommandRule.countDocuments({ device: device._id }).session(session || null);
    if (existing > 0) return false;
    await this.writeVersion(device, defaultEditableRules(), createdBy, session);
    return true;
  }

  /** Backfill: gives every device without rules the defaults. Returns how many were seeded. */
  async backfillDefaults(): Promise<number> {
    const devicesWithRules = await CommandRule.distinct("device");
    const devices = await Device.find({ _id: { $nin: devicesWithRules } });
    let seeded = 0;
    for (const d of devices) {
      const did = await runInTransaction(async (session) => {
        const fresh = await Device.findById(d._id).session(session || null);
        return fresh ? this.seedDefaults(fresh, session, "backfill") : false;
      });
      if (did) seeded++;
    }
    return seeded;
  }

  async getRules(deviceId: string) {
    const device = await this.findDevice(deviceId);
    const [rules, versions] = await Promise.all([
      CommandRule.find({ device: device._id }).sort({ sortOrder: 1 }),
      DeviceConfig.find({ device: device._id }).sort({ version: -1 }).limit(30),
    ]);
    const summaries = versions.map(versionSummary);
    return {
      deviceId: device.deviceId,
      rules: rules.map(docToRule),
      latestVersion: summaries[0] || null,
      versions: summaries,
      appliedConfigVersion: device.appliedConfigVersion ?? null,
      desiredConfigVersion: device.desiredConfigVersion ?? null,
      lastSeenAt: device.lastSeenAt || null,
    };
  }

  /** Saves a complete rule list as the next version (status PENDING). */
  async saveRules(deviceId: string, rules: EditableRule[], createdBy?: string) {
    this.assertValid(rules);
    const config = await runInTransaction(async (session) => {
      const device = await this.findDevice(deviceId, session);
      return this.writeVersion(device, rules, createdBy, session);
    });
    return versionSummary(config);
  }

  async resetToDefaults(deviceId: string, createdBy?: string) {
    return this.saveRules(deviceId, defaultEditableRules(), createdBy);
  }

  /** Re-issues an older version's rules as a new version. */
  async revertToVersion(deviceId: string, version: number, createdBy?: string) {
    const device = await this.findDevice(deviceId);
    const old = await DeviceConfig.findOne({ device: device._id, version }).lean();
    if (!old) {
      throw new AppError(404, "CONFIG_NOT_FOUND", `Configuration version ${version} not found for device '${deviceId}'`);
    }
    const source = (old.ruleSnapshot as IRuleSnapshot[] | undefined) || (old.payload?.rules as IRuleSnapshot[] | undefined);
    if (!source || source.length === 0) {
      throw new AppError(
        400,
        "NOT_A_RULE_VERSION",
        `Version ${version} is a legacy gesture configuration and has no command rules to restore`
      );
    }
    return this.saveRules(deviceId, source as EditableRule[], createdBy);
  }

  /**
   * The compact payload the device downloads. If the newest version is a legacy
   * gesture-mapping version (no payload), the current rules are sent under that
   * version number so the device still converges on the version it was told about.
   */
  async getDevicePayload(deviceId: string) {
    const device = await this.findDevice(deviceId);
    const latest = await DeviceConfig.findOne({ device: device._id }).sort({ version: -1 }).lean();
    if (!latest) return null;
    if (latest.payload) return latest.payload;
    const rules = await CommandRule.find({ device: device._id }).sort({ sortOrder: 1 });
    if (rules.length === 0) return null;
    return buildDevicePayload(latest.version, rules.map(docToRule));
  }

  /** Device event CONFIG_APPLIED: marks that version APPLIED. */
  async markApplied(device: IDevice, appliedVersion: number): Promise<void> {
    await DeviceConfig.updateOne(
      { device: device._id, version: appliedVersion, status: { $ne: "APPLIED" } },
      { $set: { status: "APPLIED", appliedAt: new Date() }, $unset: { failureReason: 1 } }
    );
  }

  /** Device event CONFIG_FAILED: marks the rejected version FAILED with the device's reason. */
  async markFailed(device: IDevice, rejectedVersion: number, error?: string): Promise<void> {
    await DeviceConfig.updateOne(
      { device: device._id, version: rejectedVersion, status: { $ne: "APPLIED" } },
      { $set: { status: "FAILED", failureReason: error?.trim() || "Rejected by device" } }
    );
  }

  /** Dashboard name for a rule that fired, if the caregiver set one. */
  async displayLabelFor(device: IDevice, ruleId: string): Promise<string | undefined> {
    const rule = await CommandRule.findOne({ device: device._id, ruleKey: ruleId }).select("displayLabel").lean();
    return rule?.displayLabel || undefined;
  }
}

export const commandRuleService = new CommandRuleService();
