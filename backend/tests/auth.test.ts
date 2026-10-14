import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/db.js";
import User from "../src/models/User.js";

describe("Authentication & Verification Flow (No Redis, No Refresh Tokens)", () => {
  const app = createApp();
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
    await User.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it("POST /api/auth/register creates user with isVerified: false and sends verification", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Dr. Ananya Sharma",
      email: "ananya@hospital.org",
      password: "SecurePassword123!",
      role: "doctor",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("Registration successful");
    expect(res.body.data.user.email).toBe("ananya@hospital.org");
    expect(res.body.data.user.isVerified).toBe(false);

    // Verify user in database
    const dbUser = await User.findOne({ email: "ananya@hospital.org" }).select(
      "+verificationToken +verificationTokenExpires"
    );
    expect(dbUser).not.toBeNull();
    expect(dbUser?.verificationToken).toBeTruthy();
    expect(dbUser?.verificationTokenExpires).toBeTruthy();
  });

  it("POST /api/auth/login fails with 403 if email is not yet verified", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "ananya@hospital.org",
      password: "SecurePassword123!",
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("verify your email first");
  });

  it("GET /api/auth/verify-email/:token successfully verifies email and sets access cookie", async () => {
    // Read raw user and manually simulate token verification
    // Since verificationToken in DB is SHA-256 of plainToken, let's test using a known plainToken
    const plainToken = "test_plain_verification_token_123456";
    const crypto = await import("crypto");
    const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");

    await User.updateOne(
      { email: "ananya@hospital.org" },
      { verificationToken: hashedToken, verificationTokenExpires: new Date(Date.now() + 3600000) }
    );

    const res = await request(app).get(`/api/auth/verify-email/${plainToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user.isVerified).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();

    // Check cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    expect(cookieArray.some((c: string) => c.includes("access_token="))).toBe(true);

    const updatedUser = await User.findOne({ email: "ananya@hospital.org" });
    expect(updatedUser?.isVerified).toBe(true);
  });

  it("POST /api/auth/login succeeds after verification and returns access token", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "ananya@hospital.org",
      password: "SecurePassword123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe("ananya@hospital.org");

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    expect(cookieArray.some((c: string) => c.includes("access_token="))).toBe(true);
  });

  it("GET /api/auth/me returns user info when authenticated via cookie", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "ananya@hospital.org",
      password: "SecurePassword123!",
    });

    const cookie = loginRes.headers["set-cookie"];
    expect(cookie).toBeDefined();
    const cookieHeader = Array.isArray(cookie) ? cookie : [cookie as string];

    const meRes = await request(app).get("/api/auth/me").set("Cookie", cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.status).toBe("success");
    expect(meRes.body.data.user.email).toBe("ananya@hospital.org");
    expect(meRes.body.data.user.name).toBe("Dr. Ananya Sharma");
  });

  it("POST /api/auth/logout clears auth cookies", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });
});
