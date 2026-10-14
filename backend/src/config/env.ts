import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000").transform((val) => parseInt(val, 10)),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI environment variable is required"),
  JWT_SECRET: z.string().default("netravaani-nurse-secure-jwt-key-2026"),
  HEARTBEAT_TIMEOUT_SECONDS: z.string().default("60").transform((val) => parseInt(val, 10)),
  RESEND_API: z.string().optional().default(""),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  EMAIL_FROM: z.string().default("CodeKart <noreply@kamaljoshi-ai.xyz>"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Configuration validation error:", parsed.error.format());
  throw new Error("Invalid backend environment configuration");
}

export const env = parsed.data;
