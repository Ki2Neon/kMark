import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import "../../src/App.css";
import { MarkdownPreview } from "../../src/ui/components/MarkdownPreview";
import { DirtyIndicator } from "../../src/ui/components/DirtyIndicator";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type RenderedPreviewPage,
} from "../../src/domain/preview";

const host = document.querySelector("#root");
if (!(host instanceof HTMLElement)) throw new Error("root missing");
const fixtureParams = new URLSearchParams(location.search);
const a4ParagraphsPerPage = Math.max(0, Math.min(200, Number(fixtureParams.get("a4Paragraphs")) || 0));
if (fixtureParams.get("a4Contain") === "1") {
  const containmentStyle = document.createElement("style");
  containmentStyle.textContent = ".preview-section__page-frame { content-visibility: auto; }";
  document.head.append(containmentStyle);
}
const root = createRoot(host);
const first = "<h1>First</h1><p>unchanged section</p>";
const second = "<h2>Second</h2><p>before</p>";

function render(sectionHtmls: readonly string[], enableInteractiveViewportNavigation = false): void {
  flushSync(() => root.render(createElement(MarkdownPreview, {
    displayMode: "standard",
    enableInteractiveViewportNavigation,
    html: sectionHtmls.join(""),
    sectionHtmls,
  })));
}

