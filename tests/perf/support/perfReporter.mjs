import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Records benchmark numbers independently of Vitest's human-readable console reporter. */
export default class PerfReporter {
  #measurements = [];

  onUserConsoleLog(log) {
    for (const line of log.content.split(/\r?\n/u)) {
      if (!line.startsWith("KMARK_PERF ")) continue;
      this.#measurements.push({ ...JSON.parse(line.slice("KMARK_PERF ".length)), taskId: log.taskId ?? null });
    }
  }

  async onTestRunEnd(_modules, errors, reason) {
    const environment = this.#measurements[0]?.environment ?? "unknown";
    const output = resolve(`artifacts/perf/${environment === "node" ? "node" : "browser"}-metrics.json`);
    await mkdir(resolve("artifacts/perf"), { recursive: true });
    await writeFile(output, `${JSON.stringify({
      schemaVersion: 1,
      runAt: new Date().toISOString(),
      environment,
      result: reason,
      runnerErrors: errors.map((error) => String(error)),
      measurements: this.#measurements,
    }, null, 2)}\n`, "utf8");
  }
}
