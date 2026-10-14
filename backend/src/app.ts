import os from "os";
import fs from "fs";
import path from "path";
import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { deviceRouter } from "./routes/devices.js";
import { patientRouter } from "./routes/patients.js";
import { deviceEventRouter } from "./routes/deviceEvents.js";
import { careRequestRouter } from "./routes/careRequests.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, ESP32 firmware)
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN === "*" || env.NODE_ENV === "development" || env.NODE_ENV === "test") {
          return callback(null, true);
        }
        const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  // Mount API endpoints (supports both /api and /api/v1)
  app.use("/api/auth", authRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/devices", deviceRouter);
  app.use("/api/patients", patientRouter);
  app.use("/api/device-events", deviceEventRouter);
  app.use("/api/care-requests", careRequestRouter);
  app.use("/api/requests", careRequestRouter);

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/devices", deviceRouter);
  app.use("/api/v1/patients", patientRouter);
  app.use("/api/v1/device-events", deviceEventRouter);
  app.use("/api/v1/care-requests", careRequestRouter);
  app.use("/api/v1/requests", careRequestRouter);

  // Device Kit Network Info Discovery
  app.get(["/api/info", "/api/v1/info"], (_req, res) => {
    const lanIps = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal)
      .map((i) => (i ? i.address : ""))
      .filter(Boolean);
    res.json({
      port: env.PORT,
      lanIps,
      status: "online",
      service: "netravaani-backend",
    });
  });

  // Standalone device setup tool from Device Kit
  app.get(["/setup", "/nv-setup.html"], (_req, res) => {
    const candidatePaths = [
      path.resolve(process.cwd(), "device-kit/test-tools/nv-setup.html"),
      path.resolve(process.cwd(), "../device-kit/test-tools/nv-setup.html"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    }
    return res.status(404).send("Device kit nv-setup.html not found on server");
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
