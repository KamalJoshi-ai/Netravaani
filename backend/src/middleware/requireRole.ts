import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./errorHandler.js";

/** Roles allowed to view and change a device's command rules. */
export const DEVICE_CONFIG_ROLES = ["nurse", "doctor", "admin"] as const;

export interface AuthedUser {
  id: string;
  name?: string;
  email?: string;
  role: string;
}

/**
 * Reads the signed-in user from the same access token the auth routes issue
 * (access_token cookie, or an Authorization: Bearer header), and allows only
 * the given roles. The user is attached as req.authUser.
 */
export function requireRole(roles: readonly string[]) {
  const allowed = roles.map((r) => r.toLowerCase());
  return (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.cookies?.access_token ||
      req.cookies?.netravaani_token ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return next(new AppError(401, "UNAUTHENTICATED", "Please sign in to continue"));
    }
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET) as Record<string, unknown>;
      const role = String(decoded.role || "").toLowerCase();
      if (!allowed.includes(role)) {
        return next(new AppError(403, "FORBIDDEN", "Your role cannot configure devices"));
      }
      (req as Request & { authUser?: AuthedUser }).authUser = {
        id: String(decoded.userId || decoded.id || ""),
        name: decoded.name ? String(decoded.name) : undefined,
        email: decoded.email ? String(decoded.email) : undefined,
        role,
      };
      return next();
    } catch {
      return next(new AppError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again"));
    }
  };
}

export function authUserOf(req: Request): AuthedUser | undefined {
  return (req as Request & { authUser?: AuthedUser }).authUser;
}
