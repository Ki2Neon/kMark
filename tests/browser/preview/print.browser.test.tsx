import { commands } from "vitest/browser";
import { expect, test } from "vitest";
import "../../../src/App.css";
import { renderMarkdownPreview } from "../../../src/adapters/browser/browserMarkdownPreviewRenderer";
import { printMarkdownDocument } from "../../../src/infra/printDocument";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
} from "../../../src/domain/preview";
import { mountPreview } from "../support/mountPreview";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia(media: "print" | "screen"): Promise<void>;
  }
}

test.each(["standard", "a4"] as const)("%s printing delegates the prepared document to the platform printer", async (displayMode) => {
  const preview = mountPreview();
  const pages = [{
    html: "<h1>Platform print</h1>",
    pageStyle: DEFAULT_PAGE_STYLE,
    textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
    pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
  }];
  let delegated = false;
  let iframePrintCalled = false;
  try {
    preview.render(displayMode === "a4"
      ? { mode: "a4", pages, defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE }
      : { mode: "standard", html: pages[0].html, defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    await printMarkdownDocument(displayMode === "a4"
      ? { displayMode, title: "Platform print", pages }
      : { displayMode, title: "Platform print", html: pages[0].html }, {
      preparePrintWindow(printWindow) {
        printWindow.print = () => {
          iframePrintCalled = true;
          printWindow.dispatchEvent(new Event("afterprint"));
        };
      },
      async printWindow(printWindow: Window) {
        expect(printWindow.document.body.textContent).toContain("Platform print");
        expect(printWindow.document.title).toBe("Platform print");
        delegated = true;
      },
    });
    expect(delegated).toBe(true);
    expect(iframePrintCalled).toBe(false);
  } finally {
    preview.dispose();
  }
});

test("platform printing retains its source until dismissal and releases it after an error", async () => {
  const preview = mountPreview();
  const html = "<h1>Print lifecycle</h1>";
  preview.render({ mode: "standard", html, defaultPageStyle: DEFAULT_PAGE_STYLE, defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
  const originalFrameCount = document.querySelectorAll("iframe").length;
  const options = { displayMode: "standard" as const, title: "Print lifecycle", html };
  let beginPrint: (() => void) | undefined;
  let failPrint: ((reason: Error) => void) | undefined;
  const started = new Promise<void>((resolve) => { beginPrint = resolve; });
  const dialog = new Promise<void>((_resolve, reject) => { failPrint = reject; });
  const print = printMarkdownDocument(options, {
    printWindow: () => {
      beginPrint!();
      return dialog;
    },
  });
  try {
    await started;
    expect(document.querySelectorAll("iframe")).toHaveLength(originalFrameCount + 1);
    await expect(printMarkdownDocument(options)).rejects.toThrow("印刷画面を閉じてから");
    const rejected = expect(print).rejects.toThrow("Native print failed");
    failPrint!(new Error("Native print failed"));
    await rejected;
    expect(document.querySelectorAll("iframe")).toHaveLength(originalFrameCount);
    await printMarkdownDocument(options, { printWindow: async () => {} });
    expect(document.querySelectorAll("iframe")).toHaveLength(originalFrameCount);
  } finally {
    preview.dispose();
  }
});

test("A4 print document uses the actual print stylesheet and page geometry", async () => {
  const preview = mountPreview();
  const pages = ["<h1>First</h1>", "<h1>Second</h1>"].map((html) => ({
    html,
    pageStyle: DEFAULT_PAGE_STYLE,
    textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
    pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
    pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
  }));
  preview.render({ mode: "a4", pages, defaultPageStyle: DEFAULT_PAGE_STYLE,
    defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
  await commands.emulateMedia("print");
  let observed = false;
  try {
    await printMarkdownDocument({ displayMode: "a4", title: "Print test", pages }, {
      preparePrintWindow(printWindow) {
        expect(printWindow.matchMedia("print").matches).toBe(true);
        const printRoot = printWindow.document.querySelector<HTMLElement>("#kmark-print-root");
        const frames = printWindow.document.querySelectorAll<HTMLElement>(".kmark-print-page");
        expect(printRoot).not.toBeNull();
        expect(frames).toHaveLength(2);
        expect(printWindow.getComputedStyle(printRoot!).overflow).toBe("visible");
        expect(printWindow.getComputedStyle(frames[0]).borderTopWidth).toBe("0px");
        expect(frames[0].getBoundingClientRect().height).toBeGreaterThan(1000);
        observed = true;
        printWindow.print = () => { printWindow.dispatchEvent(new Event("afterprint")); };
      },
    });
    expect(observed).toBe(true);
  } finally {
    await commands.emulateMedia("screen");
    preview.dispose();
  }
});

test("A4 print document retains Markdown heading link destinations", async () => {
  const rendered = await renderMarkdownPreview(
    "[文面](#リンク先見出し名称)\n\n<!-- --- -->\n\n## リンク先見出し名称",
    null,
    "a4",
    {
      revision: 1,
      documentKey: crypto.randomUUID(),
      plantumlRenderEpoch: 0,
      plantumlHttpsHosts: [],
    },
  );
  if (rendered.mode !== "a4") throw new Error("Expected A4 preview");
  const preview = mountPreview();
  try {
    preview.render(rendered);
    await printMarkdownDocument({ displayMode: "a4", title: "Heading links", pages: rendered.pages }, {
      preparePrintWindow(printWindow) {
        const root = printWindow.document.querySelector<HTMLElement>("#kmark-print-root");
        expect(root?.querySelector('a[href="#リンク先見出し名称"]')).not.toBeNull();
        expect(root?.querySelector('h2[id="リンク先見出し名称"]')).not.toBeNull();
        printWindow.print = () => { printWindow.dispatchEvent(new Event("afterprint")); };
      },
    });
  } finally {
    preview.dispose();
  }
});
