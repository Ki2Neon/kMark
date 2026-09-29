import { expect, test, vi } from "vitest";
import "../../../src/App.css";
import { paginateA4RenderedPage } from "../../../src/adapters/browser/browserA4Pagination";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type RenderedPreviewPage,
} from "../../../src/domain/preview";
import { printMarkdownDocument } from "../../../src/infra/printDocument";
import { mountPreview } from "../support/mountPreview";

const PAGE_STYLE = {
  width: "600px",
  height: "600px",
  marginTop: "40px",
  marginRight: "40px",
  marginBottom: "40px",
  marginLeft: "40px",
} as const;
const PAGE_NUMBER_CONFIG = {
  ...DEFAULT_PAGE_NUMBER_CONFIG,
  position: "bottom-center" as const,
  format: "{page}/{total}",
};

function page(html: string, options: {
  style?: RenderedPreviewPage["pageStyle"];
  reset?: boolean;
} = {}): RenderedPreviewPage {
  return {
    html,
    pageStyle: options.style ?? PAGE_STYLE,
    textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    pageNumberConfig: { ...PAGE_NUMBER_CONFIG, reset: options.reset ?? false },
    pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
  };
}

function joinedText(parts: readonly RenderedPreviewPage[]): string {
  const element = document.createElement("div");
  element.innerHTML = parts.map((part) => part.html).join("");
  return element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

test("A4 splits long paragraph, list and code while retaining every word", () => {
  const words = Array.from({ length: 300 }, (_, index) => `word${index}`).join(" ");
  const paragraph = paginateA4RenderedPage(page(`<p>${words}</p>`));
  const list = paginateA4RenderedPage(page(`<ol><li>${words}</li></ol>`));
  const code = Array.from({ length: 65 }, (_, index) => `code-${index}`).join("\n");
  const pre = paginateA4RenderedPage(page(`<pre><code>${code}</code></pre>`));
  for (const [name, parts, expected] of [
    ["paragraph", paragraph, words],
    ["ordered list", list, words],
    ["code block", pre, code.replace(/\s+/gu, " ")],
  ] as const) {
    expect(parts.length, `${name} did not create a continuation page`).toBeGreaterThan(1);
    expect(joinedText(parts), `${name} lost or duplicated content`).toBe(expected);
  }
});

test("A4 preserves page reset and page_valign boundaries in physical pages", () => {
  const prose = Array.from({ length: 30 }, (_, index) =>
    `<p data-prose="${index}" style="height:46px;margin:0">line-${index}</p>`).join("");
  const parts = paginateA4RenderedPage(page(prose, { reset: true }));
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.map((part) => part.pageNumberConfig.reset)).toEqual([
    true, ...Array(parts.length - 1).fill(false),
  ]);
  for (let index = 0; index < 30; index += 1) {
    expect(parts.map((part) => part.html).join("").match(new RegExp(`data-prose="${index}"`, "gu"))).toHaveLength(1);
  }
  const aligned = paginateA4RenderedPage(page(
    '<p data-page-valign="bottom">tail</p><p id="after-valign">after</p>',
  ));
  expect(aligned.length).toBeGreaterThan(1);
  expect(aligned[0].html).toContain('data-page-valign="bottom"');
  expect(aligned[1].html).toContain('id="after-valign"');
});

