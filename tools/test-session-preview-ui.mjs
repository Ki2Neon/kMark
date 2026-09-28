import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  cacheDir: "node_modules/.vite-kmark-test-session-preview-ui",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});
test.after(async () => { await vite.close(); });

test("standard preview keeps explicit source sections as separate HTML surfaces", async () => {
  const { MarkdownPreview } = await vite.ssrLoadModule("/src/ui/components/MarkdownPreview.tsx");
  const markup = renderToStaticMarkup(createElement(MarkdownPreview, {
    displayMode: "standard",
    html: "<p>first</p><p>second</p>",
    sectionHtmls: ["<p>first</p>", "<p>second</p>"],
  }));
  assert.equal(markup.match(/class="preview-section__standard-segment"/gu)?.length, 2);
  assert.match(markup, /preview-section__standard-content markdown-body/u);
  assert.doesNotMatch(markup, /class="preview-section__standard-content markdown-body"[^>]*><p>first/u);
});
