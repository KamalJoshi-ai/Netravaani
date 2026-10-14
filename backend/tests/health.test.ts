import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";

describe("Health and Readiness API Endpoints", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;

  it("GET /api/health returns service status regardless of DB connection", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("service", "netravaani-backend");
    expect(res.body).toHaveProperty("timestamp");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("GET /api/health/ready returns 503 when MongoDB is disconnected", async () => {
    // Ensure disconnected state
    if (mongoose.connection.readyState !== 0) {
      await disconnectDatabase();
    }

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("status", "unhealthy");
    expect(res.body.database).toHaveProperty("connected", false);
  });

  it("GET /api/health/ready returns 200 when MongoDB is connected", async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    await connectDatabase(uri);

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ready");
    expect(res.body.database).toHaveProperty("connected", true);
    expect(res.body.database).toHaveProperty("state", "connected");

    await disconnectDatabase();
    await mongoServer.stop();
  });
});
