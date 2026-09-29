import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, test } from "vitest";

import "../../src/App.css";
import { MarkdownPreview } from "../../src/ui/components/MarkdownPreview";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type RenderedPreviewPage,
} from "../../src/domain/preview";
import { elapsedMilliseconds, reportPerformance, twoAnimationFrames } from "./support/report";

function makePage(html: string): RenderedPreviewPage {
  return {
    html,
    pageStyle: DEFAULT_PAGE_STYLE,
    textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
    pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
  };
}

function makePages(count: number): RenderedPreviewPage[] {
  return Array.from({ length: count }, (_, index) => makePage(
    `<h1 id="perf-page-${index}">Page ${index + 1}</h1>`
    + `<p data-source-line-start="${index}" data-source-line-end="${index}">`
    + `before ${"ordinary content ".repeat(150)}</p>`,
  ));
}

describe("A4 browser performance (headless Chromium)", () => {
  test.each([
    { pageCount: 20, containment: false },
    { pageCount: 20, containment: true },
    { pageCount: 200, containment: false },
    { pageCount: 200, containment: true },
  ])("$pageCount pages, content-visibility auto=$containment: initial mount and one-page edit", async ({ pageCount, containment }) => {
    const host = document.createElement("div");
    if (containment) host.className = "perf-page-containment";
    host.style.width = "1200px";
    host.style.height = "800px";
    const containmentStyle = document.createElement("style");
    containmentStyle.textContent = ".perf-page-containment .preview-section__page-frame { content-visibility: auto; }";
    document.head.append(containmentStyle);
    document.body.append(host);
    const root = createRoot(host);
    const pages = makePages(pageCount);
    const render = (nextPages: readonly RenderedPreviewPage[]) => flushSync(() => root.render(
      createElement(MarkdownPreview, { displayMode: "a4", html: "", pages: nextPages }),
    ));
    try {
      const mountStart = performance.now();
      render(pages);
      const initialCommitMs = elapsedMilliseconds(mountStart);
      const initialTwoFramesStart = performance.now();
      await twoAnimationFrames();
      const initialTwoFramesMs = elapsedMilliseconds(initialTwoFramesStart);

      const changedPages = [...pages];
      changedPages[1] = makePage(pages[1].html.replace("before", "after"));
      const updateStart = performance.now();
      render(changedPages);
      const updateCommitMs = elapsedMilliseconds(updateStart);
      const viewport = host.querySelector<HTMLElement>(".preview-section__body--a4");
      expect(viewport, "A4 viewport must exist before scroll-height timing").not.toBeNull();
      const layoutStart = performance.now();
      const scrollHeight = viewport!.scrollHeight;
      const scrollHeightReadMs = elapsedMilliseconds(layoutStart);
      await twoAnimationFrames();
      const updateTwoFramesMs = elapsedMilliseconds(updateStart);
      const domNodes = host.getElementsByTagName("*").length;
      expect(host.querySelectorAll(".preview-section__page").length).toBe(pageCount);
      expect(scrollHeight).toBeGreaterThan(0);

      reportPerformance("a4-preview-one-page-edit", "chromium-headless", {
        pageCount,
        containment,
        initialCommitMs,
        initialTwoFramesMs,
        updateCommitMs,
        scrollHeightReadMs,
        updateTwoFramesMs,
        domNodes,
        scrollHeight,
        contentVisibility: getComputedStyle(host.querySelector(".preview-section__page-frame")!).contentVisibility,
      });
    } finally {
      flushSync(() => root.unmount());
      host.remove();
      containmentStyle.remove();
    }
  });
});
