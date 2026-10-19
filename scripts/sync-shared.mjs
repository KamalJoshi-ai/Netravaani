// Copies shared/commandRules.ts into the backend and frontend.
// Both apps deploy separately, so each keeps its own copy of the one source file.
// Run from the repo root:  node scripts/sync-shared.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "shared/commandRules.ts");
const targets = ["backend/src/shared/commandRules.ts", "frontend/src/lib/commandRules.ts"];

for (const t of targets) {
  const dest = resolve(root, t);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  console.log(`synced ${t}`);
}
