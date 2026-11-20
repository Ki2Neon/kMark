const PRINT_HOST_ID = "kmark-print-document";
const PRINT_ROOT_ID = "kmark-print-root";
const PRINT_ASSET_TIMEOUT_MS = 10_000;

let printInProgress = false;
let printSequence = 0;

const PRINT_HOST_STYLE = `
  html, body {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body > :not(#${PRINT_HOST_ID}) {
    display: none !important;
  }

  body > #${PRINT_HOST_ID} {
    display: block !important;
    position: static !important;
    width: auto;
    height: auto;
    min-height: 0;
    max-height: none;
    overflow: visible !important;
    transform: none;
    zoom: 1;
  }
`;

function referenceId(value: string, ids: ReadonlyMap<string, string>): string | undefined {
  const direct = ids.get(value);
  if (direct !== undefined) return direct;
  try {
    return ids.get(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

function rewriteFragmentUrls(value: string, ids: ReadonlyMap<string, string>): string {
  return value.replace(/url\(\s*(["']?)#([^\s)"']+)\1\s*\)/giu, (match, quote: string, id: string) => {
    const replacement = referenceId(id, ids);
    return replacement === undefined ? match : `url(${quote}#${replacement}${quote})`;
  });
}

function decodeCssIdentifier(value: string): string {
  return value.replace(/\\([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n\r\f])/giu, (_match, hex: string | undefined, character: string) => {
    if (hex === undefined) return character;
    const codePoint = Number.parseInt(hex, 16);
    return codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? "\ufffd"
      : String.fromCodePoint(codePoint);
  });
}

function rewriteCssSelectors(selector: string, ids: ReadonlyMap<string, string>): string {
  return selector.replace(/#((?:\\(?:[\da-f]{1,6}(?:\r\n|[\t\n\f\r ])?|[^\n\r\f\da-f])|[\w\-\u0080-\uffff])+)/giu, (match, id: string) => {
    const replacement = ids.get(decodeCssIdentifier(id));
    return replacement === undefined ? match : `#${CSS.escape(replacement)}`;
  });
}

/** Rewrite selectors separately from declarations so IDs such as "fff" never change colors. */
function rewriteCssRule(rule: CSSRule, ids: ReadonlyMap<string, string>): string {
  if (rule.type === CSSRule.STYLE_RULE) {
    const styleRule = rule as CSSStyleRule;
    const nestedRules = (styleRule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
    const nested = nestedRules === undefined ? "" : Array.from(nestedRules, (child) => rewriteCssRule(child, ids)).join("\n");
    return `${rewriteCssSelectors(styleRule.selectorText, ids)} { ${rewriteFragmentUrls(styleRule.style.cssText, ids)} ${nested} }`;
  }

  // @page and keyframe declarations must retain their declaration blocks.
  if ("cssRules" in rule && !("style" in rule)) {
    const groupingRule = rule as CSSGroupingRule;
    const header = rule.cssText.slice(0, rule.cssText.indexOf("{"));
    return `${header}{${Array.from(groupingRule.cssRules, (child) => rewriteCssRule(child, ids)).join("\n")}}`;
  }

  return rewriteFragmentUrls(rule.cssText, ids);
}

function rewriteStyleText(value: string, ids: ReadonlyMap<string, string>): string {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(value);
  return Array.from(sheet.cssRules, (rule) => rewriteCssRule(rule, ids)).join("\n");
}

function rewriteStyleElement(element: Element, ids: ReadonlyMap<string, string>): string {
  const text = rewriteStyleText(element.textContent ?? "", ids);
  const media = element.getAttribute("media")?.trim();
  return media === undefined || media === "" || media === "all" ? text : `@media ${media} { ${text} }`;
}

function createPrintIdMap(host: HTMLElement): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const prefix = `kmark-print-${++printSequence}-`;
  for (const element of host.querySelectorAll("[id]")) {
    if (element.id === PRINT_ROOT_ID && document.getElementById(PRINT_ROOT_ID) === null) continue;
    let replacement = `${prefix}${element.id}`;
    while (document.getElementById(replacement) !== null) replacement = `_${replacement}`;
    ids.set(element.id, replacement);
  }
  return ids;
}

function rewritePrintReferences(host: HTMLElement, ids: ReadonlyMap<string, string>): void {
  for (const element of host.querySelectorAll("*")) {
    const replacement = ids.get(element.id);
    if (replacement !== undefined) element.id = replacement;

    for (const attribute of Array.from(element.attributes)) {
      let value = rewriteFragmentUrls(attribute.value, ids);
      if ((attribute.localName === "href") && value.startsWith("#")) {
        const id = referenceId(value.slice(1), ids);
        if (id !== undefined) value = `#${id}`;
      } else if (["aria-labelledby", "aria-describedby", "headers", "for"].includes(attribute.name)) {
        value = value.replace(/\S+/gu, (id) => ids.get(id) ?? id);
      }
      if (value !== attribute.value) attribute.value = value;
    }

    if (element.localName === "style") {
      const text = rewriteStyleElement(element, ids);
      element.textContent = text;
      // Even a style inside a hidden SVG affects its owning document.
      element.setAttribute("media", "print");
    }
  }
}

async function waitForPrintAssets(host: HTMLElement): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        ...Array.from(host.querySelectorAll("img"), async (image) => {
          image.loading = "eager";
          if (image.complete) return;
          try {
            await image.decode();
          } catch {
            // An already failed source image prints its existing alternative text.
            if (!image.complete) throw new Error("印刷画像の準備に失敗しました。");
          }
        }),
      ]),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("印刷画像とフォントの準備がタイムアウトしました。")), PRINT_ASSET_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Exposes a prepared print document to native APIs that print the top-level WebView.
 * The native request only opens the dialog; afterprint owns completion and cleanup.
 */
export function printPreparedDocumentInMainWindow(
  sourceWindow: Window,
  showPrintDialog: () => Promise<void>,
): Promise<void> {
  if (printInProgress) return Promise.reject(new Error("印刷画面は既に開かれています。"));
  printInProgress = true;

  return new Promise<void>((resolve, reject) => {
    const previousTitle = document.title;
    const host = document.createElement("div");
    host.id = PRINT_HOST_ID;
    host.style.display = "none";
    host.setAttribute("aria-hidden", "true");
    const style = document.createElement("style");
    style.media = "print";
    let settled = false;

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", afterPrint);
      host.remove();
      style.remove();
      document.title = previousTitle;
      printInProgress = false;
      complete();
    };
    const afterPrint = () => finish(resolve);

    const prepareAndPrint = async () => {
      host.replaceChildren(...Array.from(sourceWindow.document.body.childNodes, (node) => document.importNode(node, true)));
      const ids = createPrintIdMap(host);
      rewritePrintReferences(host, ids);
      style.textContent = [
        ...Array.from(sourceWindow.document.head.querySelectorAll("style"), (element) => rewriteStyleElement(element, ids)),
        PRINT_HOST_STYLE,
      ].join("\n");
      document.head.append(style);
      document.body.append(host);
      document.title = sourceWindow.document.title;
      await waitForPrintAssets(host);
      window.addEventListener("afterprint", afterPrint);
      await showPrintDialog();
    };

    void prepareAndPrint().catch((error: unknown) => finish(() => reject(error)));
  });
}
