import mermaid from "mermaid";

export type MermaidPreviewTheme = "default" | "dark" | "neutral";
export type MermaidPreviewSurface = "standard" | "paper";

type RenderMermaidHtmlOptions = {
  readonly surface?: MermaidPreviewSurface;
  readonly theme?: MermaidPreviewTheme;
  readonly themeVariables?: MermaidThemeVariables;
};

type MermaidThemeVariables = Record<string, string>;

type MermaidBlockSizing = {
  readonly sizedWidth: boolean;
  readonly sizedHeight: boolean;
};

const MERMAID_BLOCK_SELECTOR = ".kmark-mermaid-block";
const MERMAID_RENDERED_SELECTOR = ".kmark-mermaid-rendered";
const MERMAID_SOURCE_SELECTOR = ".kmark-mermaid-source";
const MERMAID_SOURCE_CODE_SELECTOR = ".kmark-mermaid-source code";
const MERMAID_SIZED_WIDTH_CLASS = "kmark-mermaid-block--sized-width";
const MERMAID_SIZED_HEIGHT_CLASS = "kmark-mermaid-block--sized-height";
const MERMAID_EMPTY_ERROR_MESSAGE = "Mermaid diagram is empty";
const MERMAID_RENDER_ERROR_TITLE = "Mermaid render error";
const SAFE_MERMAID_THEMES = new Set<MermaidPreviewTheme>(["default", "dark", "neutral"]);
const DARK_APP_THEME_IDS = new Set(["vscode-dark", "github-dark", "dracula", "night-owl", "monokai"]);
const UNSAFE_SVG_ELEMENT_NAMES = new Set(["script", "iframe", "object", "embed", "audio", "video", "canvas"]);
const SVG_LINK_ATTRIBUTE_NAMES = new Set(["href", "xlink:href"]);
const UNSAFE_URL_PATTERN = /^\s*(?:javascript|vbscript|data):/iu;
const UNSAFE_CSS_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\()/iu;
const PAPER_MERMAID_THEME_VARIABLES: MermaidThemeVariables = {
  background: "#ffffff",
  mainBkg: "#f8fafc",
  nodeBkg: "#f8fafc",
  nodeBorder: "#334155",
  primaryColor: "#dbeafe",
  primaryTextColor: "#0f172a",
  primaryBorderColor: "#1d4ed8",
  secondaryColor: "#dcfce7",
  secondaryTextColor: "#052e16",
  secondaryBorderColor: "#15803d",
  tertiaryColor: "#fef3c7",
  tertiaryTextColor: "#422006",
  tertiaryBorderColor: "#b45309",
  textColor: "#111827",
  titleColor: "#111827",
  lineColor: "#334155",
  defaultLinkColor: "#334155",
  arrowheadColor: "#334155",
  border1: "#334155",
  border2: "#475569",
  note: "#fef9c3",
  noteBorderColor: "#a16207",
  noteBkgColor: "#fef9c3",
  noteTextColor: "#422006",
  clusterBkg: "#f8fafc",
  clusterBorder: "#94a3b8",
  edgeLabelBackground: "#ffffff",
  actorBkg: "#f8fafc",
  actorBorder: "#334155",
  actorTextColor: "#111827",
  actorLineColor: "#64748b",
  signalColor: "#334155",
  signalTextColor: "#111827",
  labelBoxBkgColor: "#ffffff",
  labelBoxBorderColor: "#94a3b8",
  labelTextColor: "#111827",
  loopTextColor: "#111827",
  activationBorderColor: "#475569",
  activationBkgColor: "#e2e8f0",
  sequenceNumberColor: "#111827",
  stateBkg: "#f8fafc",
  stateBorder: "#334155",
  stateLabelColor: "#111827",
  labelBackgroundColor: "#ffffff",
  transitionColor: "#334155",
  classText: "#111827",
  relationColor: "#334155",
  entityBkg: "#f8fafc",
  entityBorder: "#334155",
  attributeBackgroundColorOdd: "#ffffff",
  attributeBackgroundColorEven: "#f1f5f9",
  rowOdd: "#ffffff",
  rowEven: "#f1f5f9",
  sectionBkgColor: "#f1f5f9",
  altSectionBkgColor: "#ffffff",
  sectionBkgColor2: "#ffffff",
  taskBkgColor: "#475569",
  taskBorderColor: "#334155",
  taskTextLightColor: "#ffffff",
  taskTextColor: "#ffffff",
  taskTextDarkColor: "#111827",
  taskTextOutsideColor: "#111827",
  taskTextClickableColor: "#ffffff",
  activeTaskBkgColor: "#2563eb",
  activeTaskBorderColor: "#1d4ed8",
  doneTaskBkgColor: "#94a3b8",
  doneTaskBorderColor: "#64748b",
  critBkgColor: "#dc2626",
  critBorderColor: "#991b1b",
  gridColor: "#cbd5e1",
  vertLineColor: "#94a3b8",
  todayLineColor: "#dc2626",
  excludeBkgColor: "#e5e7eb",
  pie1: "#2563eb",
  pie2: "#db2777",
  pie3: "#16a34a",
  pie4: "#d97706",
  pie5: "#7c3aed",
  pie6: "#0891b2",
  pie7: "#be123c",
  pie8: "#4d7c0f",
  pie9: "#c2410c",
  pie10: "#4338ca",
  pie11: "#0f766e",
  pie12: "#a21caf",
  pieTitleTextSize: "1.25rem",
  pieTitleTextColor: "#111827",
  pieSectionTextSize: "1rem",
  pieSectionTextColor: "#ffffff",
  pieLegendTextColor: "#111827",
  pieStrokeColor: "#ffffff",
  pieOuterStrokeColor: "#334155",
  cScale0: "#2563eb",
  cScale1: "#db2777",
  cScale2: "#16a34a",
  cScale3: "#d97706",
  cScale4: "#7c3aed",
  cScale5: "#0891b2",
  cScale6: "#be123c",
  cScale7: "#4d7c0f",
  cScale8: "#c2410c",
  cScale9: "#4338ca",
  cScale10: "#0f766e",
  cScale11: "#a21caf",
};

