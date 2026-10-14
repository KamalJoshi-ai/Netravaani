import { Router } from "express";
import { getHealth, getReadiness } from "../controllers/healthController.js";

export const healthRouter = Router();

healthRouter.get("/", getHealth);
healthRouter.get("/ready", getReadiness);
