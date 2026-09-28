import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import "../../src/App.css";
import { MarkdownPreview } from "../../src/ui/components/MarkdownPreview";
import { DirtyIndicator } from "../../src/ui/components/DirtyIndicator";

const host = document.querySelector("#root");
if (!(host instanceof HTMLElement)) throw new Error("root missing");
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
  document.body.dataset.result = btoa(JSON.stringify({
    ...result,
    imageDragSuppressed: drag(img, 11),
    svgDragSuppressed: drag(rect, 12),
    dragWithoutPanAllowed: !dragWithoutPan.defaultPrevented,
    mermaidRendered: mermaidHtml.includes("<svg"),
    dirtyIndicatorVisible,
    cleanIndicatorHidden,
  }));
} catch (error) {
  document.body.dataset.result = btoa(JSON.stringify({ error: String(error) }));
}
