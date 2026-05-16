import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const workspaceHash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 10);
const cargoTargetDir = join(tmpdir(), `kmark-wasm-${workspaceHash}`);

mkdirSync(cargoTargetDir, { recursive: true });

const result = spawnSync(
  "wasm-pack",
  [
    "build",
    "crates/kmark-web",
    "--target",
    "web",
    "--out-dir",
    "../../src/wasm/pkg",
    "--out-name",
    "kmark_web",
  ],
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
