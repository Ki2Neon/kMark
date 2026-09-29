import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const smoke = process.argv.includes("--smoke");
const perf = process.argv.includes("--perf");
const targetDir = resolve("target", "e2e");
const binary = resolve(targetDir, "debug", process.platform === "win32" ? "kmark.exe" : "kmark");
const environment = { ...process.env, VITE_KMARK_E2E: "1", CARGO_TARGET_DIR: targetDir };

function run(args, env = process.env) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

// Build the sidecar in the shared Cargo cache; isolate the desktop executable from tauri dev.
if (run(["run", "build:mcp-sidecar"]) !== 0) process.exit(1);
// Tauri's E2E beforeBuildCommand builds fresh WASM and Vite frontend.
if (run([
  "exec", "tauri", "build", "--debug", "--no-bundle", "--features", "e2e",
  "--config", "src-tauri/tauri.e2e.conf.json",
], environment) !== 0) process.exit(1);

const runRoot = mkdtempSync(join(tmpdir(), "kmark-e2e-"));
let status = 1;
try {
  status = run(["exec", "wdio", "run", perf ? "tests/perf/wdio.perf.conf.mjs" : "wdio.conf.mjs", ...(smoke ? ["--suite", "smoke"] : [])], {
    ...process.env,
    KMARK_E2E_APP_BINARY: binary,
    KMARK_E2E_RUN_ROOT: runRoot,
  });
} finally {
  const realTmp = realpathSync(tmpdir());
  const realRunRoot = realpathSync(runRoot);
  if (!basename(realRunRoot).startsWith("kmark-e2e-") || !realRunRoot.startsWith(`${realTmp}${sep}`)) {
    throw new Error(`Refusing E2E workspace cleanup outside temporary directory: ${realRunRoot}`);
  }
  const cleanupDeadline = Date.now() + 60_000;
  while (existsSync(realRunRoot)) {
    try {
      rmSync(realRunRoot, { recursive: true, force: false });
    } catch (error) {
      if (!new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]).has(error?.code) || Date.now() >= cleanupDeadline) {
        throw new Error(`E2E workspace cleanup failed: ${realRunRoot}`, { cause: error });
      }
      // WebView2 may release its user-data files after the WebDriver process exits.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  if (existsSync(realRunRoot)) throw new Error(`E2E workspace cleanup failed: ${realRunRoot}`);
}
if (status !== 0) process.exit(status);
