import mermaid, { type MermaidConfig } from "mermaid";

export type MermaidPreviewTheme = "default" | "dark" | "neutral";
export type MermaidPreviewSurface = "standard" | "paper";
type MermaidInitMergeMode = "merge" | "replace" | "user-first" | "kmark-first";

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

type KmarkMermaidBlockParams = {
  readonly fontSize?: string;
  readonly ganttFontSize?: string;
  readonly ganttSectionFontSize?: string;
  readonly themePreset?: string;
  readonly background?: string;
  readonly initMerge?: MermaidInitMergeMode;
};

type PreparedMermaidRender = {
  readonly config: MermaidConfig;
  readonly expectsGantt: boolean;
  readonly renderSource: string;
  readonly svgBackground: string;
  readonly surfaceBackground: string;
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

const BASE_MERMAID_CONFIG: MermaidConfig = {
  flowchart: {
    htmlLabels: false,
  },
  securityLevel: "strict",
  startOnLoad: false,
};

const GANTT_CLEAN_THEME_VARIABLES: MermaidThemeVariables = {
  background: "#ffffff",
  primaryColor: "#b7d7ea",
  primaryTextColor: "#000000",
  primaryBorderColor: "#7fa9c6",
  activeColor: "#8fb8d1",
  activeBorderColor: "#5d88a2",
  doneColor: "#c8d9e6",
  doneBorderColor: "#7fa9c6",
  critColor: "#111111",
  critBorderColor: "#111111",
  gridColor: "#d9d9d9",
  sectionBkgColor: "#f5f5f5",
  taskTextColor: "#000000",
  taskTextOutsideColor: "#000000",
  taskTextDarkColor: "#000000",
  titleColor: "#000000",
  textColor: "#000000",
  fontSize: "10px",
};

const GANTT_CLEAN_MERMAID_CONFIG: MermaidConfig = {
  theme: "base",
  themeVariables: GANTT_CLEAN_THEME_VARIABLES,
  gantt: {
    fontSize: 10,
    sectionFontSize: 10,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    leftPadding: 75,
    rightPadding: 75,
    gridLineStartPadding: 35,
  },
};

const INIT_DIRECTIVE_PATTERN = /%%\{\s*(?:init|initialize)\b[\s\S]*?\}%%/giu;
const INIT_DIRECTIVE_CONFIG_PATTERN = /%%\{\s*(?:init|initialize)\s*:([\s\S]*?)\}%%/giu;
const JSON_LIKE_UNQUOTED_KEY_PATTERN = /([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/gu;
const JSON_LIKE_TRAILING_COMMA_PATTERN = /,\s*([}\]])/gu;
const PX_FONT_SIZE_PATTERN = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/iu;
const CSS_UNSAFE_VALUE_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\(|[;{}<>])/iu;
const GANTT_POST_STYLE_ATTRIBUTE = "data-kmark-mermaid-post-style";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMermaidConfigValues(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return cloneMermaidConfigValue(base);
  }

  if (isRecord(base) && isRecord(override)) {
    return mergeMermaidConfigs(base as MermaidConfig, override as MermaidConfig);
  }

  return cloneMermaidConfigValue(override);
}

function cloneMermaidConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneMermaidConfigValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return mergeMermaidConfigs(value as MermaidConfig);
}

function mergeMermaidConfigs(...configs: readonly (MermaidConfig | undefined)[]): MermaidConfig {
  const merged: Record<string, unknown> = {};

  for (const config of configs) {
    if (config === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(config)) {
      merged[key] = mergeMermaidConfigValues(merged[key], value);
    }
  }

  return merged as MermaidConfig;
}

function resolveBlockParams(block: HTMLElement): KmarkMermaidBlockParams {
  return {
    fontSize: block.dataset.kmarkMermaidFontSize,
    ganttFontSize: block.dataset.kmarkMermaidGanttFontSize,
    ganttSectionFontSize: block.dataset.kmarkMermaidGanttSectionFontSize,
    themePreset: block.dataset.kmarkMermaidThemePreset,
    background: block.dataset.kmarkMermaidBackground,
    initMerge: resolveMermaidInitMerge(block.dataset.kmarkMermaidInitMerge),
  };
}

