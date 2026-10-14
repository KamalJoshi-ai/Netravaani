import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./lib/db.js";
import { startConnectivityWatchdog, stopConnectivityWatchdog } from "./services/deviceService.js";
// NetraVaani Clinical Backend Server - v2.1.0 with Patient Bedside Auth
async function bootstrap() {
  const app = createApp();

  try {
    await connectDatabase(env.MONGODB_URI);
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
