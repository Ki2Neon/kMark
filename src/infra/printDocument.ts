type PrintMarkdownDocumentOptions = {
  readonly title: string;
  readonly html: string;
};

const PRINT_DOCUMENT_LOAD_TIMEOUT_MS = 3000;
const PRINT_DIALOG_FALLBACK_TIMEOUT_MS = 2000;

const PRINT_DOCUMENT_STYLE = `
  @page {
    margin: 12mm;
  }

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
    max-width: none;
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
    font-size: 1.8rem;
  }

  .markdown-body h2 {
    margin-top: 1.75rem;
    font-size: 1.35rem;
  }

  .markdown-body p,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body blockquote,
  .markdown-body pre,
  .markdown-body table {
    margin: 1rem 0;
  }

  .markdown-body a {
    color: inherit;
  }

  .markdown-body blockquote {
    margin-left: 0;
    padding-left: 12px;
    border-left: 2px solid #d7d7d7;
    color: #555555;
  }

  .markdown-body code {
    padding: 0.08rem 0.3rem;
    font-family: "Iosevka Term", "Cascadia Code", Consolas, monospace;
    font-size: 0.92em;
    background: #f5f5f5;
  }

  .markdown-body pre {
    overflow: visible;
    padding: 12px;
    border: 1px solid #d7d7d7;
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
    padding: 0.65rem 0.75rem;
    border: 1px solid #d7d7d7;
    text-align: left;
  }

  .markdown-body th {
    background: #f5f5f5;
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function createPrintDocumentMarkup(options: PrintMarkdownDocumentOptions): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${PRINT_DOCUMENT_STYLE}</style>
  </head>
  <body>
    <article class="markdown-body">${options.html}</article>
  </body>
</html>`;
}

export function printMarkdownDocument(options: PrintMarkdownDocumentOptions): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("この環境では印刷できません。"));
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