test("A4 continuation pages update numbering, print, and only the changed source page", async () => {
  const preview = mountPreview();
  const prose = Array.from({ length: 30 }, (_, index) =>
    `<p data-prose="${index}" style="height:46px;margin:0">line-${index}</p>`).join("");
  const table = `<table><tbody>${Array.from({ length: 12 }, (_, index) =>
    `<tr data-row="${index}"><td>row-${index}</td></tr>`).join("")}</tbody></table>`;
  const toc = `<nav class="kmark-toc"><ol class="kmark-toc__list">${Array.from({ length: 12 }, (_, index) =>
    `<li class="kmark-toc__item" data-toc-depth="1" data-toc="${index}"><a class="kmark-toc__link" href="#manual-page">heading-${index}</a></li>`).join("")}</ol></nav>`;
  const sourcePages = [
    page(prose + table + toc, { reset: true }),
    page('<h1 id="manual-page">manual</h1>', { style: { ...PAGE_STYLE, width: "610px" } }),
  ];
  const physical = paginateA4RenderedPage(sourcePages[0]);
  expect(physical.length).toBeGreaterThan(1);
  const frames = () => Array.from(preview.host.querySelectorAll<HTMLElement>(".preview-section__page-frame"));
  const render = (pages: readonly RenderedPreviewPage[]) => preview.render({
    mode: "a4", pages, defaultPageStyle: PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE,
  });
  try {
    render(sourcePages);
    await vi.waitFor(() => expect(frames()).toHaveLength(physical.length + 1), { timeout: 10_000 });
    const originalFrames = frames();
    const manualFrame = originalFrames[originalFrames.length - 1];
    expect(manualFrame?.querySelector("#manual-page")).not.toBeNull();
    const numbers = originalFrames.map((frame) => frame.querySelector(".kmark-page-number")?.textContent?.trim());
    expect(numbers).toEqual(originalFrames.map((_, index) => `${index + 1}/${originalFrames.length}`));
    const allHtml = originalFrames.map((frame) => frame.querySelector(".preview-section__page")?.innerHTML ?? "").join("");
    for (const [attribute, count] of [["data-prose", 30], ["data-row", 12], ["data-toc", 12]] as const) {
      for (let index = 0; index < count; index += 1) {
        expect(allHtml.match(new RegExp(`${attribute}="${index}"`, "gu")), `${attribute}=${index}`).toHaveLength(1);
      }
    }
    expect(originalFrames[originalFrames.length - 1]?.querySelector("#manual-page")).not.toBeNull();
    expect(Array.from(preview.host.querySelectorAll(".kmark-toc__page"), (node) => node.textContent?.trim()))
      .toEqual(Array(12).fill(String(originalFrames.length)));

    let printedPages = -1;
    await printMarkdownDocument({ displayMode: "a4", title: "Pagination", pages: sourcePages }, {
      preparePrintWindow(printWindow) {
        printWindow.print = () => {
          printedPages = printWindow.document.querySelectorAll(".kmark-print-page").length;
          printWindow.dispatchEvent(new Event("afterprint"));
        };
      },
    });
    expect(printedPages).toBe(originalFrames.length);

    const measuredWidths: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.style.visibility === "hidden") {
            const frame = node.querySelector<HTMLElement>(".preview-section__page-frame");
            if (frame) measuredWidths.push(frame.style.getPropertyValue("--kmark-page-width"));
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      render([page('<p id="short-page">short</p>'), structuredClone(sourcePages[1])]);
      await vi.waitFor(() => {
        expect(frames()).toHaveLength(2);
        expect(preview.host.querySelector("#short-page")).not.toBeNull();
        expect(measuredWidths).toContain("600px");
      }, { timeout: 10_000 });
    } finally {
      observer.disconnect();
    }
    expect(frames()[1]).toBe(manualFrame);
    expect(measuredWidths).not.toContain("610px");
    expect(preview.host.querySelectorAll("[data-prose]")).toHaveLength(0);
    expect(frames().map((frame) => frame.querySelector(".kmark-page-number")?.textContent?.trim()))
      .toEqual(["1/2", "2/2"]);
  } finally {
    preview.dispose();
  }
});

test("A4 print waits for physical pagination after an immediate print request", async () => {
  const preview = mountPreview();
  const longHtml = Array.from({ length: 30 }, (_, index) =>
    `<p style="height:46px;margin:0">line-${index}</p>`).join("");
  const pages = [page(longHtml), page('<p id="manual-page">manual</p>')];
  const physicalCount = paginateA4RenderedPage(pages[0]).length + 1;
  expect(physicalCount).toBeGreaterThan(2);
  try {
    preview.render({ mode: "a4", pages, defaultPageStyle: PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    let printedPages = -1;
    await printMarkdownDocument({ displayMode: "a4", title: "Immediate print", pages }, {
      preparePrintWindow(printWindow) {
        printWindow.print = () => {
          printedPages = printWindow.document.querySelectorAll(".kmark-print-page").length;
          printWindow.dispatchEvent(new Event("afterprint"));
        };
      },
    });
    expect(printedPages).toBe(physicalCount);
  } finally {
    preview.dispose();
  }
});
