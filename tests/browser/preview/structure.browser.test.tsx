import { expect, test, vi } from "vitest";
import "../../../src/App.css";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type RenderedPreviewPage,
} from "../../../src/domain/preview";
import { mountPreview } from "../support/mountPreview";

const makePage = (html: string): RenderedPreviewPage => ({
  html,
  pageStyle: DEFAULT_PAGE_STYLE,
  textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
  pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
  pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
});

test("standard sections retain their DOM while one section changes", () => {
  const preview = mountPreview();
  try {
    const sections = ["<h1>First</h1><p>unchanged</p>", "<h2>Second</h2><p>before</p>"];
    preview.render({ mode: "standard", html: sections.join(""), sectionHtmls: sections,
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    const first = preview.host.querySelectorAll(".preview-section__standard-segment")[0];
    const heading = first.querySelector("h1");
    const second = preview.host.querySelectorAll(".preview-section__standard-segment")[1];
    const changed = [sections[0], sections[1].replace("before", "after")];
    preview.render({ mode: "standard", html: changed.join(""), sectionHtmls: changed,
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    const next = preview.host.querySelectorAll(".preview-section__standard-segment");
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(first);
    expect(next[0].querySelector("h1")).toBe(heading);
    expect(next[1]).toBe(second);
    expect(next[1].textContent).toContain("after");
    expect(getComputedStyle(next[0]).display).toBe("contents");
    expect(preview.host.querySelector(".preview-section__standard-content > p")).toBeNull();
  } finally {
    preview.dispose();
  }
});

test("A4 renders only explicit pages and retains an unchanged page", () => {
  const preview = mountPreview();
  try {
    const longHtml = Array.from({ length: 1000 }, (_, index) => `<p>line ${index}</p>`).join("");
    preview.render({ mode: "a4", pages: [makePage(longHtml)],
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    expect(preview.host.querySelectorAll(".preview-section__page-frame")).toHaveLength(1);

    const pages = [makePage("<h1>First</h1><p>before</p>"), makePage("<h1>Last</h1><p>same</p>")];
    preview.render({ mode: "a4", pages, defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    const lastPage = preview.host.querySelectorAll(".preview-section__page-frame")[1];
    const lastHeading = lastPage.querySelector("h1");
    preview.render({ mode: "a4", pages: [makePage("<h1>First</h1><p>after</p>"), pages[1]],
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    expect(preview.host.querySelectorAll(".preview-section__page-frame")[1]).toBe(lastPage);
    expect(lastPage.querySelector("h1")).toBe(lastHeading);
  } finally {
    preview.dispose();
  }
});

test("preview suppresses native image and SVG drag only during pan", () => {
  const preview = mountPreview();
  try {
    preview.render({ mode: "standard", html: '<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="/><svg><rect width="8" height="8"/></svg>',
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE }, true);
    const viewport = preview.host.querySelector<HTMLElement>(".preview-section__body");
    const img = preview.host.querySelector("img");
    const rect = preview.host.querySelector("svg rect");
    expect(viewport).not.toBeNull();
    expect(img).not.toBeNull();
    expect(rect).not.toBeNull();
    const drag = (target: Element, pointerId: number) => {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true, pointerId }));
      const event = new DragEvent("dragstart", { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      viewport!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId }));
      return event.defaultPrevented;
    };
    const idleDrag = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    img!.dispatchEvent(idleDrag);
    expect(idleDrag.defaultPrevented).toBe(false);
    expect(drag(img!, 11)).toBe(true);
    expect(drag(rect!, 12)).toBe(true);
  } finally {
    preview.dispose();
  }
});

test("A4 table of contents tracks changed headings", () => {
  const preview = mountPreview();
  try {
    const toc = '<div class="kmark-toc"><ol><li class="kmark-toc__item"><a class="kmark-toc__link" href="#first">First</a></li><li class="kmark-toc__item"><a class="kmark-toc__link" href="#last">Last</a></li></ol></div>';
    const pages = [makePage(toc), makePage('<h1 id="first">First</h1>'), makePage('<h1 id="last">Last</h1>')];
    const renderPages = (next: RenderedPreviewPage[]) => preview.render({ mode: "a4", pages: next,
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    renderPages(pages);
    expect(Array.from(preview.host.querySelectorAll(".kmark-toc__page"), (node) => node.textContent)).toEqual(["2", "3"]);
    const renamed = [pages[0], makePage('<h1 id="renamed">First</h1>'), pages[2]];
    renderPages(renamed);
    expect(preview.host.querySelector(".kmark-toc__page")?.textContent).toBe("");
    renderPages([makePage(toc.replace("#first", "#renamed")), ...renamed.slice(1)]);
    expect(preview.host.querySelector(".kmark-toc__page")?.textContent).toBe("2");
  } finally {
    preview.dispose();
  }
});

test("A4 navigation reaches the final page through the preview viewport", async () => {
  const preview = mountPreview();
  preview.host.style.height = "500px";
  preview.host.style.width = "900px";
  try {
    const pages = [1, 2, 3].map((number) => makePage(`<h1>Page ${number}</h1>`));
    const rendered = { mode: "a4" as const, pages, defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE };
    preview.render(rendered);
    const viewport = preview.host.querySelector<HTMLElement>(".preview-section__body--a4");
    expect(viewport).not.toBeNull();
    expect(viewport!.scrollHeight).toBeGreaterThan(viewport!.clientHeight);
    preview.render(rendered, false, { direction: 1, requestId: 1 });
    preview.render(rendered, false, { direction: 1, requestId: 2 });
    await vi.waitFor(() => {
      const last = preview.host.querySelectorAll<HTMLElement>(".preview-section__page-frame")[2];
      expect(last.getBoundingClientRect().top).toBeLessThan(viewport!.getBoundingClientRect().bottom);
      expect(viewport!.scrollTop).toBeGreaterThan(0);
    });
  } finally {
    preview.dispose();
  }
});

test("A4 frame containment preserves an untouched page during a local update", () => {
  const containment = document.createElement("style");
  containment.textContent = ".preview-section__page-frame { content-visibility: auto; }";
  document.head.append(containment);
  const preview = mountPreview();
  try {
    const pages = [makePage("<h1>First</h1>"), makePage("<h1>Second</h1>")];
    preview.render({ mode: "a4", pages, defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    const untouched = preview.host.querySelectorAll<HTMLElement>(".preview-section__page-frame")[1];
    expect(getComputedStyle(untouched).contentVisibility).toBe("auto");
    preview.render({ mode: "a4", pages: [makePage("<h1>Changed</h1>"), pages[1]],
      defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    expect(preview.host.querySelectorAll(".preview-section__page-frame")[1]).toBe(untouched);
  } finally {
    preview.dispose();
    containment.remove();
  }
});
