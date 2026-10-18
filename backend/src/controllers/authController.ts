import { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import User from "../models/User.js";
import { Patient } from "../models/Patient.js";
import { response } from "../utils/responsehandler.js";
import { sendVerificationToEmail } from "../config/emailConfig.js";
import { generateAccessToken } from "../utils/generateToken.js";
import logger from "../logger.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import { clearAuthCookies, getCookieOptions } from "../utils/cookies.js";
import { env } from "../config/env.js";

export { getCookieOptions };

const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days session for clinical nurse station
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface TokenPayload {
  userId: string;
  role: string;
  email?: string;
  username?: string;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setAccessCookie(res: Response, token: string): void {
  const baseOptions = getCookieOptions();
  res.cookie("access_token", token, {
    ...baseOptions,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  // Also set netravaani_token for backward compatibility
  res.cookie("netravaani_token", token, {
    ...baseOptions,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
}

// ─── register ────────────────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, isSeller } = req.body;
  const reqId = (req as any).id || crypto.randomUUID();

  if (!email || !password || !name) {
    throw new AppError("Name, email, and password are required", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedRole = role === "patient" ? "patient" : (role || (isSeller ? "seller" : "nurse"));
  logger.info("Register attempt", { email: normalizedEmail, role: normalizedRole, requestId: reqId });

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    logger.warn("Register failed - user already exists", { email: normalizedEmail, requestId: reqId });
    throw new AppError("User already exists", 409);
  }

  const plainToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(plainToken);
  const derivedUsername = (req.body.username || normalizedEmail.split("@")[0]).trim().toLowerCase();

  const user = await User.create({
    name,
    email: normalizedEmail,
    username: derivedUsername,
    password,
    role: normalizedRole,
    verificationToken: hashedToken,
    verificationTokenExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    isVerified: false,
  });

  // If registering as patient, ensure a corresponding clinical Patient document exists
  if (normalizedRole === "patient") {
    try {
      const cleanCode = (derivedUsername.length >= 4 ? derivedUsername : `PT-${Math.floor(100000 + Math.random() * 900000)}`).toUpperCase();
      user.patientCode = cleanCode;
      await user.save();

      const existingPatient = await Patient.findOne({
        $or: [{ patientCode: cleanCode }, { email: normalizedEmail }, { displayName: name }],
      });
      if (!existingPatient) {
        await Patient.create({
          patientCode: cleanCode,
          displayName: name,
          email: normalizedEmail,
          userId: user._id,
          status: "ACTIVE",
          password,
          nurseAssignment: { status: "NONE" },
        });
        logger.info("Auto-provisioned patient record", { patientCode: cleanCode, displayName: name, email: normalizedEmail });
      } else {
        existingPatient.email = normalizedEmail;
        existingPatient.userId = user._id;
        if (!existingPatient.patientCode) existingPatient.patientCode = cleanCode;
        await existingPatient.save();
      }
    } catch (ptErr) {
      logger.warn("Auto-provisioning patient record warning", { error: ptErr });
    }
  }

  try {
    await sendVerificationToEmail(user.email, plainToken);
  } catch (error) {
    logger.error("Verification email failed", {
      error,
      email: user.email,
      requestId: reqId,
    });
  }

  logger.info("User registered successfully", {
    userId: user.id,
    email: user.email,
    role: user.role,
    requestId: reqId,
  });

  return response(res, 201, "Registration successful. Please verify your email.", {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      patientCode: user.patientCode,
      isVerified: user.isVerified,
    },
  });
});

// ─── verifyEmail ──────────────────────────────────────────────────────────────

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token;
  const reqId = (req as any).id || crypto.randomUUID();

  logger.info("Email verification attempt", { requestId: reqId, ip: req.ip });

  if (!token) {
    logger.warn("Verification failed - token missing", { requestId: reqId });
    throw new AppError("Verification token missing", 400);
  }

  const user = await User.findOne({
    verificationToken: hashToken(token as string),
    verificationTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    logger.warn("Verification failed - invalid or expired token", { requestId: reqId });
    throw new AppError("Invalid or expired verification token", 401);
  }

  if (user.isVerified) {
    logger.warn("Verification failed - already verified", { userId: user.id, requestId: reqId });
    throw new AppError("User already verified", 400);
  }

  user.isVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpires = null;
  await user.save();

  const accessToken = generateAccessToken(user);
  setAccessCookie(res, accessToken);

  logger.info("Email verified successfully", { userId: user.id, email: user.email, requestId: reqId });

  return response(res, 200, "Email verified successfully", {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      isVerified: user.isVerified,
    },
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, username, password } = req.body;
  const reqId = (req as any).id || crypto.randomUUID();

  const identifier = (email || username || "").trim().toLowerCase();
  logger.info("Login attempt", { identifier, ip: req.ip, requestId: reqId });

  if (!identifier || !password) {
    throw new AppError("Email/username and password are required", 400);
  }

  // Support login by email OR username (e.g. nurse / admin)
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select("+password +passwordHash +verificationTokenExpires");

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordCorrect =
    (await user.comparePassword(password)) ||
    (password.trim() !== password && (await user.comparePassword(password.trim())));

  if (!isPasswordCorrect) {
    throw new AppError("Invalid email or password", 401);
  }

  // Check email verification
  if (!user.isVerified && user.email) {
    if (user.verificationTokenExpires && user.verificationTokenExpires.getTime() < Date.now()) {
      const plainToken = crypto.randomBytes(32).toString("hex");
      user.verificationToken = hashToken(plainToken);
      user.verificationTokenExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
      await user.save();

      try {
        await sendVerificationToEmail(user.email, plainToken);
      } catch (error) {
        logger.error("Verification email failed", {
          error,
          email: user.email,
          requestId: reqId,
        });
      }
      throw new AppError("Verification link expired. A new verification email has been sent.", 403);
    }
    throw new AppError("Please verify your email first , check your inbox", 403);
  }

  // If logging in as patient, ensure a corresponding Patient document exists and is linked
  if (user.role === "patient") {
    try {
      let patient = await Patient.findOne({
        $or: [
          { email: user.email },
          { userId: user._id },
          ...(user.patientCode ? [{ patientCode: user.patientCode }] : []),
          { displayName: user.name },
        ],
      });
      if (!patient) {
        const cleanCode = (user.patientCode || user.username || `PT-${Math.floor(100000 + Math.random() * 900000)}`).toUpperCase();
        patient = await Patient.create({
          patientCode: cleanCode,
          displayName: user.name,
          email: user.email,
          userId: user._id,
          status: "ACTIVE",
          password: "patient123",
          nurseAssignment: { status: "NONE" },
        });
        logger.info("Auto-provisioned patient record on login", { patientCode: cleanCode, displayName: user.name });
      }
      if (patient) {
        if (!user.patientCode || user.patientCode !== patient.patientCode) {
          user.patientCode = patient.patientCode;
          await user.save();
        }
        if (!patient.email || patient.email !== user.email || !patient.userId) {
          patient.email = user.email;
          patient.userId = user._id;
          await patient.save();
        }
      }
    } catch (ptErr) {
      logger.warn("Auto-provisioning patient record on login warning", { error: ptErr });
    }
  }

  const accessToken = generateAccessToken(user);
  setAccessCookie(res, accessToken);

  logger.info("User logged in successfully", { userId: user.id, email: user.email, requestId: reqId });

  return response(res, 200, "User logged in successfully", {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      patientCode: user.patientCode,
      profilePicture: user.profilePicture,
      isVerified: user.isVerified,
    },
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const reqId = (req as any).id || crypto.randomUUID();
  clearAuthCookies(res);
  logger.info("User logged out", { requestId: reqId, ip: req.ip });
  return response(res, 200, "Logged out successfully");
});

// ─── checkUserAuth ────────────────────────────────────────────────────────────

export const checkUserAuth = asyncHandler(async (req: Request, res: Response) => {
  // Extract user ID from req.id or token in cookie / header
  let userId = (req as any).id || (req as any).userId;

  if (!userId) {
    const token =
      req.cookies?.access_token ||
      req.cookies?.netravaani_token ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (token) {
      try {
        const decoded = jwt.verify(
          token,
          process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET
        ) as TokenPayload;
        userId = decoded.userId || (decoded as any).id;
      } catch {
        throw new AppError("Unauthenticated. Please log in to continue.", 401);
      }
    }
  }

  if (!userId) {
    throw new AppError("Unauthenticated. Please log in to continue.", 403);
  }

  const user = await User.findById(userId).select(
    "-password -passwordHash -verificationToken -verificationTokenExpires"
  );

  if (!user) {
    logger.error("checkUserAuth - user not found", { userId, requestId: (req as any).id });
    throw new AppError("User not found", 404);
  }

  return response(res, 200, "User retrieved successfully", { user });
});
