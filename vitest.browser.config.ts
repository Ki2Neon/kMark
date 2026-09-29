import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { type BrowserCommand } from "vitest/node";
import react from "@vitejs/plugin-react";
import { plantUmlAssetsPlugin } from "./tools/vite-plantuml-assets.mjs";

const emulateMedia: BrowserCommand<[media: "print" | "screen"]> = async (context, media) => {
  if (context.provider.name !== "playwright") throw new Error("Print media requires Playwright");
  const page = (context as typeof context & {
    page: { emulateMedia(options: { media: "print" | "screen" }): Promise<void> };
  }).page;
  await page.emulateMedia({ media });
};

export default defineConfig({
  cacheDir: "node_modules/.vite-kmark-browser-tests-v2",
  plugins: [react(), plantUmlAssetsPlugin()],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "@codemirror/lang-markdown",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/highlight",
      "mermaid",
    ],
  },
  worker: { format: "es" },
  test: {
    include: ["tests/browser/**/*.browser.test.{ts,tsx}"],
    testTimeout: 45_000,
    reporters: ["default", "./tests/browser/support/failureReporter.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
      screenshotFailures: true,
      screenshotDirectory: "artifacts/browser/screenshots",
      trace: { mode: "retain-on-failure", tracesDir: "artifacts/browser/traces" },
      viewport: { width: 1280, height: 900 },
      commands: { emulateMedia },
    },
  },
});
