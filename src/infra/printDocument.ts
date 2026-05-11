import {
  A4_MARGIN_BOTTOM_MM,
  A4_MARGIN_LEFT_MM,
  A4_MARGIN_RIGHT_MM,
  A4_MARGIN_TOP_MM,
  A4_PAGE_HEIGHT_MM,
  A4_PAGE_WIDTH_MM,
  type PreviewDisplayMode,
} from "../domain/preview";

type StandardPrintMarkdownDocumentOptions = {
  readonly displayMode: Extract<PreviewDisplayMode, "standard">;
  readonly title: string;
  readonly html: string;
};

type A4PrintMarkdownDocumentOptions = {
  readonly displayMode: Extract<PreviewDisplayMode, "a4">;
  readonly title: string;
};

type A4PrintPreviewPage = {
  readonly frameStyle: string;
  readonly html: string;
  readonly pageNumberHtml: string;
  readonly pageName: string;
  readonly pageHeight: string;
  readonly pageWidth: string;
};

type PrintMarkdownDocumentOptions =
  | StandardPrintMarkdownDocumentOptions
  | A4PrintMarkdownDocumentOptions;

const PRINT_DOCUMENT_LOAD_TIMEOUT_MS = 3000;
const PRINT_DIALOG_FALLBACK_TIMEOUT_MS = 2000;
const A4_PRINT_DIALOG_FALLBACK_TIMEOUT_MS = 60000;
const KMARK_PRINT_ROOT_ID = "kmark-print-root";

