import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/perf/**/*.perf.node.test.ts"],
    testTimeout: 60_000,
    reporters: ["default", "./tests/perf/support/perfReporter.mjs"],
  },
});
