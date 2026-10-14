import { Request, Response } from "express";
import { getDatabaseStatus } from "../lib/db.js";

const startTime = Date.now();

export const getHealth = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    service: "netravaani-backend",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
};

export const getReadiness = (_req: Request, res: Response): void => {
  const dbStatus = getDatabaseStatus();

  if (!dbStatus.connected) {
    res.status(503).json({
      status: "unhealthy",
      database: {
        connected: false,
        state: dbStatus.state,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({
    status: "ready",
    database: {
      connected: true,
      state: dbStatus.state,
    },
    timestamp: new Date().toISOString(),
  });
};
