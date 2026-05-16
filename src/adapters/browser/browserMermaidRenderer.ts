import mermaid from "mermaid";

export type MermaidPreviewTheme = "default" | "dark" | "neutral";

type RenderMermaidHtmlOptions = {
  readonly theme?: MermaidPreviewTheme;
};

const MERMAID_BLOCK_SELECTOR = ".kmark-mermaid-block";
const MERMAID_RENDERED_SELECTOR = ".kmark-mermaid-rendered";
const MERMAID_SOURCE_SELECTOR = ".kmark-mermaid-source";
const MERMAID_SOURCE_CODE_SELECTOR = ".kmark-mermaid-source code";
const MERMAID_EMPTY_ERROR_MESSAGE = "Mermaid diagram is empty";
const MERMAID_RENDER_ERROR_TITLE = "Mermaid render error";
const SAFE_MERMAID_THEMES = new Set<MermaidPreviewTheme>(["default", "dark", "neutral"]);
const DARK_APP_THEME_IDS = new Set(["vscode-dark", "github-dark", "dracula", "night-owl", "monokai"]);
const UNSAFE_SVG_ELEMENT_NAMES = new Set(["script", "iframe", "object", "embed", "audio", "video", "canvas"]);
const SVG_LINK_ATTRIBUTE_NAMES = new Set(["href", "xlink:href"]);
const UNSAFE_URL_PATTERN = /^\s*(?:javascript|vbscript|data):/iu;
const UNSAFE_CSS_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\()/iu;

let mermaidRenderSequence = 0;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function resolveMermaidTheme(value: string | undefined): MermaidPreviewTheme | null {
  return value !== undefined && SAFE_MERMAID_THEMES.has(value as MermaidPreviewTheme)
    ? value as MermaidPreviewTheme
    : null;
}

export function resolveMermaidPreviewTheme(): MermaidPreviewTheme {
  if (typeof document === "undefined") {
    return "default";
  }

  const explicitTheme = resolveMermaidTheme(document.documentElement.dataset.mermaidTheme);

  if (explicitTheme !== null) {
    return explicitTheme;
  }

  const appTheme = document.documentElement.dataset.appTheme;

  if (appTheme === "paper") {
    return "neutral";
  }

  return appTheme !== undefined && DARK_APP_THEME_IDS.has(appTheme) ? "dark" : "default";
}

