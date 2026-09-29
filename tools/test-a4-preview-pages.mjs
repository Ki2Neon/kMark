import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { createServer } from "vite";

const previewPath = "src/ui/components/MarkdownPreview.tsx";
const pageFitPath = "src/domain/a4PageFit.ts";
const pageLayoutPath = "src/adapters/browser/browserPageLayout.ts";
const printDocumentPath = "src/infra/printDocument.ts";
const execFileAsync = promisify(execFile);

const [previewSource, pageLayoutSource, printDocumentSource] = await Promise.all([
  readFile(previewPath, "utf8"),
  readFile(pageLayoutPath, "utf8"),
  readFile(printDocumentPath, "utf8"),
]);
const vite = await createServer({
  appType: "custom",
  configFile: false,
  cacheDir: "node_modules/.vite-kmark-test-a4-preview-pages",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});
const pageFitModule = vite.ssrLoadModule(`/${pageFitPath}`);

test.after(async () => {
  await vite.close();
});

test("A4 preview connects physical pagination before page numbering", () => {
  assert.match(previewSource, /paginateA4RenderedPage/u);
  assert.match(previewSource, /resolveNumberedPreviewPages\(a4DisplayPages\)/u);
});

test("fit, page_fit, and page_fit_contain remain in explicit page payloads", async () => {
  await execFileAsync(
    "cargo",
    ["test", "-p", "kmark-core", "keeps_fit_variants_in_explicit_page_payloads", "--quiet"],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
  );
});

test("page_fit resolves the unscaled remaining page area", async () => {
  const { resolveA4PageContentRect, resolveA4PageFitAvailableSize } = await pageFitModule;

  assert.deepEqual(
    resolveA4PageContentRect(
      { left: 0, top: 0, right: 600, bottom: 800 },
      { left: 1, top: 1, right: 1, bottom: 1 },
      { left: 50, top: 50, right: 50, bottom: 50 },
      1,
    ),
    { left: 51, top: 51, right: 549, bottom: 749 },
  );

  assert.deepEqual(
    resolveA4PageFitAvailableSize(
      { left: 20, top: 40, right: 500, bottom: 800 },
      { left: 140, top: 260, right: 320, bottom: 400 },
      2,
    ),
    { width: 180, height: 270 },
  );
  assert.deepEqual(
    resolveA4PageFitAvailableSize(
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 120, top: 140, right: 160, bottom: 180 },
      1,
    ),
    { width: 0, height: 0 },
  );
  assert.match(previewSource, /syncA4PageLayout\(previewViewport\)/u);
  assert.match(pageLayoutSource, /pageFrameGeometry\(frame\)/u);
  assert.match(pageLayoutSource, /\[data-kmark-page-fit\]/u);
  assert.doesNotMatch(pageLayoutSource, /getAttribute\("style"\)\?\.includes/u);
  assert.match(printDocumentSource, /syncA4PageLayout\(printWindow\.document\)/u);
});

test("page_fit_contain preserves aspect ratio within both page limits", async () => {
  const { resolveA4PageFitContainSize } = await pageFitModule;

  assert.deepEqual(resolveA4PageFitContainSize(2, 300, 200), { width: 300, height: 150 });
  assert.deepEqual(resolveA4PageFitContainSize(2, 300, 100), { width: 200, height: 100 });
  assert.deepEqual(resolveA4PageFitContainSize(2, 0, 100), { width: 0, height: 0 });
  assert.equal(resolveA4PageFitContainSize(Number.NaN, 300, 200), null);
  assert.match(pageLayoutSource, /--kmark-page-fit-contain-width/u);
  assert.match(pageLayoutSource, /--kmark-page-fit-contain-height/u);
});

test("page_valign computes the spacer within fixed page bounds", async () => {
  const { resolveA4PageValignSpacerHeight } = await pageFitModule;
  assert.equal(resolveA4PageValignSpacerHeight("bottom", 800, 400, 2), 200);
  assert.equal(resolveA4PageValignSpacerHeight("center", 800, 400, 2), 100);
  assert.equal(resolveA4PageValignSpacerHeight("bottom", 800, 900, 2), 0);
  assert.match(pageLayoutSource, /data-kmark-page-layout-spacer/u);
});
