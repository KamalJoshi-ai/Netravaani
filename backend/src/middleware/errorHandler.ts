import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export { AppError };

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle AppError or any error with statusCode
  if (err instanceof AppError || typeof err?.statusCode === "number") {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      status: "error",
      code: err.code || "APP_ERROR",
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // Handle MongoDB Duplicate Key Error (11000)
  if (err?.code === 11000) {
    res.status(409).json({
      status: "error",
      code: "CONFLICT",
      message: "A resource with these unique attributes already exists.",
    });
    return;
  }

  // Catch-all (Never leak stack traces in API response)
  console.error("[ServerError]:", err);
  res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: err?.message || "An internal server error occurred",
  });
}