const PRINT_DOCUMENT_BASE_STYLE = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }

  body {
    color: #111111;
    font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .markdown-body {
    --markdown-body-font-size: var(--kmark-font-size, 1rem);
    max-width: none;
    font-size: var(--markdown-body-font-size);
    color: #111111;
  }

  .markdown-body > :first-child {
    margin-top: 0;
  }

  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4 {
    color: #111111;
    line-height: 1.2;
  }

  .markdown-body h1 {
    font-size: 1.8em;
  }

  .markdown-body h2 {
    margin-top: 1.2963em;
    font-size: 1.35em;
  }

  .markdown-body p,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body blockquote,
  .markdown-body .kmark-toc,
  .markdown-body .kmark-callout,
  .markdown-body pre,
  .markdown-body table {
    margin: 1em 0;
  }

  .markdown-body a {
    color: inherit;
  }

  .markdown-body .kmark-toc {
    max-width: 100%;
    padding: 0.9em 1em;
    border: 0.75pt solid #d7d7d7;
    border-radius: 5pt;
    background: #f7f7f7;
    color: #111111;
    box-sizing: border-box;
  }

  .markdown-body .kmark-toc__title {
    margin-bottom: 0.65em;
    font-weight: 750;
    line-height: 1.3;
  }

  .markdown-body .kmark-toc__list {
    margin: 0;
    padding-left: 1.25em;
  }

  .markdown-body .kmark-toc__list--nested {
    margin-top: 0.18em;
  }

  .markdown-body .kmark-toc__item {
    margin: 0.18em 0;
    line-height: 1.38;
  }

  .markdown-body .kmark-toc__link,
  .markdown-body .kmark-toc__text {
    overflow-wrap: anywhere;
  }

  .markdown-body blockquote {
    margin-left: 0;
    padding-left: 9pt;
    border-left: 1.5pt solid #d7d7d7;
    color: #555555;
  }

  .markdown-body .kmark-callout {
    --kmark-callout-bg: #f4f8ff;
    --kmark-callout-border-color: #2f5fb3;
    --kmark-callout-title-color: #1f4f9a;
    --kmark-callout-text-color: #111111;
    --kmark-callout-icon-color: var(--kmark-callout-title-color);
    max-width: 100%;
    padding: 0.85em 1em 0.95em;
    border: 0.75pt solid #b9c9e8;
    border-left: 3.5pt solid var(--kmark-callout-border-color);
    border-radius: 5pt;
    background: var(--kmark-callout-bg);
    color: var(--kmark-callout-text-color);
    overflow-wrap: anywhere;
    break-inside: auto;
    page-break-inside: auto;
  }

  .markdown-body .kmark-callout--tip {
    --kmark-callout-bg: #f1fbf8;
    --kmark-callout-border-color: #0f766e;
    --kmark-callout-title-color: #0f766e;
  }

  .markdown-body .kmark-callout--important {
    --kmark-callout-bg: #f7f3ff;
    --kmark-callout-border-color: #6d28d9;
    --kmark-callout-title-color: #5b21b6;
  }

  .markdown-body .kmark-callout--warning {
    --kmark-callout-bg: #fff8eb;
    --kmark-callout-border-color: #b45309;
    --kmark-callout-title-color: #92400e;
  }

  .markdown-body .kmark-callout--caution {
    --kmark-callout-bg: #fff4f4;
    --kmark-callout-border-color: #b91c1c;
    --kmark-callout-title-color: #991b1b;
  }

  .markdown-body .kmark-callout__title {
    display: flex;
    align-items: center;
    gap: 0.55em;
    color: var(--kmark-callout-title-color);
    font-weight: 750;
    line-height: 1.3;
    break-after: avoid;
    page-break-after: avoid;
  }

  .markdown-body .kmark-callout__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.18em;
    height: 1.18em;
    border: 0.12em solid var(--kmark-callout-icon-color);
    border-radius: 999px;
    color: var(--kmark-callout-icon-color);
    font-size: 0.92em;
    font-weight: 800;
    line-height: 1;
  }

  .markdown-body .kmark-callout__icon::before {
    content: "i";
  }

  .markdown-body .kmark-callout--tip .kmark-callout__icon::before {
    content: "T";
  }

  .markdown-body .kmark-callout--important .kmark-callout__icon,
  .markdown-body .kmark-callout--warning .kmark-callout__icon,
  .markdown-body .kmark-callout--caution .kmark-callout__icon {
    border-radius: 2pt;
  }

  .markdown-body .kmark-callout--important .kmark-callout__icon::before,
  .markdown-body .kmark-callout--warning .kmark-callout__icon::before,
  .markdown-body .kmark-callout--caution .kmark-callout__icon::before {
    content: "!";
  }

  .markdown-body .kmark-callout__body {
    min-width: 0;
    margin-top: 0.55em;
  }

  .markdown-body .kmark-callout__body > :first-child {
    margin-top: 0;
  }

  .markdown-body .kmark-callout__body > :last-child {
    margin-bottom: 0;
  }

  .markdown-body .kmark-callout__body :is(pre, table) {
    max-width: 100%;
  }

  .markdown-body .kmark-page-valign {
    box-sizing: border-box;
    max-width: 100%;
  }

  .markdown-body .kmark-page-flex-spacer {
    display: block;
    flex: 0 0 auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    pointer-events: none;
    user-select: none;
  }

  .markdown-body:not(.markdown-body--a4) .kmark-page-flex-spacer {
    display: none;
  }

  .kmark-page-number {
    position: absolute;
    z-index: 1;
    color: var(--kmark-page-number-color, #666);
    font-size: var(--kmark-page-number-font-size, 10pt);
    line-height: 1;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
  }

  .kmark-page-number--bottom-center {
    left: 50%;
    bottom: var(--kmark-page-number-margin-bottom, 8mm);
    transform: translateX(-50%);
  }

  .kmark-page-number--bottom-right {
    right: var(--kmark-page-number-margin-right, 12mm);
    bottom: var(--kmark-page-number-margin-bottom, 8mm);
  }

  .kmark-page-number--bottom-left {
    left: var(--kmark-page-number-margin-left, 12mm);
    bottom: var(--kmark-page-number-margin-bottom, 8mm);
  }

  .kmark-page-number--top-center {
    left: 50%;
    top: var(--kmark-page-number-margin-top, 8mm);
    transform: translateX(-50%);
  }

  .kmark-page-number--top-right {
    right: var(--kmark-page-number-margin-right, 12mm);
    top: var(--kmark-page-number-margin-top, 8mm);
  }

  .kmark-page-number--top-left {
    left: var(--kmark-page-number-margin-left, 12mm);
    top: var(--kmark-page-number-margin-top, 8mm);
  }

  .markdown-body code {
    padding: 0.08em 0.3em;
    font-family: "Iosevka Term", "Cascadia Code", Consolas, monospace;
    font-size: 0.92em;
    background: #f5f5f5;
  }

  .markdown-body pre {
    overflow: visible;
    padding: 9pt;
    border: 0.75pt solid #d7d7d7;
    background: #f5f5f5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .markdown-body pre code {
    padding: 0;
    background: transparent;
    white-space: inherit;
  }

  .markdown-body table {
    width: 100%;
    border-collapse: collapse;
  }

  .markdown-body th,
  .markdown-body td {
    padding: 0.65em 0.75em;
    border: 0.75pt solid #d7d7d7;
    text-align: left;
  }

  .markdown-body th {
    background: #f5f5f5;
  }
`;

const STANDARD_PRINT_DOCUMENT_STYLE = `
  @page {
    margin: 12mm;
  }

  ${PRINT_DOCUMENT_BASE_STYLE}
`;

const A4_PRINT_DOCUMENT_STYLE = `
  @page {
    margin: 0;
  }

  ${PRINT_DOCUMENT_BASE_STYLE}

  #${KMARK_PRINT_ROOT_ID} {
    display: block;
    position: static;
    width: auto;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: #ffffff;
  }

  #${KMARK_PRINT_ROOT_ID} * {
    box-sizing: border-box;
  }

  #${KMARK_PRINT_ROOT_ID} .preview-section__page-frame {
    display: block;
    position: relative;
    width: var(--kmark-page-width, ${A4_PAGE_WIDTH_MM}mm);
    height: var(--kmark-page-height, ${A4_PAGE_HEIGHT_MM}mm);
    margin: 0;
    padding:
      var(--kmark-page-margin-top, ${A4_MARGIN_TOP_MM}mm)
      var(--kmark-page-margin-right, ${A4_MARGIN_RIGHT_MM}mm)
      var(--kmark-page-margin-bottom, ${A4_MARGIN_BOTTOM_MM}mm)
      var(--kmark-page-margin-left, ${A4_MARGIN_LEFT_MM}mm);
    box-sizing: border-box;
    overflow: hidden;
    background: #ffffff;
    border: 0;
    box-shadow: none;
    transform: none;
    zoom: 1;
    break-after: page;
    break-inside: avoid-page;
    page-break-after: always;
    page-break-inside: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .preview-section__page-frame:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 {
    min-height: 100%;
    padding: 0;
    font-size: var(--kmark-font-size, 10.5pt);
    overflow: hidden;
    orphans: 3;
    widows: 3;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h1,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h2,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h3,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h4,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h5,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h6 {
    page-break-after: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 blockquote,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 .kmark-callout__title,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 figure,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 pre,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 tr {
    page-break-inside: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 table {
    page-break-inside: auto;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 thead {
    page-break-inside: avoid;
  }

  @media print {
    html,
    body,
    #${KMARK_PRINT_ROOT_ID} {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
  }
`;

function createA4PrintDocumentStyle(pages: readonly A4PrintPreviewPage[]): string {
  const namedPageRules = pages
    .map((page) => `
      @page ${page.pageName} {
        size: ${page.pageWidth} ${page.pageHeight};
        margin: 0;
      }

      #${KMARK_PRINT_ROOT_ID} .kmark-print-page[data-kmark-print-page="${page.pageName}"] {
        page: ${page.pageName};
      }
    `)
    .join("");

  return `${A4_PRINT_DOCUMENT_STYLE}\n${namedPageRules}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function isVisiblePreviewElement(element: HTMLElement): boolean {
  if (!element.isConnected || element.getClientRects().length === 0) {
    return false;
  }

  const style = window.getComputedStyle(element);

  return style.display !== "none" && style.visibility !== "hidden";
}

function getDisplayedPreviewA4PageFrameElements(): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".preview-section__page-frame"))
    .filter((pageFrame) => !pageFrame.classList.contains("kmark-print-page"))
    .filter((pageFrame) => pageFrame.closest(`#${KMARK_PRINT_ROOT_ID}`) === null)
    .filter(isVisiblePreviewElement);
}

