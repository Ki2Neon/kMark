import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import "../../src/App.css";
import { MarkdownPreview } from "../../src/ui/components/MarkdownPreview";

const host = document.querySelector("#root");
if (!(host instanceof HTMLElement)) throw new Error("root missing");
const root = createRoot(host);
const first = "<h1>First</h1><p>unchanged section</p>";
const second = "<h2>Second</h2><p>before</p>";

function render(sectionHtmls: readonly string[]): void {
  flushSync(() => root.render(createElement(MarkdownPreview, {
    displayMode: "standard",
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
  document.body.dataset.result = btoa(JSON.stringify(result));
} catch (error) {
  document.body.dataset.result = btoa(JSON.stringify({ error: String(error) }));
}