function resolveMermaidInitMerge(value: string | undefined): MermaidInitMergeMode | undefined {
  return value === "merge" || value === "replace" || value === "user-first" || value === "kmark-first"
    ? value
    : undefined;
}

function stripMermaidInitDirectives(source: string): string {
  return source.replace(INIT_DIRECTIVE_PATTERN, "").trimStart();
}

function isMermaidGanttSource(source: string): boolean {
  return stripMermaidInitDirectives(source).trimStart().toLowerCase().startsWith("gantt");
}

function parseMermaidFontSizeNumber(value: string | undefined): number | undefined {
  const match = value?.match(PX_FONT_SIZE_PATTERN);

  if (match === undefined || match === null) {
    return undefined;
  }

  const fontSize = Number(match[1]);

  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : undefined;
}

function createFontSizeThemeVariables(fontSize: string | undefined): MermaidThemeVariables | undefined {
  return fontSize !== undefined ? { fontSize } : undefined;
}

function createKmarkMermaidParamConfig(params: KmarkMermaidBlockParams, expectsGantt: boolean): MermaidConfig {
  const config: MermaidConfig = {};

  if (params.fontSize !== undefined) {
    config.themeVariables = createFontSizeThemeVariables(params.fontSize);
  }

  const ganttFontSize = params.ganttFontSize ?? params.fontSize;
  const ganttFontSizeNumber = parseMermaidFontSizeNumber(ganttFontSize);
  const ganttSectionFontSizeNumber = parseMermaidFontSizeNumber(params.ganttSectionFontSize);

  if (expectsGantt && (ganttFontSizeNumber !== undefined || ganttSectionFontSizeNumber !== undefined)) {
    config.gantt = {};

    if (ganttFontSizeNumber !== undefined) {
      config.gantt.fontSize = ganttFontSizeNumber;
    }
    if (ganttSectionFontSizeNumber !== undefined) {
      config.gantt.sectionFontSize = ganttSectionFontSizeNumber;
    }
  }

  return config;
}

function createKmarkMermaidPresetConfig(params: KmarkMermaidBlockParams, expectsGantt: boolean): MermaidConfig | undefined {
  if (params.themePreset === "gantt_clean" || (params.themePreset === undefined && expectsGantt)) {
    return GANTT_CLEAN_MERMAID_CONFIG;
  }

  return undefined;
}

function completeGanttFontConfig(config: MermaidConfig, expectsGantt: boolean): MermaidConfig {
  if (!expectsGantt) {
    return config;
  }

  const fontSize = parseMermaidFontSizeNumber(config.themeVariables?.fontSize);

  if (fontSize === undefined) {
    return config;
  }

  const gantt = {
    ...config.gantt,
  };

  if (gantt.fontSize === undefined) {
    gantt.fontSize = fontSize;
  }
  if (gantt.sectionFontSize === undefined) {
    gantt.sectionFontSize = fontSize;
  }

  return {
    ...config,
    gantt,
  };
}

function enforceSafeMermaidRuntimeConfig(config: MermaidConfig): MermaidConfig {
  return {
    ...config,
    flowchart: {
      ...config.flowchart,
      htmlLabels: false,
    },
    securityLevel: "strict",
    startOnLoad: false,
  };
}

function detectMermaidUserInit(source: string): MermaidConfig | undefined {
  const configs = Array.from(source.matchAll(INIT_DIRECTIVE_CONFIG_PATTERN))
    .map((match) => parseMermaidInitConfig(match[1]))
    .filter((config): config is MermaidConfig => config !== undefined);

  if (configs.length === 0) {
    return undefined;
  }

  return mergeMermaidConfigs(...configs);
}

