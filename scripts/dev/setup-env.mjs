// Creates local env files from their committed examples. Never overwrites a
// file that has content (an empty file is treated as missing).
// Usage: pnpm setup:dev
import { copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const targets = [
  ["apps/backend/.env.example", "apps/backend/.env"],
  ["apps/admin-dashboard/.env.example", "apps/admin-dashboard/.env.local"],
  ["apps/employee-dashboard/.env.example", "apps/employee-dashboard/.env.local"],
];

for (const [example, target] of targets) {
  const from = join(root, example);
  const to = join(root, target);
  if (!existsSync(from)) {
    console.warn(`[setup:dev] missing ${example}, skipped`);
  } else if (existsSync(to) && statSync(to).size > 0) {
    console.log(`[setup:dev] ${target} already exists, left untouched`);
  } else {
    copyFileSync(from, to);
    console.log(`[setup:dev] created ${target} from ${example}`);
  }
}

// The desktop agent needs no copy: apps/desktop-agent/.env.development is
// committed and already points at localhost.
