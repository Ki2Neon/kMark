import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, test } from "vitest";

import "../../src/App.css";
import { renderGeneratedSvgPreviewHtml } from "../../src/adapters/browser/browserPlantUmlRenderer";
import { MarkdownPreview } from "../../src/ui/components/MarkdownPreview";
import { renderMarkdownPreviewWithWasm } from "../../src/wasm/kmarkWeb";
import { largeDocument } from "../fixtures/generators/largeDocument";
import { elapsedMilliseconds, reportPerformance, twoAnimationFrames } from "./support/report";

const DIAGRAM_COUNT = 100;

function plantUmlDocument(editTarget: boolean): string {
  const source = largeDocument(0, DIAGRAM_COUNT);
  return editTarget ? source.replace("diagram 51", "diagram 51 edited") : source;
}

async function markdownToHtml(source: string): Promise<string> {
  const result = await renderMarkdownPreviewWithWasm(source, null, "standard");
  if (result.mode !== "standard") throw new Error(`Unexpected preview mode: ${result.mode}`);
  return result.html;
}

describe("PlantUML browser performance (headless Chromium)", () => {
  test("100 local PlantUML diagrams: initial render and one-diagram edit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (html: string) => flushSync(() => root.render(
      createElement(MarkdownPreview, { displayMode: "standard", html, sectionHtmls: [html] }),
    ));
    const options = {
      documentKey: "perf-plantuml-100",
      plantumlRenderEpoch: 0,
      httpsHosts: [] as readonly string[],
      strict: true,
    };
    try {
      const wasmInitialStart = performance.now();
      const initialHtml = await markdownToHtml(plantUmlDocument(false));
      const wasmInitialMs = elapsedMilliseconds(wasmInitialStart);
      const initialRenderStart = performance.now();
      const initialSvgHtml = await renderGeneratedSvgPreviewHtml(initialHtml, { ...options, revision: 1 });
      const plantumlInitialMs = elapsedMilliseconds(initialRenderStart);
      const initialCommitStart = performance.now();
      render(initialSvgHtml);
      const reactInitialCommitMs = elapsedMilliseconds(initialCommitStart);
      await twoAnimationFrames();
      const initialSvgCount = host.querySelectorAll(".kmark-persistent-generated-svg-diagram svg").length;
      expect(initialSvgCount, "all generated diagrams must reach the React DOM").toBe(DIAGRAM_COUNT);

      const wasmEditStart = performance.now();
      const changedHtml = await markdownToHtml(plantUmlDocument(true));
      const wasmEditMs = elapsedMilliseconds(wasmEditStart);
      const updateStart = performance.now();
      const updatedSvgHtml = await renderGeneratedSvgPreviewHtml(changedHtml, { ...options, revision: 2 });
      const plantumlUpdateMs = elapsedMilliseconds(updateStart);
      const updateCommitStart = performance.now();
      render(updatedSvgHtml);
      const reactUpdateCommitMs = elapsedMilliseconds(updateCommitStart);
      await twoAnimationFrames();
      const svgCount = host.querySelectorAll(".kmark-persistent-generated-svg-diagram svg").length;
      expect(svgCount).toBe(DIAGRAM_COUNT);
      expect(host.textContent).toContain("edited");

      reportPerformance("plantuml-100-one-diagram-edit", "chromium-headless", {
        diagramCount: DIAGRAM_COUNT,
        wasmInitialMs,
        plantumlInitialMs,
        reactInitialCommitMs,
        wasmEditMs,
        plantumlUpdateMs,
        reactUpdateCommitMs,
        svgCount,
        domNodes: host.getElementsByTagName("*").length,
      });
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  }, 600_000);
});