function parseMermaidInitConfig(rawConfig: string): MermaidConfig | undefined {
  try {
    const normalizedConfig = rawConfig
      .trim()
      .replace(/'/gu, "\"")
      .replace(JSON_LIKE_UNQUOTED_KEY_PATTERN, "$1\"$2\"$3")
      .replace(JSON_LIKE_TRAILING_COMMA_PATTERN, "$1");
    const parsedConfig = JSON.parse(normalizedConfig) as unknown;

    return isRecord(parsedConfig) ? parsedConfig as MermaidConfig : undefined;
  } catch {
    return undefined;
  }
}

function createSurfaceMermaidConfig(theme: MermaidPreviewTheme, themeVariables: MermaidThemeVariables | undefined): MermaidConfig {
  return {
    theme,
    themeVariables,
  };
}

function prepareMermaidRender(
  source: string,
  block: HTMLElement,
  theme: MermaidPreviewTheme,
  surface: MermaidPreviewSurface,
  themeVariables?: MermaidThemeVariables,
): PreparedMermaidRender {
  const params = resolveBlockParams(block);
  const expectsGantt = isMermaidGanttSource(source);
  const presetConfig = createKmarkMermaidPresetConfig(params, expectsGantt);
  const kmarkParamConfig = createKmarkMermaidParamConfig(params, expectsGantt);
  const userInitConfig = detectMermaidUserInit(source);
  const surfaceConfig = createSurfaceMermaidConfig(theme, themeVariables);
  const initMerge = params.initMerge ?? "merge";
  const config = initMerge === "replace"
    ? mergeMermaidConfigs(BASE_MERMAID_CONFIG, userInitConfig)
    : initMerge === "kmark-first"
      ? mergeMermaidConfigs(BASE_MERMAID_CONFIG, surfaceConfig, presetConfig, userInitConfig, kmarkParamConfig)
      : mergeMermaidConfigs(BASE_MERMAID_CONFIG, surfaceConfig, presetConfig, kmarkParamConfig, userInitConfig);
  const completedConfig = completeGanttFontConfig(config, expectsGantt);
  const background = resolveMermaidBlockBackground(params, expectsGantt, surface);

  return {
    config: enforceSafeMermaidRuntimeConfig(completedConfig),
    expectsGantt,
    renderSource: stripMermaidInitDirectives(source),
    svgBackground: background.svg,
    surfaceBackground: background.surface,
  };
}

function resolveMermaidBlockBackground(
  params: KmarkMermaidBlockParams,
  expectsGantt: boolean,
  surface: MermaidPreviewSurface,
): { readonly surface: string; readonly svg: string } {
  const background = params.background;

  if (background === "none") {
    return { surface: "transparent", svg: "transparent" };
  }
  if (background === "transparent") {
    return {
      surface: "transparent",
      svg: expectsGantt ? "rgba(255, 255, 255, 0.92)" : "transparent",
    };
  }
  if (background !== undefined && background !== "paper") {
    return { surface: background, svg: background };
  }

  if (expectsGantt || surface === "paper") {
    return { surface: "#ffffff", svg: "#ffffff" };
  }

  return { surface: "transparent", svg: "transparent" };
}

async function renderMermaidSvg(
  source: string,
  config: MermaidConfig,
): Promise<string> {
  return enqueueMermaidRender(async () => {
    mermaid.initialize(config);

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

function isSafeCssColor(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && !CSS_UNSAFE_VALUE_PATTERN.test(value);
}

function resolveThemeColor(config: MermaidConfig, key: string, fallback: string): string {
  const value = config.themeVariables?.[key];

  return isSafeCssColor(value) ? value.trim() : fallback;
}

function isMermaidGanttSvg(svgElement: SVGElement): boolean {
  return svgElement.getAttribute("aria-roledescription") === "gantt"
    || svgElement.querySelector(":scope > g.grid") !== null;
}

function findMermaidGanttSectionBackgroundGroup(svgElement: SVGElement): Element | null {
  return Array.from(svgElement.children).find((child) => child.querySelector(":scope > rect.section") !== null) ?? null;
}

function normalizeMermaidGanttLayerOrder(svgElement: SVGElement): void {
  if (!isMermaidGanttSvg(svgElement)) {
    return;
  }

  const gridGroup = svgElement.querySelector(":scope > g.grid");
  const sectionBackgroundGroup = findMermaidGanttSectionBackgroundGroup(svgElement);

  if (gridGroup === null || sectionBackgroundGroup === null) {
    return;
  }

  const sectionNextSibling = sectionBackgroundGroup.nextSibling;

  if (gridGroup === sectionNextSibling) {
    return;
  }

  svgElement.insertBefore(gridGroup, sectionNextSibling);
}

function injectMermaidGanttPostStyle(svgElement: SVGElement, config: MermaidConfig): void {
  if (!isMermaidGanttSvg(svgElement)) {
    return;
  }

  const svgId = svgElement.id.trim();

  if (svgId.length === 0 || /[^A-Za-z0-9_-]/u.test(svgId)) {
    return;
  }

  svgElement.querySelector(`style[${GANTT_POST_STYLE_ATTRIBUTE}]`)?.remove();

  const ownerDocument = svgElement.ownerDocument;
  const styleElement = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");
  const gridColor = resolveThemeColor(config, "gridColor", "#d9d9d9");
  const sectionColor = resolveThemeColor(config, "sectionBkgColor", "#f5f5f5");
  const textColor = resolveThemeColor(config, "textColor", "#000000");
  const taskTextColor = resolveThemeColor(config, "taskTextColor", textColor);

  styleElement.setAttribute(GANTT_POST_STYLE_ATTRIBUTE, "");
  styleElement.textContent = `
#${svgId} text {
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 2px;
  stroke-linejoin: round;
}
#${svgId} .grid .tick line,
#${svgId} .grid path {
  stroke: ${gridColor} !important;
  opacity: 1 !important;
}
#${svgId} .section {
  fill: ${sectionColor} !important;
  opacity: 1 !important;
}
#${svgId} .titleText,
#${svgId} .sectionTitle,
#${svgId} .taskTextOutsideLeft,
#${svgId} .taskTextOutsideRight,
#${svgId} .milestoneText {
  fill: ${textColor} !important;
}
#${svgId} .taskText {
  fill: ${taskTextColor} !important;
}
`;

  svgElement.append(styleElement);
}

function parseSafeMermaidSvg(
  svg: string,
  targetDocument: Document,
  sizing: MermaidBlockSizing,
  config: MermaidConfig,
): SVGElement {
  const parsedDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = parsedDocument.documentElement;

  if (svgElement.localName.toLowerCase() !== "svg" || svgElement.querySelector("parsererror") !== null) {
    throw new Error("Mermaid returned invalid SVG");
  }

  sanitizeSvgElement(svgElement);
  const importedSvg = targetDocument.importNode(svgElement, true) as unknown as SVGElement;
  normalizeMermaidGanttLayerOrder(importedSvg);
  injectMermaidGanttPostStyle(importedSvg, config);
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

  if (sizing.sizedWidth || sizing.sizedHeight) {
    svgElement.style.setProperty("max-width", "none", "important");
    svgElement.style.setProperty("max-height", "none", "important");
    svgElement.style.setProperty("min-width", "0", "important");
    svgElement.style.setProperty("min-height", "0", "important");
  } else {
    svgElement.style.removeProperty("max-width");
    svgElement.style.removeProperty("max-height");
    svgElement.style.removeProperty("min-width");
    svgElement.style.removeProperty("min-height");
  }

  if (sizing.sizedWidth) {
    svgElement.style.setProperty("width", "100%", "important");
  } else if (sizing.sizedHeight) {
    svgElement.style.setProperty("width", "auto", "important");
  }

  if (sizing.sizedHeight) {
    svgElement.style.setProperty("height", "100%", "important");
  } else if (sizing.sizedWidth) {
    svgElement.style.setProperty("height", "auto", "important");
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

function applyMermaidBlockPresentation(block: HTMLElement, prepared: PreparedMermaidRender): void {
  block.classList.toggle("kmark-mermaid-block--gantt", prepared.expectsGantt);
  block.style.setProperty("--kmark-mermaid-surface-bg", prepared.surfaceBackground);
  block.style.setProperty("--kmark-mermaid-svg-bg", prepared.svgBackground);
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
    const prepared = prepareMermaidRender(source, block, theme, surface, themeVariables);
    block.dataset.kmarkMermaidTheme = String(prepared.config.theme ?? theme);
    applyMermaidBlockPresentation(block, prepared);
    const svg = await renderMermaidSvg(prepared.renderSource, prepared.config);
    const svgElement = parseSafeMermaidSvg(svg, block.ownerDocument, resolveMermaidBlockSizing(block), prepared.config);
    block.classList.toggle("kmark-mermaid-block--gantt", prepared.expectsGantt || isMermaidGanttSvg(svgElement));
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
