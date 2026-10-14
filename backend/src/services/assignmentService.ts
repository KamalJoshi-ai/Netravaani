import { Device } from "../models/Device.js";
import { Patient } from "../models/Patient.js";
import { DeviceAssignment, IDeviceAssignment } from "../models/DeviceAssignment.js";
import { AppError } from "../middleware/errorHandler.js";

export interface AssignDeviceDto {
  deviceId: string;
  patientCode: string;
  assignedBy?: string;
}

export interface UnassignDeviceDto {
  deviceId: string;
  notes?: string;
}

export class AssignmentService {
  async assignDevice(dto: AssignDeviceDto): Promise<IDeviceAssignment> {
    const { deviceId, patientCode, assignedBy } = dto;

    // 1. Verify Device exists and can be assigned
    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    if (device.status === "DISABLED") {
      throw new AppError(400, "DEVICE_DISABLED", `Device '${deviceId}' is disabled and cannot be assigned`);
    }

    // 2. Verify Patient exists and is ACTIVE
    const patient = await Patient.findOne({ patientCode });
    if (!patient) {
      throw new AppError(404, "PATIENT_NOT_FOUND", `Patient '${patientCode}' not found`);
    }

    if (patient.status !== "ACTIVE") {
      throw new AppError(400, "PATIENT_INACTIVE", `Cannot assign device to inactive patient '${patientCode}'`);
    }

    // Check if patient already has an active device assigned
    const patientActiveAssignment = await DeviceAssignment.findOne({
      patient: patient._id,
      isActive: true,
    }).populate("device", "deviceId name");

    if (patientActiveAssignment) {
      const assignedDevice = patientActiveAssignment.device as unknown as { deviceId?: string };
      throw new AppError(
        409,
        "PATIENT_ALREADY_ASSIGNED",
        `Patient '${patientCode}' is already assigned to device '${assignedDevice?.deviceId || "another device"}'`
      );
    }

    // 3. Atomically check that device is not already actively assigned
    // We attempt to transition device status to ASSIGNED atomically
    const updatedDevice = await Device.findOneAndUpdate(
      { _id: device._id, status: { $ne: "ASSIGNED" } },
      { $set: { status: "ASSIGNED" } },
      { new: true }
    );

    if (!updatedDevice) {
      throw new AppError(
        409,
        "DEVICE_ALREADY_ASSIGNED",
        `A single device can only be allocated to a single patient at a time. Device '${deviceId}' is already allocated to another active patient. Please unassign it first before reallocating.`
      );
    }

    // 4. Create active assignment record
    try {
      const assignment = await DeviceAssignment.create({
        device: device._id,
        patient: patient._id,
        assignedBy: assignedBy || undefined,
        assignedAt: new Date(),
        isActive: true,
      });

      const populated = await assignment.populate([
        { path: "device", select: "deviceId name status" },
        { path: "patient", select: "patientCode displayName bedLabel" },
      ]);

      return populated;
    } catch (err: unknown) {
      // Rollback device status if assignment creation fails (e.g. index race condition)
      await Device.findByIdAndUpdate(device._id, { status: "AVAILABLE" });
      if ((err as { code?: number; keyPattern?: Record<string, number> }).code === 11000) {
        const keyPattern = (err as { keyPattern?: Record<string, number> }).keyPattern;
        if (keyPattern && keyPattern.patient) {
          throw new AppError(
            409,
            "PATIENT_ALREADY_ASSIGNED",
            `Patient '${patientCode}' already has an active device assignment recorded`
          );
        }
        throw new AppError(
          409,
          "DEVICE_ALREADY_ASSIGNED",
          `Device '${deviceId}' already has an active assignment recorded`
        );
      }
      throw err;
    }
  }

  async unassignDevice(dto: UnassignDeviceDto): Promise<IDeviceAssignment> {
    const { deviceId } = dto;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", `Device '${deviceId}' not found`);
    }

    // Atomically find the active assignment and mark it closed
    const assignment = await DeviceAssignment.findOneAndUpdate(
      { device: device._id, isActive: true },
      {
        $set: {
          isActive: false,
          unassignedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!assignment) {
      throw new AppError(
        404,
        "NO_ACTIVE_ASSIGNMENT",
        `Device '${deviceId}' does not currently have an active assignment`
      );
    }

    // Update device status back to AVAILABLE
    await Device.findByIdAndUpdate(device._id, { status: "AVAILABLE" });

    const populated = await assignment.populate([
      { path: "device", select: "deviceId name status" },
      { path: "patient", select: "patientCode displayName bedLabel" },
    ]);

    return populated;
  }
}

export const assignmentService = new AssignmentService();