function getPageFrameCssLength(pageFrame: HTMLElement, propertyName: string, fallback: string): string {
  const inlineValue = pageFrame.style.getPropertyValue(propertyName).trim();

  if (inlineValue.length > 0) {
    return inlineValue;
  }

  const computedValue = window.getComputedStyle(pageFrame).getPropertyValue(propertyName).trim();

  return computedValue.length > 0 ? computedValue : fallback;
}

function getDisplayedPreviewA4Pages(): readonly A4PrintPreviewPage[] {
  return getDisplayedPreviewA4PageFrameElements()
    .map((pageFrame, index) => ({
      frameStyle: pageFrame.getAttribute("style") ?? "",
      html: pageFrame.querySelector<HTMLElement>(".markdown-body--a4")?.innerHTML ?? pageFrame.innerHTML,
      pageNumberHtml: pageFrame.querySelector<HTMLElement>(".kmark-page-number")?.outerHTML ?? "",
      pageName: `kmark-print-page-${index + 1}`,
      pageHeight: getPageFrameCssLength(pageFrame, "--kmark-page-height", `${A4_PAGE_HEIGHT_MM}mm`),
      pageWidth: getPageFrameCssLength(pageFrame, "--kmark-page-width", `${A4_PAGE_WIDTH_MM}mm`),
    }))
    .filter((page) => page.html.trim().length > 0);
}