try {
  render([first, second]);
  const segments = host.querySelectorAll(".preview-section__standard-segment");
  const oldFirst = segments[0];
  const oldFirstHeading = oldFirst?.querySelector("h1");
  const oldSecond = segments[1];
  render([first, second.replace("before", "after")]);
  const next = host.querySelectorAll(".preview-section__standard-segment");
  const result = {
    count: next.length,
    firstSurfaceSame: next[0] === oldFirst,
    firstHeadingSame: next[0]?.querySelector("h1") === oldFirstHeading,
    secondSurfaceSame: next[1] === oldSecond,
    secondText: next[1]?.textContent,
    sectionDisplay: next[0] ? getComputedStyle(next[0]).display : null,
  };
  render(['<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" /><svg><rect width="8" height="8" /></svg>'], true);
  const viewport = host.querySelector(".preview-section__body");
  if (!(viewport instanceof HTMLElement)) throw new Error("preview viewport missing");
  const drag = (target: Element, pointerId: number) => {
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, button: 0, isPrimary: true, pointerId,
    }));
    const nativeDrag = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(nativeDrag);
    viewport.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId }));
    return nativeDrag.defaultPrevented;
  };
  const img = host.querySelector("img");
  const rect = host.querySelector("svg rect");
  if (!(img instanceof HTMLImageElement) || !(rect instanceof SVGElement)) throw new Error("visual targets missing");
  const dragWithoutPan = new DragEvent("dragstart", { bubbles: true, cancelable: true });
  img.dispatchEvent(dragWithoutPan);
  const imageDragSuppressed = drag(img, 11);
  const svgDragSuppressed = drag(rect, 12);
  const { renderMermaidPreviewHtml } = await import("../../src/adapters/browser/browserMermaidRenderer");
  const mermaidHtml = await renderMermaidPreviewHtml(
    '<div class="kmark-mermaid-block" data-kmark-mermaid-index="0"><div class="kmark-mermaid-rendered"></div><details class="kmark-mermaid-source"><pre><code>flowchart LR\nA--&gt;B</code></pre></details></div>',
    { revision: 1, strict: true },
  );
  const indicatorHost = document.createElement("div");
  indicatorHost.className = "editor-shell";
  document.body.append(indicatorHost);
  const indicatorRoot = createRoot(indicatorHost);
  flushSync(() => indicatorRoot.render(createElement(DirtyIndicator, { isDirty: true })));
  const indicator = indicatorHost.querySelector(".editor-shell__dirty-indicator");
  if (!(indicator instanceof HTMLElement)) throw new Error("dirty indicator missing");
  const dirtyIndicatorVisible = getComputedStyle(indicator).opacity === "1"
    && indicator.textContent === "未保存の変更あり";
  flushSync(() => indicatorRoot.render(createElement(DirtyIndicator, { isDirty: false })));
  const cleanIndicatorHidden = getComputedStyle(indicator).opacity === "0"
    && indicator.textContent === "保存済み";
  const makePage = (html: string): RenderedPreviewPage => ({
    html,
    pageStyle: DEFAULT_PAGE_STYLE,
    textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
    pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
  });
  const tocHtml = '<div class="kmark-toc"><ol><li class="kmark-toc__item"><a class="kmark-toc__link" href="#page-2">First</a></li><li class="kmark-toc__item"><a class="kmark-toc__link" href="#page-200">Last</a></li></ol></div>';
  const pages = [
    makePage(tocHtml),
    ...Array.from({ length: 199 }, (_, index) => makePage(
      `<h1 id="page-${index + 2}">Page ${index + 2}</h1><p>before ${"content ".repeat(150)}</p>${Array.from(
        { length: a4ParagraphsPerPage },
        (_, paragraph) => `<p data-source-line-start="${paragraph}" data-source-line-end="${paragraph}">Paragraph ${paragraph}: ${"content ".repeat(8)}</p>`,
      ).join("")}`,
    )),
  ];
  const renderA4 = (nextPages: readonly RenderedPreviewPage[]) => flushSync(() => root.render(createElement(MarkdownPreview, {
    displayMode: "a4",
    html: "",
    pages: nextPages,
  })));
  renderA4(pages);
  const unchangedHeading = host.querySelectorAll(".preview-section__page h1")[198];
  const changedPages = [...pages];
  changedPages[1] = makePage(pages[1].html.replace("before", "after"));
  const updateStartedAt = performance.now();
  renderA4(changedPages);
  const a4UpdateMs = performance.now() - updateStartedAt;
  const a4NodeCount = host.getElementsByTagName("*").length;
  const a4Viewport = host.querySelector<HTMLElement>(".preview-section__body--a4");
  const layoutStartedAt = performance.now();
  const a4ScrollHeight = a4Viewport?.scrollHeight ?? 0;
  const a4ForcedLayoutMs = performance.now() - layoutStartedAt;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const a4UpdateToSecondFrameMs = performance.now() - updateStartedAt;
  const a4UnchangedHeadingSame = host.querySelectorAll(".preview-section__page h1")[198] === unchangedHeading;
  const a4TocPageNumbers = Array.from(host.querySelectorAll(".kmark-toc__page"), (node) => node.textContent);
  const changedHeadingPages = [...changedPages];
  changedHeadingPages[1] = makePage(changedPages[1].html.replace('id="page-2"', 'id="page-2-new"'));
  renderA4(changedHeadingPages);
  const a4MissingHeadingClearsToc = host.querySelector(".kmark-toc__page")?.textContent === "";
  const changedTocPages = [...changedHeadingPages];
  changedTocPages[0] = makePage(tocHtml.replace("#page-2", "#page-2-new"));
  renderA4(changedTocPages);
  const a4RenamedHeadingUpdatesToc = host.querySelector(".kmark-toc__page")?.textContent === "2";
  document.body.dataset.result = btoa(JSON.stringify({
    ...result,
    imageDragSuppressed,
    svgDragSuppressed,
    dragWithoutPanAllowed: !dragWithoutPan.defaultPrevented,
    mermaidRendered: mermaidHtml.includes("<svg"),
    dirtyIndicatorVisible,
    cleanIndicatorHidden,
    a4UpdateMs,
    a4NodeCount,
    a4ScrollHeight,
    a4ForcedLayoutMs,
    a4UpdateToSecondFrameMs,
    a4UnchangedHeadingSame,
    a4TocPageNumbers,
    a4MissingHeadingClearsToc,
    a4RenamedHeadingUpdatesToc,
  }));
} catch (error) {
  document.body.dataset.result = btoa(JSON.stringify({ error: String(error) }));
}
