import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./lib/db.js";
import { startConnectivityWatchdog, stopConnectivityWatchdog } from "./services/deviceService.js";
import { commandRuleService } from "./services/commandRuleService.js";
import { deviceCommandService } from "./services/deviceCommandService.js";

// NetraVaani Clinical Backend Server - v2.1.0 with Patient Bedside Auth
async function bootstrap() {
  const app = createApp();

  try {
    await connectDatabase(env.MONGODB_URI);
    // Backfill nv-5.0.0 per-device commands and compact config payload
    deviceCommandService
      .backfillDefaults()
      .then((n) => n > 0 && console.log(`[Migration] Backfilled nv-5.0.0 commands and config on ${n} device(s)`))
      .catch((e) => console.error("[Migration] Device commands backfill failed:", e));

    // Migration 2026-10-19-command-rules: devices without command rules get the defaults.
    commandRuleService
      .backfillDefaults()
      .then((n) => n > 0 && console.log(`[Migration] Seeded default command rules on ${n} device(s)`))
      .catch((e) => console.error("[Migration] Command rule backfill failed:", e));
  } catch (err) {
    console.warn("[Server] Initial MongoDB connection failed. Will serve health checks with degraded readiness.");
  }

  // Start background connectivity watchdog for heartbeat timeouts
  startConnectivityWatchdog();

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`[Netravaani Backend] Server running on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
    console.log(`[Netravaani Backend] Local loopback: http://localhost:${env.PORT}`);
    console.log(`[Netravaani Backend] Wi-Fi / LAN access: http://<LAPTOP_LAN_IP>:${env.PORT}`);
  });
  
  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    stopConnectivityWatchdog();
    server.close(() => {
      console.log("[Server] HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
