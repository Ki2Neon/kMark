import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

import { plantUmlAssetsPlugin } from "../../tools/vite-plantuml-assets.mjs";

export default defineConfig({
  cacheDir: "node_modules/.vite-kmark-perf-tests",
  plugins: [react(), plantUmlAssetsPlugin()],
  worker: { format: "es" },
  test: {
    include: ["tests/perf/**/*.perf.browser.test.{ts,tsx}"],
    testTimeout: 600_000,
    reporters: ["default", "./tests/perf/support/perfReporter.mjs"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
      screenshotFailures: true,
      screenshotDirectory: "artifacts/perf/screenshots",
      viewport: { width: 1280, height: 900 },
    },
  },
});
