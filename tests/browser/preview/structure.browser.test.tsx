import { expect, test, vi } from "vitest";
import "../../../src/App.css";
import { renderMarkdownPreview } from "../../../src/adapters/browser/browserMarkdownPreviewRenderer";
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

test("A4 retains an unchanged explicit page during a local update", async () => {
  const preview = mountPreview();
  try {
    const pages = [makePage("<h1>First</h1><p>before</p>"), makePage("<h1>Last</h1><p>same</p>")];
    preview.render({ mode: "a4", pages, defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    await vi.waitFor(() => expect(preview.host.querySelectorAll(".preview-section__page-frame")).toHaveLength(2));
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

test("generated TOC titles align independently of heading number length", async () => {
  const markdown = [
    "<!-- kmark toc:true toc_min_depth:2 toc_depth:2 -->",
    "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:2 -->",
    "<!-- kmark { -->",
    "# Document",
    ...Array.from({ length: 10 }, (_, index) => `## Section ${index + 1}`),
    "<!-- kmark } -->",
  ].join("\n");
  const rendered = await renderMarkdownPreview(markdown, null, "standard", {
    revision: 1,
    documentKey: crypto.randomUUID(),
    plantumlRenderEpoch: 0,
    plantumlHttpsHosts: [],
  });
  if (rendered.mode !== "standard") {
    throw new Error("Expected a standard preview");
  }
  const preview = mountPreview();
  try {
    const checkAlignment = () => {
      const labels = Array.from(preview.host.querySelectorAll<HTMLElement>(".kmark-toc__label"));
      expect(labels).toHaveLength(10);
      const firstNumber = labels[0].querySelector<HTMLElement>(".kmark-heading-number")!;
      const lastNumber = labels[9].querySelector<HTMLElement>(".kmark-heading-number")!;
      const firstTitle = labels[0].querySelector<HTMLElement>(".kmark-toc__heading")!;
      const lastTitle = labels[9].querySelector<HTMLElement>(".kmark-toc__heading")!;
      expect(firstNumber.textContent).toBe("1.");
      expect(lastNumber.textContent).toBe("10.");
      expect(Math.abs(firstNumber.getBoundingClientRect().left - lastNumber.getBoundingClientRect().left)).toBeLessThan(1);
      expect(Math.abs(firstTitle.getBoundingClientRect().left - lastTitle.getBoundingClientRect().left)).toBeLessThan(1);
      expect(firstTitle.getBoundingClientRect().left).toBeGreaterThan(lastNumber.getBoundingClientRect().right);
    };

    preview.render(rendered);
    checkAlignment();
    preview.render({
      mode: "a4",
      pages: [makePage(rendered.html)],
      defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    });
    await vi.waitFor(checkAlignment);
  } finally {
    preview.dispose();
  }
});

test("A4 TOC page numbers start at the same left edge for one and two digits", async () => {
  const toc = `<nav class="kmark-toc"><ol class="kmark-toc__list">${Array.from({ length: 10 }, (_, index) =>
    `<li class="kmark-toc__item"><a class="kmark-toc__link" href="#section-${index}">Section ${index}</a></li>`).join("")}</ol></nav>`;
  const preview = mountPreview();
  try {
    preview.render({
      mode: "a4",
      pages: [makePage(toc), ...Array.from({ length: 10 }, (_, index) => makePage(`<h1 id="section-${index}">Section ${index}</h1>`))],
      defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    });
    await vi.waitFor(() => expect(preview.host.querySelectorAll(".kmark-toc__page")).toHaveLength(10));
    const pages = Array.from(preview.host.querySelectorAll<HTMLElement>(".kmark-toc__page"));
    expect(pages[0].textContent).toBe("2");
    expect(pages[9].textContent).toBe("11");
    expect(getComputedStyle(pages[0]).textAlign).toBe("left");
    expect(Math.abs(pages[0].getBoundingClientRect().left - pages[9].getBoundingClientRect().left)).toBeLessThan(1);
  } finally {
    preview.dispose();
  }
});

test.each(["standard", "a4"] as const)("%s preview follows a Markdown heading link without TOC", async (mode) => {
  const separator = mode === "a4"
    ? "<!-- --- -->"
    : Array.from({ length: 20 }, (_, index) => `Paragraph ${index} with enough text to fill the preview area.`).join("\n\n");
  const markdown = `[文面](#リンク先見出し名称)\n\n${separator}\n\n## リンク先見出し名称`;
  const rendered = await renderMarkdownPreview(markdown, null, mode, {
    revision: 1,
    documentKey: crypto.randomUUID(),
    plantumlRenderEpoch: 0,
    plantumlHttpsHosts: [],
  });
  const preview = mountPreview();
  preview.host.style.height = "400px";
  preview.host.style.width = "800px";
  try {
    preview.render(rendered);
    const viewport = preview.host.querySelector<HTMLElement>(".preview-section__body")!;
    const link = preview.host.querySelector<HTMLAnchorElement>('a[href="#リンク先見出し名称"]')!;
    const heading = preview.host.querySelector<HTMLElement>('h2[id="リンク先見出し名称"]')!;
    expect(link).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(heading.getBoundingClientRect().top).toBeGreaterThan(viewport.getBoundingClientRect().bottom);
    link.click();
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(heading.getBoundingClientRect().top).toBeLessThan(viewport.getBoundingClientRect().bottom);
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