let mermaidRenderSequence = 0;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function resolveMermaidTheme(value: string | undefined): MermaidPreviewTheme | null {
  return value !== undefined && SAFE_MERMAID_THEMES.has(value as MermaidPreviewTheme)
    ? value as MermaidPreviewTheme
    : null;
}

export function resolveMermaidPreviewTheme(surface: MermaidPreviewSurface = "standard"): MermaidPreviewTheme {
  if (typeof document === "undefined") {
    return "default";
  }

  const explicitTheme = resolveMermaidTheme(document.documentElement.dataset.mermaidTheme);

  if (explicitTheme !== null) {
    return explicitTheme;
  }

  if (surface === "paper") {
    return "neutral";
  }

  if (document.documentElement.dataset.previewColors !== "app") {
    return "neutral";
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

function shouldUsePaperMermaidColors(surface: MermaidPreviewSurface = "standard"): boolean {
  if (surface === "paper") {
    return true;
  }

  return typeof document !== "undefined" && document.documentElement.dataset.previewColors !== "app";
}

function resolveMermaidThemeVariables(surface: MermaidPreviewSurface = "standard"): MermaidThemeVariables | undefined {
  return shouldUsePaperMermaidColors(surface) ? PAPER_MERMAID_THEME_VARIABLES : undefined;
}

async function renderMermaidSvg(
  source: string,
  theme: MermaidPreviewTheme,
  themeVariables?: MermaidThemeVariables,
): Promise<string> {
  return enqueueMermaidRender(async () => {
    mermaid.initialize({
      flowchart: {
        htmlLabels: false,
      },
      securityLevel: "strict",
      startOnLoad: false,
      theme,
      themeVariables,
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

function parseSafeMermaidSvg(
  svg: string,
  targetDocument: Document,
  sizing: MermaidBlockSizing,
): SVGElement {
  const parsedDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = parsedDocument.documentElement;

  if (svgElement.localName.toLowerCase() !== "svg" || svgElement.querySelector("parsererror") !== null) {
    throw new Error("Mermaid returned invalid SVG");
  }

  sanitizeSvgElement(svgElement);
  const importedSvg = targetDocument.importNode(svgElement, true) as unknown as SVGElement;
  normalizeMermaidSvgSize(importedSvg, sizing);
  importedSvg.setAttribute("role", "img");
  importedSvg.setAttribute("aria-label", "Mermaid diagram");

  return importedSvg;
}

function normalizeMermaidSvgSize(svgElement: SVGElement, sizing: MermaidBlockSizing): void {
  const viewBox = svgElement.getAttribute("viewBox")?.trim();
  const viewBoxParts = viewBox?.split(/\s+/u).map(Number) ?? [];
  const width = viewBoxParts[2];
  const height = viewBoxParts[3];

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    svgElement.setAttribute("width", `${width}`);
    svgElement.setAttribute("height", `${height}`);
  }

  svgElement.style.removeProperty("max-width");
  if (sizing.sizedWidth) {
    svgElement.style.setProperty("width", "100%");
  } else if (sizing.sizedHeight) {
    svgElement.style.setProperty("width", "auto");
  }

  if (sizing.sizedHeight) {
    svgElement.style.setProperty("height", "100%");
  } else if (sizing.sizedWidth) {
    svgElement.style.setProperty("height", "auto");
  }

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

function resolveMermaidBlockSizing(block: HTMLElement): MermaidBlockSizing {
  return {
    sizedWidth: block.classList.contains(MERMAID_SIZED_WIDTH_CLASS),
    sizedHeight: block.classList.contains(MERMAID_SIZED_HEIGHT_CLASS),
  };
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

async function renderMermaidBlock(
  block: HTMLElement,
  theme: MermaidPreviewTheme,
  surface: MermaidPreviewSurface,
  themeVariables?: MermaidThemeVariables,
): Promise<void> {
  const renderedContainer = block.querySelector<HTMLElement>(MERMAID_RENDERED_SELECTOR);
  const sourceDetails = block.querySelector<HTMLElement>(MERMAID_SOURCE_SELECTOR);

  if (renderedContainer === null) {
    return;
  }

  const source = findMermaidSource(block);
  block.classList.remove("kmark-mermaid-error");
  block.dataset.kmarkMermaidState = "rendering";
  block.dataset.kmarkMermaidTheme = theme;
  block.dataset.kmarkMermaidSurface = shouldUsePaperMermaidColors(surface) ? "paper" : "standard";
  renderedContainer.replaceChildren();
  hideMermaidSource(sourceDetails);

  if (source.trim().length === 0) {
    renderMermaidError(block, renderedContainer, sourceDetails, MERMAID_EMPTY_ERROR_MESSAGE);
    return;
  }

  try {
    const svg = await renderMermaidSvg(source, theme, themeVariables);
    const svgElement = parseSafeMermaidSvg(svg, block.ownerDocument, resolveMermaidBlockSizing(block));
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
  const theme = options.theme ?? resolveMermaidPreviewTheme(options.surface);
  const surface = options.surface ?? "standard";
  const themeVariables = options.themeVariables ?? resolveMermaidThemeVariables(surface);
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_BLOCK_SELECTOR));

  for (const block of blocks) {
    await renderMermaidBlock(block, theme, surface, themeVariables);
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
