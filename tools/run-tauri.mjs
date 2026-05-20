import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const workspaceHash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 10);
const cargoTargetDir = process.env.CARGO_TARGET_DIR ?? join(tmpdir(), `kmark-tauri-${workspaceHash}`);

mkdirSync(cargoTargetDir, { recursive: true });

const result = spawnSync(
  "tauri",
  process.argv.slice(2),
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CARGO_TARGET_DIR: cargoTargetDir,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
