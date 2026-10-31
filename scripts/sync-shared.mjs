// Copies shared modules into the backend and frontend.
// Run from the repo root:  node scripts/sync-shared.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const pairs = [
  {
    src: "shared/commandRules.ts",
    dests: ["backend/src/shared/commandRules.ts", "frontend/src/lib/commandRules.ts"],
  },
  {
    src: "shared/netravaaniCommands.ts",
    dests: ["backend/src/shared/netravaaniCommands.ts", "frontend/src/lib/netravaaniCommands.ts"],
  },
];

for (const pair of pairs) {
  const source = resolve(root, pair.src);
  for (const t of pair.dests) {
    const dest = resolve(root, t);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    console.log(`synced ${pair.src} -> ${t}`);
  }
}
