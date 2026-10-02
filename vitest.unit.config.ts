import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx,mjs}"],
    passWithNoTests: false,
  },
});
