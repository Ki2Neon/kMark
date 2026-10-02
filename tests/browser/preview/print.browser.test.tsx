import { commands } from "vitest/browser";
import { expect, test } from "vitest";
import "../../../src/App.css";
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