function createA4PrintDocumentMarkup(options: A4PrintMarkdownDocumentOptions, pages: readonly A4PrintPreviewPage[]): string {
  const pageMarkup = pages
    .map((page) => `
      <div class="preview-section__page-frame kmark-print-page" data-kmark-print-page="${page.pageName}" style="${escapeHtml(page.frameStyle)}">
        <article class="markdown-body markdown-body--a4 print-page">${page.html}</article>
        ${page.pageNumberHtml}
      </div>
    `)
    .join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${createA4PrintDocumentStyle(pages)}</style>
  </head>
  <body>
    <div id="${KMARK_PRINT_ROOT_ID}">
      ${pageMarkup}
    </div>
  </body>
</html>`;
}

function printA4MarkdownDocument(options: A4PrintMarkdownDocumentOptions): Promise<void> {
  const pages = getDisplayedPreviewA4Pages();

  if (pages.length === 0) {
    return Promise.reject(new Error("表示中のA4プレビューページがありません。"));
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";

    let isSettled = false;
    let loadTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;

    const cleanup = () => {
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }

      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }

      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    const finish = (callback: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      callback();
    };

    iframe.onerror = () => {
      finish(() => reject(new Error("A4印刷画面の生成に失敗しました。")));
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;

      if (printWindow === null) {
        finish(() => reject(new Error("A4印刷画面を開けませんでした。")));
        return;
      }

      const finalizeSuccess = () => {
        printWindow.removeEventListener("afterprint", finalizeSuccess);
        finish(resolve);
      };

      printWindow.addEventListener("afterprint", finalizeSuccess, { once: true });
      fallbackTimeoutId = window.setTimeout(finalizeSuccess, A4_PRINT_DIALOG_FALLBACK_TIMEOUT_MS);

      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        printWindow.removeEventListener("afterprint", finalizeSuccess);
        finish(() => reject(error instanceof Error ? error : new Error("印刷に失敗しました。")));
      }
    };

    loadTimeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("A4印刷画面の準備に時間がかかりすぎています。")));
    }, PRINT_DOCUMENT_LOAD_TIMEOUT_MS);

    iframe.srcdoc = createA4PrintDocumentMarkup(options, pages);
    document.body.append(iframe);
  });
}

function createPrintDocumentMarkup(options: StandardPrintMarkdownDocumentOptions): string {
  const bodyMarkup = `<article class="markdown-body">${options.html}</article>`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${STANDARD_PRINT_DOCUMENT_STYLE}</style>
  </head>
  <body>
    ${bodyMarkup}
  </body>
</html>`;
}

export function printMarkdownDocument(options: PrintMarkdownDocumentOptions): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("この環境では印刷できません。"));
  }

  if (options.displayMode === "a4") {
    return printA4MarkdownDocument(options);
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";

    let isSettled = false;
    let loadTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;

    const cleanup = () => {
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }

      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }

      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    const finish = (callback: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      callback();
    };

    iframe.onerror = () => {
      finish(() => reject(new Error("印刷画面の生成に失敗しました。")));
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;

      if (printWindow === null) {
        finish(() => reject(new Error("印刷画面を開けませんでした。")));
        return;
      }

      const finalizeSuccess = () => {
        finish(resolve);
      };

      printWindow.addEventListener("afterprint", finalizeSuccess, { once: true });
      fallbackTimeoutId = window.setTimeout(finalizeSuccess, PRINT_DIALOG_FALLBACK_TIMEOUT_MS);

      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        printWindow.removeEventListener("afterprint", finalizeSuccess);
        finish(() => reject(error instanceof Error ? error : new Error("印刷に失敗しました。")));
      }
    };

    loadTimeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("印刷画面の準備に時間がかかりすぎています。")));
    }, PRINT_DOCUMENT_LOAD_TIMEOUT_MS);

    iframe.srcdoc = createPrintDocumentMarkup(options);
    document.body.append(iframe);
  });
}
