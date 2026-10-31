import { ClientSession, Types } from "mongoose";
import { Device, IDevice } from "../models/Device.js";
import { DeviceCommand, IDeviceCommand } from "../models/DeviceCommand.js";
import { DeviceConfig, IDeviceConfig } from "../models/DeviceConfig.js";
import { AppError } from "../middleware/errorHandler.js";
import { runInTransaction } from "../lib/transaction.js";
import {
  GESTURES,
  DEFAULT_COMMANDS,
  DEFAULT_SPEECH_MAP,
  DeviceCommandInput,
  DevicePayload,
  validateCommands,
  buildDevicePayload,
} from "../shared/netravaaniCommands.js";

export interface MergedCommand {
  id: string; // "c01".."c07"
  gestureNumber: number; // 1..7
  text: string;
  eog: [number, number];
  left: [number, number];
  right: [number, number];
  together: boolean;
  label: string;
  displayLabel?: string;
  speechTemplate?: string;
  urgent: boolean;
  alarm: boolean;
}

export interface VersionSummary {
  version: number;
  status: string;
  error: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  commandCount: number;
}

function versionSummary(c: IDeviceConfig): VersionSummary {
  const commands = (c.payload as any)?.commands || [];
  return {
    version: c.version,
    status: c.status,
    error: c.failureReason || null,
    appliedAt: c.appliedAt || null,
    createdAt: c.createdAt,
    createdBy: c.createdBy || null,
    commandCount: Array.isArray(commands) ? commands.length : 7,
  };
}

