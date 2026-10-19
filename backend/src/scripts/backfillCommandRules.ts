/**
 * Migration 2026-10-19-command-rules: gives every device that has no command
 * rules the six defaults and a new config version. Safe to run more than once.
 *
 *   npm run migrate:command-rules
 *
 * The server also runs this once at startup, so a deploy applies it automatically.
 */
import { env } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../lib/db.js";
import { commandRuleService } from "../services/commandRuleService.js";

async function main() {
  await connectDatabase(env.MONGODB_URI);
  const seeded = await commandRuleService.backfillDefaults();
  console.log(`[migrate:command-rules] seeded default rules on ${seeded} device(s)`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error("[migrate:command-rules] failed:", err);
  await disconnectDatabase();
  process.exit(1);
});