function enqueueMermaidRender<T>(operation: () => Promise<T>): Promise<T> {
  const queued = mermaidRenderQueue.then(operation, operation);
  mermaidRenderQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function renderMermaidSvg(source: string, theme: MermaidPreviewTheme): Promise<string> {
  return enqueueMermaidRender(async () => {
    mermaid.initialize({
      flowchart: {
        htmlLabels: false,
      },
      securityLevel: "strict",
      startOnLoad: false,
      theme,
    });

    mermaidRenderSequence += 1;
    const renderId = `kmark-mermaid-render-${mermaidRenderSequence}`;
    const rendered = await mermaid.render(renderId, source);

    return rendered.svg;
  });
}

function hasUnsafeUrl(value: string): boolean {
  return UNSAFE_URL_PATTERN.test(value);
}

function hasUnsafeCss(value: string): boolean {
  return UNSAFE_CSS_PATTERN.test(value);
}

function sanitizeSvgElement(svgElement: Element): void {
  for (const element of [svgElement, ...Array.from(svgElement.querySelectorAll("*"))]) {
    if (UNSAFE_SVG_ELEMENT_NAMES.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value;

      if (attributeName.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (SVG_LINK_ATTRIBUTE_NAMES.has(attributeName) && hasUnsafeUrl(attributeValue)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (attributeName === "style" && hasUnsafeCss(attributeValue)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const styleElement of Array.from(svgElement.querySelectorAll("style"))) {
    if (hasUnsafeCss(styleElement.textContent ?? "")) {
      styleElement.remove();
    }
  }
}

function parseSafeMermaidSvg(svg: string, targetDocument: Document): SVGElement {
  const parsedDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = parsedDocument.documentElement;

  if (svgElement.localName.toLowerCase() !== "svg" || svgElement.querySelector("parsererror") !== null) {
    throw new Error("Mermaid returned invalid SVG");
  }

  sanitizeSvgElement(svgElement);
  const importedSvg = targetDocument.importNode(svgElement, true) as unknown as SVGElement;
  normalizeMermaidSvgSize(importedSvg);
  importedSvg.setAttribute("role", "img");
  importedSvg.setAttribute("aria-label", "Mermaid diagram");

  return importedSvg;
}

function normalizeMermaidSvgSize(svgElement: SVGElement): void {
  const viewBox = svgElement.getAttribute("viewBox")?.trim();
  const viewBoxParts = viewBox?.split(/\s+/u).map(Number) ?? [];
  const width = viewBoxParts[2];
  const height = viewBoxParts[3];

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    svgElement.setAttribute("width", `${width}`);
    svgElement.setAttribute("height", `${height}`);
  }

  svgElement.style.removeProperty("max-width");
  if ((svgElement.getAttribute("style") ?? "").trim().length === 0) {
    svgElement.removeAttribute("style");
  }
}

function toMermaidErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error).trim().length > 0 ? String(error) : "Unknown Mermaid render error";
}

function findMermaidSource(block: Element): string {
  return block.querySelector<HTMLElement>(MERMAID_SOURCE_CODE_SELECTOR)?.textContent ?? "";
}

function showMermaidSource(sourceDetails: HTMLElement | null): void {
  sourceDetails?.removeAttribute("hidden");
}

function hideMermaidSource(sourceDetails: HTMLElement | null): void {
  sourceDetails?.setAttribute("hidden", "");
}

function renderMermaidError(
  block: HTMLElement,
  renderedContainer: HTMLElement,
  sourceDetails: HTMLElement | null,
  message: string,
): void {
  const ownerDocument = block.ownerDocument;
  const title = ownerDocument.createElement("div");
  title.className = "kmark-mermaid-error-title";
  title.textContent = MERMAID_RENDER_ERROR_TITLE;

  const errorMessage = ownerDocument.createElement("pre");
  errorMessage.className = "kmark-mermaid-error-message";
  errorMessage.textContent = message;

  renderedContainer.replaceChildren(title, errorMessage);
  showMermaidSource(sourceDetails);
  block.classList.add("kmark-mermaid-error");
  block.dataset.kmarkMermaidState = "error";
}

async function renderMermaidBlock(block: HTMLElement, theme: MermaidPreviewTheme): Promise<void> {
  const renderedContainer = block.querySelector<HTMLElement>(MERMAID_RENDERED_SELECTOR);
  const sourceDetails = block.querySelector<HTMLElement>(MERMAID_SOURCE_SELECTOR);

  if (renderedContainer === null) {
    return;
  }

  const source = findMermaidSource(block);
  block.classList.remove("kmark-mermaid-error");
  block.dataset.kmarkMermaidState = "rendering";
  block.dataset.kmarkMermaidTheme = theme;
  renderedContainer.replaceChildren();
  hideMermaidSource(sourceDetails);

  if (source.trim().length === 0) {
    renderMermaidError(block, renderedContainer, sourceDetails, MERMAID_EMPTY_ERROR_MESSAGE);
    return;
  }

  try {
    const svg = await renderMermaidSvg(source, theme);
    const svgElement = parseSafeMermaidSvg(svg, block.ownerDocument);
    renderedContainer.replaceChildren(svgElement);
    block.dataset.kmarkMermaidState = "rendered";
  } catch (error) {
    renderMermaidError(block, renderedContainer, sourceDetails, toMermaidErrorMessage(error));
  }
}

export async function renderMermaidBlocks(
  root: ParentNode,
  options: RenderMermaidHtmlOptions = {},
): Promise<void> {
  const theme = options.theme ?? resolveMermaidPreviewTheme();
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_BLOCK_SELECTOR));

  for (const block of blocks) {
    await renderMermaidBlock(block, theme);
  }
}

export async function renderMermaidPreviewHtml(
  html: string,
  options: RenderMermaidHtmlOptions = {},
): Promise<string> {
  if (!html.includes("kmark-mermaid-block")) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  await renderMermaidBlocks(template.content, options);

  return template.innerHTML;
}
