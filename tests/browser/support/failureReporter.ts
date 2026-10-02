import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Reporter, type TestCase } from "vitest/node";

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-|-$/gu, "").slice(0, 100);
}

export default class BrowserFailureReporter implements Reporter {
  async onTestCaseResult(testCase: TestCase): Promise<void> {
    const result = testCase.result();
    if (result.state !== "failed") return;

    const fileName = safeName(path.basename(testCase.module.relativeModuleId));
    const testName = safeName(testCase.fullName);
    const directory = path.resolve("artifacts", "browser", fileName, testName);
    await mkdir(directory, { recursive: true });

    const errors = result.errors.map((error) => ({
      name: error.name,
      message: error.message,
      stack: error.stack,
      expected: error.expected,
      actual: error.actual,
    }));
    const logs = testCase.logs().map((entry) => ({
      time: entry.time,
      type: entry.type,
      content: entry.content,
    }));
    const stateLine = [...logs].reverse().find((entry) => entry.content.startsWith("KMARK_TEST_STATE "));
    let observedState: unknown = null;
    if (stateLine) {
      try { observedState = JSON.parse(stateLine.content.slice("KMARK_TEST_STATE ".length)); }
      catch { observedState = { parseError: stateLine.content }; }
    }
    const screenshot = testCase.artifacts().find((artifact) => artifact.type === "internal:failureScreenshot");
    const screenshotPath = screenshot?.attachments?.[0]?.originalPath;
    if (screenshotPath) await copyFile(screenshotPath, path.join(directory, "screenshot.png"));

    await Promise.all([
      writeFile(path.join(directory, "frontend.log"), logs.map((entry) =>
        `${new Date(entry.time).toISOString()} ${entry.type} ${entry.content}`,
      ).join("\n"), "utf8"),
      writeFile(path.join(directory, "backend.log"), "Browser integration test: no desktop backend.\n", "utf8"),
      writeFile(path.join(directory, "state.json"), JSON.stringify({
        layer: "browser",
        test: testCase.fullName,
        observedState,
        diagnostic: testCase.diagnostic() ?? null,
      }, null, 2), "utf8"),
      writeFile(path.join(directory, "test-result.json"), JSON.stringify({
        suite: "browser",
        test: testCase.fullName,
        file: testCase.module.relativeModuleId,
        status: "failed",
        errors,
        logs,
        screenshot: screenshotPath ? "screenshot.png" : null,
      }, null, 2), "utf8"),
    ]);
  }
}