export class DeviceCommandService {
  /**
   * Robustly locate a device by deviceId, hardwareId, or bearer token.
   */
  async findDevice(identifier?: string, bearerToken?: string, session?: ClientSession): Promise<IDevice> {
    const query: any[] = [];
    if (identifier) {
      query.push({ deviceId: identifier });
      query.push({ hardwareId: identifier });
    }
    if (bearerToken) {
      query.push({ token: bearerToken });
    }

    if (query.length === 0) {
      throw new AppError(400, "MISSING_IDENTIFIER", "No device identifier or authorization token provided");
    }

    const device = await Device.findOne({ $or: query }).session(session || null);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${identifier || "token"}' not found`);
    }
    return device;
  }

  /**
   * Seed the 7 default commands and config version 1 for a new or unseeded device.
   */
  async seedDefaults(device: IDevice, session?: ClientSession, createdBy = "system"): Promise<boolean> {
    const existing = await DeviceCommand.countDocuments({ device: device._id }).session(session || null);
    if (existing > 0) return false;

    const initialCommands: DeviceCommandInput[] = DEFAULT_COMMANDS.map((c) => ({
      id: c.id,
      label: c.label,
      speechTemplate: DEFAULT_SPEECH_MAP[c.id],
      urgent: Boolean((c as any).urgent),
      alarm: Boolean((c as any).alarm),
    }));

    await this.writeVersion(device, initialCommands, createdBy, session);
    return true;
  }

  /**
   * Backfill: ensures every device in the DB has the 7 DeviceCommand rows and nv-5.0.0 config.
   */
  async backfillDefaults(): Promise<number> {
    const devices = await Device.find({});
    let upgraded = 0;
    for (const d of devices) {
      await runInTransaction(async (session) => {
        const fresh = await Device.findById(d._id).session(session || null);
        if (!fresh) return;

        // 1. Ensure 7 DeviceCommands exist
        const count = await DeviceCommand.countDocuments({ device: fresh._id }).session(session || null);
        if (count < 7) {
          const initialCommands: DeviceCommandInput[] = DEFAULT_COMMANDS.map((c) => ({
            id: c.id,
            label: c.label,
            speechTemplate: DEFAULT_SPEECH_MAP[c.id],
            urgent: Boolean((c as any).urgent),
            alarm: Boolean((c as any).alarm),
          }));
          for (const c of initialCommands) {
            await DeviceCommand.findOneAndUpdate(
              { device: fresh._id, gestureId: c.id },
              {
                $set: {
                  deviceId: fresh.deviceId,
                  label: c.label,
                  speechTemplate: c.speechTemplate,
                  urgent: Boolean(c.urgent),
                  alarm: Boolean(c.alarm),
                },
              },
              { upsert: true, session }
            );
          }
        }

        // 2. Fetch all 7 commands
        const cmds = await DeviceCommand.find({ device: fresh._id }).session(session || null);
        const commandInputs: DeviceCommandInput[] = cmds.map((c) => ({
          id: c.gestureId,
          label: c.label,
          urgent: c.urgent,
          alarm: c.alarm,
        }));

        // 3. Check latest DeviceConfig
        const latest = await DeviceConfig.findOne({ device: fresh._id })
          .sort({ version: -1 })
          .session(session || null);

        if (!latest) {
          const version = fresh.appliedConfigVersion || fresh.desiredConfigVersion || 1;
          const payload = buildDevicePayload(version, commandInputs);
          await DeviceConfig.create(
            [
              {
                device: fresh._id,
                version,
                payload,
                status: "APPLIED",
                appliedAt: new Date(),
                createdBy: "migration",
              },
            ],
            { session }
          );
          fresh.desiredConfigVersion = version;
          fresh.appliedConfigVersion = version;
          await fresh.save({ session });
          upgraded++;
        } else if (!latest.payload || !Array.isArray((latest.payload as any).commands) || (latest.payload as any).rules) {
          // Replace legacy payload containing "rules" with clean nv-5.0.0 payload
          const payload = buildDevicePayload(latest.version, commandInputs);
          latest.payload = payload;
          await latest.save({ session });
          if (!fresh.desiredConfigVersion) {
            fresh.desiredConfigVersion = latest.version;
            await fresh.save({ session });
          }
          upgraded++;
        }
      });
    }
    return upgraded;
  }

  /**
   * GET /api/devices/:id/commands: Returns the 7 commands merged with GESTURES,
   * plus version summaries and connectivity status.
   */
  async getCommands(identifier?: string, bearerToken?: string) {
    const device = await this.findDevice(identifier, bearerToken);
    let cmds = await DeviceCommand.find({ device: device._id });
    if (cmds.length < 7) {
      await this.seedDefaults(device);
      cmds = await DeviceCommand.find({ device: device._id });
    }

    const versions = await DeviceConfig.find({ device: device._id }).sort({ version: -1 }).limit(50);
    const summaries = versions.map(versionSummary);

    // Merge with GESTURES in canonical order
    const merged: MergedCommand[] = GESTURES.map((g, idx) => {
      const stored = cmds.find((c) => c.gestureId === g.id);
      return {
        id: g.id,
        gestureNumber: idx + 1,
        text: g.text,
        eog: [g.eog[0], g.eog[1]],
        left: [g.left[0], g.left[1]],
        right: [g.right[0], g.right[1]],
        together: g.together,
        label: stored?.label || DEFAULT_COMMANDS.find((d) => d.id === g.id)?.label || "COMMAND",
        displayLabel: stored?.displayLabel,
        speechTemplate: stored?.speechTemplate || DEFAULT_SPEECH_MAP[g.id],
        urgent: Boolean(stored?.urgent),
        alarm: Boolean(stored?.alarm),
      };
    });

    return {
      deviceId: device.deviceId,
      hardwareId: device.hardwareId,
      batteryLevel: device.batteryLevel,
      commands: merged,
      latestVersion: summaries[0] || null,
      versions: summaries,
      appliedConfigVersion: device.appliedConfigVersion ?? null,
      desiredConfigVersion: device.desiredConfigVersion ?? null,
      lastSeenAt: device.lastSeenAt || null,
      connectivityStatus: device.connectivityStatus,
      isOnline: device.connectivityStatus === "ONLINE",
    };
  }

  /**
   * PUT /api/devices/:id/commands: Takes all 7 commands, validates them,
   * updates the 7 rows, and creates a new DeviceConfigVersion (PENDING).
   */
  async saveCommands(identifier: string, commands: DeviceCommandInput[], createdBy?: string) {
    const errors = validateCommands(commands);
    if (errors.length > 0) {
      throw new AppError(422, "COMMANDS_INVALID", errors[0].message, { errors });
    }

    const config = await runInTransaction(async (session) => {
      const device = await this.findDevice(identifier, undefined, session);
      return this.writeVersion(device, commands, createdBy, session);
    });

    return versionSummary(config);
  }

  async resetToDefaults(identifier: string, createdBy?: string) {
    const initialCommands: DeviceCommandInput[] = DEFAULT_COMMANDS.map((c) => ({
      id: c.id,
      label: c.label,
      speechTemplate: DEFAULT_SPEECH_MAP[c.id],
      urgent: Boolean((c as any).urgent),
      alarm: Boolean((c as any).alarm),
    }));
    return this.saveCommands(identifier, initialCommands, createdBy);
  }

  async revertToVersion(identifier: string, targetVersion: number, createdBy?: string) {
    const device = await this.findDevice(identifier);
    const old = await DeviceConfig.findOne({ device: device._id, version: targetVersion }).lean();
    if (!old) {
      throw new AppError(404, "CONFIG_NOT_FOUND", `Configuration version ${targetVersion} not found`);
    }

    const payloadCommands = (old.payload as any)?.commands;
    if (!Array.isArray(payloadCommands) || payloadCommands.length !== 7) {
      throw new AppError(400, "INVALID_VERSION_PAYLOAD", `Version ${targetVersion} does not contain 7 commands`);
    }

    return this.saveCommands(identifier, payloadCommands as DeviceCommandInput[], createdBy);
  }

  /**
   * GET /api/devices/:id/config: Returns the exact compact JSON payload for firmware nv-5.0.0.
   * NEVER includes a "rules" key.
   */
  async getDevicePayload(identifier?: string, bearerToken?: string): Promise<DevicePayload | null> {
    const device = await this.findDevice(identifier, bearerToken);
    const latest = await DeviceConfig.findOne({ device: device._id }).sort({ version: -1 }).lean();

    // If latest config already has nv-5.0.0 commands payload without "rules" key
    if (latest?.payload && Array.isArray((latest.payload as any).commands) && !(latest.payload as any).rules) {
      return (latest.payload as unknown) as DevicePayload;
    }

    // Otherwise, build from DeviceCommand rows or defaults
    let cmds = await DeviceCommand.find({ device: device._id });
    if (cmds.length < 7) {
      await this.seedDefaults(device);
      cmds = await DeviceCommand.find({ device: device._id });
    }

    const inputs: DeviceCommandInput[] = cmds.map((c) => ({
      id: c.gestureId,
      label: c.label,
      urgent: c.urgent,
      alarm: c.alarm,
    }));

    const version = latest ? latest.version : 1;
    return buildDevicePayload(version, inputs);
  }

  async markApplied(device: IDevice, appliedVersion: number): Promise<void> {
    await DeviceConfig.updateOne(
      { device: device._id, version: appliedVersion },
      { $set: { status: "APPLIED", appliedAt: new Date() }, $unset: { failureReason: 1 } }
    );
  }

  async markFailed(device: IDevice, rejectedVersion: number, error?: string): Promise<void> {
    await DeviceConfig.updateOne(
      { device: device._id, version: rejectedVersion },
      { $set: { status: "FAILED", failureReason: error?.trim() || "Rejected by device" } }
    );
  }

  async displayLabelFor(device: IDevice, ruleId: string): Promise<string | undefined> {
    const cmd = await DeviceCommand.findOne({ device: device._id, gestureId: ruleId }).select("displayLabel label").lean();
    return cmd?.displayLabel || cmd?.label || undefined;
  }

  private async writeVersion(
    device: IDevice,
    commands: DeviceCommandInput[],
    createdBy: string | undefined,
    session: ClientSession | undefined
  ): Promise<IDeviceConfig> {
    const latest = await DeviceConfig.findOne({ device: device._id })
      .sort({ version: -1 })
      .select("version")
      .session(session || null)
      .lean();

    const version = latest ? latest.version + 1 : 1;
    const payload = buildDevicePayload(version, commands);

    // Upsert the 7 DeviceCommand documents
    for (const c of commands) {
      await DeviceCommand.findOneAndUpdate(
        { device: device._id, gestureId: c.id },
        {
          $set: {
            deviceId: device.deviceId,
            label: c.label,
            displayLabel: c.displayLabel?.trim() || undefined,
            speechTemplate: c.speechTemplate?.trim() || undefined,
            urgent: Boolean(c.urgent),
            alarm: Boolean(c.alarm),
          },
        },
        { upsert: true, session }
      );
    }

    const [config] = await DeviceConfig.create(
      [
        {
          device: device._id,
          version,
          payload,
          status: "PENDING",
          createdBy: createdBy || undefined,
        },
      ],
      { session }
    );

    device.desiredConfigVersion = version;
    await device.save({ session });
    return config;
  }
}

export const deviceCommandService = new DeviceCommandService();
