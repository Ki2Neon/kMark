import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rustcVersion = execFileSync("rustc", ["-vV"], {
  cwd: workspaceRoot,
  encoding: "utf8",
});
const host = rustcVersion.match(/^host:\s+(.+)$/m)?.[1]?.trim();

if (!host) {
  throw new Error("Failed to determine the Rust host target");
}

execFileSync("cargo", ["build", "--release", "-p", "kmark-mcp"], {
  cwd: workspaceRoot,
  stdio: "inherit",
});

const extension = process.platform === "win32" ? ".exe" : "";
const configuredTargetDir = process.env.CARGO_TARGET_DIR;
const targetDir = configuredTargetDir
  ? resolve(workspaceRoot, configuredTargetDir)
  : resolve(workspaceRoot, "target");
const source = resolve(targetDir, "release", `kmark-mcp${extension}`);
const destination = resolve(
  workspaceRoot,
  "src-tauri",
  "binaries",
  `kmark-mcp-${host}${extension}`,
);

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`Prepared MCP sidecar: ${destination}`);
