import mermaid, { type MermaidConfig } from "mermaid";
import { finalizeGeneratedSvg } from "./browserGeneratedSvgFinalizer";
import { tightenMermaidSequenceMessageSpacing } from "./browserMermaidSequence";
import { normalizeMermaidLineBreakTags } from "./browserMermaidSource";
import {
  resolveKmarkMermaidThemeVariables,
  shouldUsePaperMermaidColors,
  type KmarkMermaidThemeVariables as MermaidThemeVariables,
} from "./browserMermaidTheme";

export type MermaidPreviewTheme = "base" | "default" | "dark" | "neutral";
export type MermaidPreviewSurface = "standard" | "paper";
type MermaidInitMergeMode = "merge" | "replace" | "user-first" | "kmark-first";

export type RenderMermaidHtmlOptions = {
  readonly surface?: MermaidPreviewSurface;
  readonly theme?: MermaidPreviewTheme;
  readonly themeVariables?: MermaidThemeVariables;
  readonly revision?: number;
  readonly httpsHosts?: readonly string[];
  readonly signal?: AbortSignal;
  readonly strict?: boolean;
  readonly onUpdate?: (html: string) => void;
};

type KmarkMermaidBlockParams = {
  readonly fontSize?: string;
  readonly ganttFontSize?: string;
  readonly ganttSectionFontSize?: string;
  readonly ganttAutoBarSize?: string;
  readonly ganttBarHeight?: string;
  readonly ganttBarGap?: string;
  readonly ganttTextLineHeight?: string;
  readonly ganttBarPaddingY?: string;
  readonly ganttMinBarHeight?: string;
  readonly ganttMaxBarHeight?: string;
  readonly themePreset?: string;
  readonly background?: string;
  readonly initMerge?: MermaidInitMergeMode;
  readonly svgStyle?: string;
  readonly position?: string;
};

type KmarkMermaidGanttResolvedSize = {
  readonly fontSizePx: number;
  readonly sectionFontSizePx: number;
  readonly barHeight: number;
  readonly barGap: number;
  readonly topPadding: number;
  readonly gridLineStartPadding: number;
};

type CompletedGanttConfig = {
  readonly config: MermaidConfig;
  readonly size?: KmarkMermaidGanttResolvedSize;
};

type PreparedMermaidRender = {
  readonly config: MermaidConfig;
  readonly expectsGantt: boolean;
  readonly renderSource: string;
  readonly svgBackground: string;
  readonly surfaceBackground: string;
  readonly ganttSize?: KmarkMermaidGanttResolvedSize;
};

const MERMAID_BLOCK_SELECTOR = ".kmark-mermaid-block";
const MERMAID_RENDERED_SELECTOR = ".kmark-mermaid-rendered";
const MERMAID_SOURCE_SELECTOR = ".kmark-mermaid-source";
const MERMAID_SOURCE_CODE_SELECTOR = ".kmark-mermaid-source code";
const MERMAID_EMPTY_ERROR_MESSAGE = "Mermaid diagram is empty";
const MERMAID_RENDER_ERROR_TITLE = "Mermaid render error";
const SAFE_MERMAID_THEMES = new Set<MermaidPreviewTheme>(["base", "default", "dark", "neutral"]);
const UNSAFE_SVG_ELEMENT_NAMES = new Set(["script", "iframe", "object", "embed", "audio", "video", "canvas"]);
const SVG_LINK_ATTRIBUTE_NAMES = new Set(["href", "xlink:href"]);
const UNSAFE_URL_PATTERN = /^\s*(?:javascript|vbscript|data):/iu;
const UNSAFE_CSS_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\()/iu;
const BASE_MERMAID_CONFIG: MermaidConfig = {
  flowchart: {
    htmlLabels: false,
  },
  securityLevel: "strict",
  startOnLoad: false,
};

function isAbortRequested(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

const GANTT_CLEAN_MERMAID_CONFIG: MermaidConfig = {
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
const NUMBER_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*$/u;
const CSS_UNSAFE_VALUE_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\(|[;{}<>])/iu;
const GANTT_POST_STYLE_ATTRIBUTE = "data-kmark-mermaid-post-style";
const STATE_POST_STYLE_ATTRIBUTE = "data-kmark-mermaid-state-post-style";
const DEFAULT_GANTT_FONT_SIZE = 10;
const DEFAULT_GANTT_TEXT_LINE_HEIGHT = 1.25;
const DEFAULT_GANTT_BAR_PADDING_Y = 4;
const DEFAULT_GANTT_MIN_BAR_HEIGHT = 20;
const DEFAULT_GANTT_MAX_BAR_HEIGHT = 56;
let mermaidRenderSequence = 0;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function resolveMermaidTheme(value: string | undefined): MermaidPreviewTheme | null {
  return value !== undefined && SAFE_MERMAID_THEMES.has(value as MermaidPreviewTheme)
    ? value as MermaidPreviewTheme
    : null;
}

export function resolveMermaidPreviewTheme(_surface: MermaidPreviewSurface = "standard"): MermaidPreviewTheme {
  if (typeof document === "undefined") {
    return "base";
  }

  const explicitTheme = resolveMermaidTheme(document.documentElement.dataset.mermaidTheme);

  if (explicitTheme !== null) {
    return explicitTheme;
  }

  return "base";
}

function enqueueMermaidRender<T>(operation: () => Promise<T>): Promise<T> {
  const queued = mermaidRenderQueue.then(operation, operation);
  mermaidRenderQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
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
    ganttAutoBarSize: block.dataset.kmarkMermaidGanttAutoBarSize,
    ganttBarHeight: block.dataset.kmarkMermaidGanttBarHeight,
    ganttBarGap: block.dataset.kmarkMermaidGanttBarGap,
    ganttTextLineHeight: block.dataset.kmarkMermaidGanttTextLineHeight,
    ganttBarPaddingY: block.dataset.kmarkMermaidGanttBarPaddingY,
    ganttMinBarHeight: block.dataset.kmarkMermaidGanttMinBarHeight,
    ganttMaxBarHeight: block.dataset.kmarkMermaidGanttMaxBarHeight,
    themePreset: block.dataset.kmarkMermaidThemePreset,
    background: block.dataset.kmarkMermaidBackground,
    initMerge: resolveMermaidInitMerge(block.dataset.kmarkMermaidInitMerge),
    svgStyle: block.dataset.kmarkGeneratedSvgStyle ?? block.dataset.kmarkMermaidSvgStyle,
    position: block.dataset.kmarkGeneratedSvgPosition ?? block.dataset.kmarkMermaidPosition,
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

function parseMermaidFontSizeNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(PX_FONT_SIZE_PATTERN);

  if (match === undefined || match === null) {
    return undefined;
  }

  const fontSize = Number(match[1]);

  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(NUMBER_PATTERN);

  if (match === null) {
    return undefined;
  }

  const number = Number(match[1]);

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(NUMBER_PATTERN);

  if (match === null) {
    return undefined;
  }

  const number = Number(match[1]);

  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function isAutoValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "auto";
}

function isTruthyKmarkBool(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return fallback;
}

function clampNumber(minimum: number, maximum: number, value: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
  const ganttBarHeight = isAutoValue(params.ganttBarHeight) ? undefined : parsePositiveNumber(params.ganttBarHeight);
  const ganttBarGap = isAutoValue(params.ganttBarGap) ? undefined : parseNonNegativeNumber(params.ganttBarGap);

  if (
    expectsGantt
    && (
      ganttFontSizeNumber !== undefined
      || ganttSectionFontSizeNumber !== undefined
      || ganttBarHeight !== undefined
      || ganttBarGap !== undefined
    )
  ) {
    config.gantt = {};

    if (ganttFontSizeNumber !== undefined) {
      config.gantt.fontSize = ganttFontSizeNumber;
    }
    if (ganttSectionFontSizeNumber !== undefined) {
      config.gantt.sectionFontSize = ganttSectionFontSizeNumber;
    }
    if (ganttBarHeight !== undefined) {
      config.gantt.barHeight = ganttBarHeight;
    }
    if (ganttBarGap !== undefined) {
      config.gantt.barGap = ganttBarGap;
    }
  }

  return config;
}

function createKmarkMermaidPresetConfig(params: KmarkMermaidBlockParams, expectsGantt: boolean): MermaidConfig | undefined {
  if (
    params.themePreset === "gantt_clean"
    || (expectsGantt && (params.themePreset === undefined || params.themePreset === "kmark_clean"))
  ) {
    return GANTT_CLEAN_MERMAID_CONFIG;
  }
  if (params.themePreset === "kmark_clean") {
    return { theme: "base" };
  }

  return undefined;
}

function resolveMermaidGanttFontSizePx(
  params: KmarkMermaidBlockParams,
  config: MermaidConfig,
  userInitConfig: MermaidConfig | undefined,
): number {
  return parseMermaidFontSizeNumber(params.ganttFontSize)
    ?? parseMermaidFontSizeNumber(params.fontSize)
    ?? parseMermaidFontSizeNumber(userInitConfig?.gantt?.fontSize)
    ?? parseMermaidFontSizeNumber(userInitConfig?.themeVariables?.fontSize)
    ?? parseMermaidFontSizeNumber(config.gantt?.fontSize)
    ?? parseMermaidFontSizeNumber(config.themeVariables?.fontSize)
    ?? DEFAULT_GANTT_FONT_SIZE;
}

function resolveMermaidGanttSectionFontSizePx(
  params: KmarkMermaidBlockParams,
  config: MermaidConfig,
  userInitConfig: MermaidConfig | undefined,
  fontSizePx: number,
): number {
  return parseMermaidFontSizeNumber(params.ganttSectionFontSize)
    ?? parseMermaidFontSizeNumber(params.ganttFontSize)
    ?? parseMermaidFontSizeNumber(params.fontSize)
    ?? parseMermaidFontSizeNumber(userInitConfig?.gantt?.sectionFontSize)
    ?? parseMermaidFontSizeNumber(userInitConfig?.gantt?.fontSize)
    ?? parseMermaidFontSizeNumber(userInitConfig?.themeVariables?.fontSize)
    ?? parseMermaidFontSizeNumber(config.gantt?.sectionFontSize)
    ?? fontSizePx;
}

function hasExplicitGanttBarHeight(params: KmarkMermaidBlockParams, userInitConfig: MermaidConfig | undefined): boolean {
  return (
    params.ganttBarHeight !== undefined
    && !isAutoValue(params.ganttBarHeight)
    && parsePositiveNumber(params.ganttBarHeight) !== undefined
  ) || userInitConfig?.gantt?.barHeight !== undefined;
}

function hasExplicitGanttBarGap(params: KmarkMermaidBlockParams, userInitConfig: MermaidConfig | undefined): boolean {
  return (
    params.ganttBarGap !== undefined
    && !isAutoValue(params.ganttBarGap)
    && parseNonNegativeNumber(params.ganttBarGap) !== undefined
  ) || userInitConfig?.gantt?.barGap !== undefined;
}

function warnSmallGanttBarHeight(fontSize: number, barHeight: number, recommendedBarHeight: number): void {
  if (barHeight >= recommendedBarHeight || import.meta.env.DEV !== true) {
    return;
  }

  console.warn(
    "[kmark Mermaid] gantt barHeight may be too small for fontSize.\n"
    + `fontSize=${fontSize}, barHeight=${barHeight}, recommendedBarHeight=${recommendedBarHeight}`,
  );
}

function completeGanttSizeConfig(
  config: MermaidConfig,
  expectsGantt: boolean,
  params: KmarkMermaidBlockParams,
  userInitConfig: MermaidConfig | undefined,
): CompletedGanttConfig {
  if (!expectsGantt) {
    return { config };
  }

  const fontSizePx = resolveMermaidGanttFontSizePx(params, config, userInitConfig);
  const sectionFontSizePx = resolveMermaidGanttSectionFontSizePx(params, config, userInitConfig, fontSizePx);
  const lineHeight = parsePositiveNumber(params.ganttTextLineHeight) ?? DEFAULT_GANTT_TEXT_LINE_HEIGHT;
  const paddingY = parseNonNegativeNumber(params.ganttBarPaddingY) ?? DEFAULT_GANTT_BAR_PADDING_Y;
  const minimumBarHeight = parsePositiveNumber(params.ganttMinBarHeight) ?? DEFAULT_GANTT_MIN_BAR_HEIGHT;
  const rawMaximumBarHeight = parsePositiveNumber(params.ganttMaxBarHeight) ?? DEFAULT_GANTT_MAX_BAR_HEIGHT;
  const maximumBarHeight = Math.max(minimumBarHeight, rawMaximumBarHeight);
  const textHeight = Math.ceil(fontSizePx * lineHeight);
  const unclampedRecommendedBarHeight = Math.ceil(textHeight + paddingY * 2);
  const recommendedBarHeight = clampNumber(
    minimumBarHeight,
    maximumBarHeight,
    unclampedRecommendedBarHeight,
  );
  const autoBarGap = Math.max(4, Math.ceil(fontSizePx * 0.35));
  const autoTopPadding = Math.max(50, Math.ceil(fontSizePx * 4.5));
  const autoGridLineStartPadding = Math.max(10, Math.ceil(recommendedBarHeight * 0.5));
  const autoBarSizeEnabled = isTruthyKmarkBool(params.ganttAutoBarSize, true);

  const mergedBarHeight = parsePositiveNumber(config.gantt?.barHeight);
  const mergedBarGap = parseNonNegativeNumber(config.gantt?.barGap);
  const explicitBarHeight = hasExplicitGanttBarHeight(params, userInitConfig);
  const explicitBarGap = hasExplicitGanttBarGap(params, userInitConfig);
  const barHeight = explicitBarHeight && mergedBarHeight !== undefined
    ? mergedBarHeight
    : autoBarSizeEnabled
      ? recommendedBarHeight
      : mergedBarHeight ?? recommendedBarHeight;
  const barGap = explicitBarGap && mergedBarGap !== undefined
    ? mergedBarGap
    : autoBarSizeEnabled
      ? autoBarGap
      : mergedBarGap ?? autoBarGap;

  const gantt = {
    ...config.gantt,
    fontSize: fontSizePx,
    sectionFontSize: sectionFontSizePx,
  };

  if (autoBarSizeEnabled || explicitBarHeight || gantt.barHeight === undefined) {
    gantt.barHeight = barHeight;
  }
  if (autoBarSizeEnabled || explicitBarGap || gantt.barGap === undefined) {
    gantt.barGap = barGap;
  }
  if ((autoBarSizeEnabled || gantt.topPadding === undefined) && userInitConfig?.gantt?.topPadding === undefined) {
    gantt.topPadding = autoTopPadding;
  }
  if (
    (autoBarSizeEnabled || gantt.gridLineStartPadding === undefined)
    && userInitConfig?.gantt?.gridLineStartPadding === undefined
  ) {
    gantt.gridLineStartPadding = autoGridLineStartPadding;
  }

  if (explicitBarHeight) {
    warnSmallGanttBarHeight(fontSizePx, barHeight, recommendedBarHeight);
  }

  return {
    config: {
      ...config,
      gantt,
    },
    size: {
      fontSizePx,
      sectionFontSizePx,
      barHeight,
      barGap,
      topPadding: parsePositiveNumber(gantt.topPadding) ?? autoTopPadding,
      gridLineStartPadding: parsePositiveNumber(gantt.gridLineStartPadding) ?? autoGridLineStartPadding,
    },
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
  const completedGanttConfig = completeGanttSizeConfig(config, expectsGantt, params, userInitConfig);
  const background = resolveMermaidBlockBackground(params, expectsGantt, surface);

  return {
    config: enforceSafeMermaidRuntimeConfig(completedGanttConfig.config),
    expectsGantt,
    renderSource: normalizeMermaidLineBreakTags(stripMermaidInitDirectives(source)),
    svgBackground: background.svg,
    surfaceBackground: background.surface,
    ganttSize: completedGanttConfig.size,
  };
}

function resolveMermaidBlockBackground(
  params: KmarkMermaidBlockParams,
  expectsGantt: boolean,
  surface: MermaidPreviewSurface,
): { readonly surface: string; readonly svg: string } {
  const background = params.background;
  const previewSurfaceBackground = shouldUsePaperMermaidColors(surface) ? "#ffffff" : "var(--preview-surface)";

  if (background === "none") {
    return { surface: "transparent", svg: "transparent" };
  }
  if (background === "transparent") {
    return {
      surface: "transparent",
      svg: expectsGantt ? previewSurfaceBackground : "transparent",
    };
  }
  if (background === "paper") {
    return { surface: "#ffffff", svg: "#ffffff" };
  }
  if (background !== undefined) {
    return { surface: background, svg: background };
  }

  if (expectsGantt) {
    return { surface: previewSurfaceBackground, svg: previewSurfaceBackground };
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
    || svgElement.querySelector("g.grid") !== null
    || svgElement.querySelector("text.taskText, text[class*=\"taskText\"]") !== null;
}

function isMermaidStateDiagramSvg(svgElement: SVGElement): boolean {
  return svgElement.getAttribute("aria-roledescription")?.toLowerCase().startsWith("state") === true
    || svgElement.querySelector(".statediagram-state, circle.state-start, circle.state-end") !== null;
}

function injectMermaidStatePostStyle(svgElement: SVGElement, config: MermaidConfig): void {
  if (!isMermaidStateDiagramSvg(svgElement)) {
    return;
  }

  const svgId = svgElement.id.trim();

  if (svgId.length === 0 || /[^A-Za-z0-9_-]/u.test(svgId)) {
    return;
  }

  const contrastColor = resolveThemeColor(
    config,
    "transitionColor",
    resolveThemeColor(config, "textColor", "#111111"),
  );
  const ownerDocument = svgElement.ownerDocument;
  const styleElement = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");

  svgElement.querySelector(`style[${STATE_POST_STYLE_ATTRIBUTE}]`)?.remove();
  styleElement.setAttribute(STATE_POST_STYLE_ATTRIBUTE, "");
  styleElement.textContent = `
#${svgId} path.transition {
  stroke: ${contrastColor} !important;
  opacity: 1 !important;
}
#${svgId} marker[id*="-barbEnd"] path {
  fill: ${contrastColor} !important;
  stroke: ${contrastColor} !important;
  opacity: 1 !important;
}
#${svgId} circle.state-start {
  fill: ${contrastColor} !important;
  stroke: ${contrastColor} !important;
  opacity: 1 !important;
}
#${svgId} circle.state-end {
  fill: ${contrastColor} !important;
  opacity: 1 !important;
}
#${svgId} .node > g.outer-path > path {
  stroke: ${contrastColor} !important;
  opacity: 1 !important;
}
#${svgId} .node > g.outer-path > g path {
  fill: ${contrastColor} !important;
  stroke: ${contrastColor} !important;
  opacity: 1 !important;
}
`;

  svgElement.append(styleElement);
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

function parseSvgNumber(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function findSvgElementById(root: SVGElement, id: string): Element | null {
  return Array.from(root.querySelectorAll("[id]")).find((element) => element.id === id) ?? null;
}

function getSvgRectCenterY(rect: Element): number | undefined {
  const y = parseSvgNumber(rect.getAttribute("y"));
  const height = parseSvgNumber(rect.getAttribute("height"));

  if (y === undefined || height === undefined) {
    return undefined;
  }

  return y + height / 2;
}

function getMermaidGanttTaskElementForText(svgElement: SVGElement, textElement: SVGTextElement): Element | null {
  const textId = textElement.id;
  const taskId = textId.endsWith("-text") ? textId.slice(0, -"-text".length) : "";

  if (taskId.length === 0) {
    return null;
  }

  const taskElement = findSvgElementById(svgElement, taskId);

  return taskElement?.localName.toLowerCase() === "rect" ? taskElement : null;
}

function normalizeMermaidGanttTaskTextVerticalAlignment(svgElement: SVGElement): void {
  if (!isMermaidGanttSvg(svgElement)) {
    return;
  }

  const textElements = svgElement.querySelectorAll<SVGTextElement>(
    "text.taskText, text.taskTextOutsideRight, text.taskTextOutsideLeft",
  );

  for (const textElement of Array.from(textElements)) {
    const taskElement = getMermaidGanttTaskElementForText(svgElement, textElement);

    if (taskElement === null) {
      continue;
    }

    const centerY = getSvgRectCenterY(taskElement);

    if (centerY === undefined) {
      continue;
    }

    textElement.setAttribute("y", `${centerY}`);
    textElement.setAttribute("dy", "0");
    textElement.setAttribute("dominant-baseline", "middle");
    textElement.setAttribute("alignment-baseline", "middle");
  }
}

function isMermaidGanttBarTextElement(textElement: SVGTextElement): boolean {
  if (
    textElement.classList.contains("taskTextOutsideLeft")
    || textElement.classList.contains("taskTextOutsideRight")
  ) {
    return false;
  }

  return Array.from(textElement.classList).some((className) => (
    className === "taskText"
    || /^taskText\d+$/u.test(className)
    || /^(?:active|activeCrit|crit|done|doneCrit)Text\d+$/u.test(className)
  ));
}

function isMermaidGanttBarElement(svgElement: SVGElement): boolean {
  return Array.from(svgElement.classList).some((className) => (
    className === "task"
    || /^task\d+$/u.test(className)
    || /^(?:active|activeCrit|crit|done|doneCrit)\d+$/u.test(className)
  ));
}

type MermaidGanttBarKind = "task" | "active" | "done" | "critical";

function resolveMermaidGanttBarKind(element: Element): MermaidGanttBarKind {
  const classNames = Array.from(element.classList);

  if (classNames.some((className) => /^active(?:Crit)?(?:Text)?\d*$/u.test(className))) {
    return "active";
  }
  if (classNames.some((className) => /^done(?:Crit)?(?:Text)?\d*$/u.test(className))) {
    return "done";
  }
  if (classNames.some((className) => /^crit(?:Text)?\d*$/u.test(className))) {
    return "critical";
  }

  return "task";
}

function resolveMermaidGanttBarFillColor(element: Element, config: MermaidConfig): string {
  switch (resolveMermaidGanttBarKind(element)) {
    case "active":
      return resolveThemeColor(config, "activeTaskBkgColor", "#9ca3af");
    case "done":
      return resolveThemeColor(config, "doneTaskBkgColor", "#d1d5db");
    case "critical":
      return resolveThemeColor(config, "critBkgColor", "#b91c1c");
    default:
      return resolveThemeColor(config, "taskBkgColor", "#4b5563");
  }
}

function resolveMermaidGanttBarBorderColor(element: Element, config: MermaidConfig): string {
  switch (resolveMermaidGanttBarKind(element)) {
    case "active":
      return resolveThemeColor(config, "activeTaskBorderColor", "#111827");
    case "done":
      return resolveThemeColor(config, "doneTaskBorderColor", "#111827");
    case "critical":
      return resolveThemeColor(config, "critBorderColor", "#111827");
    default:
      return resolveThemeColor(config, "taskBorderColor", "#111827");
  }
}

function forceMermaidGanttBarBorderColor(svgElement: SVGElement, config: MermaidConfig): void {
  if (!isMermaidGanttSvg(svgElement)) {
    return;
  }

  const barElements = svgElement.querySelectorAll<SVGElement>("rect, path");

  for (const barElement of Array.from(barElements)) {
    if (!isMermaidGanttBarElement(barElement)) {
      continue;
    }

    const borderColor = resolveMermaidGanttBarBorderColor(barElement, config);
    barElement.setAttribute("stroke", borderColor);
    barElement.style.setProperty("stroke", borderColor, "important");
  }
}

function forceMermaidGanttBarTextColor(svgElement: SVGElement, config: MermaidConfig): void {
  if (!isMermaidGanttSvg(svgElement)) {
    return;
  }

  const textElements = svgElement.querySelectorAll<SVGTextElement>("text");

  for (const textElement of Array.from(textElements)) {
    if (!isMermaidGanttBarTextElement(textElement)) {
      continue;
    }

    const textColor = resolveContrastTextColor(resolveMermaidGanttBarFillColor(textElement, config));
    textElement.setAttribute("fill", textColor);
    textElement.style.setProperty("fill", textColor, "important");

    for (const tspanElement of Array.from(textElement.querySelectorAll<SVGTSpanElement>("tspan"))) {
      tspanElement.setAttribute("fill", textColor);
      tspanElement.style.setProperty("fill", textColor, "important");
    }
  }
}

function resolveMermaidGanttSectionBackgroundColor(sectionElement: Element, config: MermaidConfig): string | undefined {
  if (sectionElement.classList.contains("section0")) {
    return resolveThemeColor(config, "sectionBkgColor", "#f9fafb");
  }
  if (sectionElement.classList.contains("section1") || sectionElement.classList.contains("section3")) {
    return resolveThemeColor(config, "altSectionBkgColor", "#ffffff");
  }
  if (sectionElement.classList.contains("section2")) {
    return resolveThemeColor(config, "sectionBkgColor2", "#e5e7eb");
  }

  return undefined;
}

function resolveMermaidGanttSectionBackgroundColorAtY(svgElement: SVGElement, y: number, config: MermaidConfig): string {
  const sectionElements = svgElement.querySelectorAll("rect.section");

  for (const sectionElement of Array.from(sectionElements)) {
    const sectionY = parseSvgNumber(sectionElement.getAttribute("y"));
    const sectionHeight = parseSvgNumber(sectionElement.getAttribute("height"));

    if (sectionY === undefined || sectionHeight === undefined) {
      continue;
    }

    if (y >= sectionY && y <= sectionY + sectionHeight) {
      return resolveMermaidGanttSectionBackgroundColor(sectionElement, config) ?? "#ffffff";
    }
  }

  return "#ffffff";
}

function parseHexColor(value: string): { readonly red: number; readonly green: number; readonly blue: number } | undefined {
  const match = value.trim().match(/^#([0-9a-f]{6})$/iu);

  if (match === null) {
    return undefined;
  }

  const hex = match[1];

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function resolveContrastTextColor(backgroundColor: string): string {
  const color = parseHexColor(backgroundColor);

  if (color === undefined) {
    return "#000000";
  }

  const luminance = 0.2126 * toLinearColorChannel(color.red)
    + 0.7152 * toLinearColorChannel(color.green)
    + 0.0722 * toLinearColorChannel(color.blue);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

function toLinearColorChannel(channel: number): number {
  const normalized = channel / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function createMermaidGanttMilestoneTextContrastRules(svgElement: SVGElement, svgId: string, config: MermaidConfig): string {
  const rules: string[] = [];
  const milestoneTexts = svgElement.querySelectorAll<SVGTextElement>("text.milestoneText");

  for (const textElement of Array.from(milestoneTexts)) {
    if (textElement.id.trim().length === 0 || /[^A-Za-z0-9_-]/u.test(textElement.id)) {
      continue;
    }

    const textY = parseSvgNumber(textElement.getAttribute("y"));

    if (textY === undefined) {
      continue;
    }

    const backgroundColor = resolveMermaidGanttSectionBackgroundColorAtY(svgElement, textY, config);
    const textColor = resolveContrastTextColor(backgroundColor);
    rules.push(`#${svgId} #${textElement.id} { fill: ${textColor} !important; }`);
  }

  return rules.join("\n");
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
  const textColor = resolveThemeColor(config, "textColor", "#000000");
  const outsideTextColor = resolveThemeColor(config, "taskTextOutsideColor", textColor);
  const taskFillColor = resolveThemeColor(config, "taskBkgColor", "#4b5563");
  const activeTaskFillColor = resolveThemeColor(config, "activeTaskBkgColor", "#111827");
  const doneTaskFillColor = resolveThemeColor(config, "doneTaskBkgColor", "#d1d5db");
  const criticalTaskFillColor = resolveThemeColor(config, "critBkgColor", "#000000");
  const taskBorderColor = resolveThemeColor(config, "taskBorderColor", "#111827");
  const activeTaskBorderColor = resolveThemeColor(config, "activeTaskBorderColor", "#111827");
  const doneTaskBorderColor = resolveThemeColor(config, "doneTaskBorderColor", "#111827");
  const criticalTaskBorderColor = resolveThemeColor(config, "critBorderColor", "#111827");
  const taskTextColor = resolveContrastTextColor(taskFillColor);
  const activeTaskTextColor = resolveContrastTextColor(activeTaskFillColor);
  const doneTaskTextColor = resolveContrastTextColor(doneTaskFillColor);
  const criticalTaskTextColor = resolveContrastTextColor(criticalTaskFillColor);
  const sectionColor = resolveThemeColor(config, "sectionBkgColor", "#f9fafb");
  const altSectionColor = resolveThemeColor(config, "altSectionBkgColor", "#ffffff");
  const sectionColor2 = resolveThemeColor(config, "sectionBkgColor2", "#e5e7eb");
  const milestoneTextContrastRules = createMermaidGanttMilestoneTextContrastRules(svgElement, svgId, config);

  styleElement.setAttribute(GANTT_POST_STYLE_ATTRIBUTE, "");
  styleElement.textContent = `
#${svgId} text {
  font-size: var(--kmark-mermaid-font-size) !important;
}
#${svgId} .grid .tick line,
#${svgId} .grid path {
  stroke: ${gridColor} !important;
  opacity: 1 !important;
}
#${svgId} .section {
  opacity: 1 !important;
}
#${svgId} .section0 {
  fill: ${sectionColor} !important;
}
#${svgId} .section1,
#${svgId} .section3 {
  fill: ${altSectionColor} !important;
}
#${svgId} .section2 {
  fill: ${sectionColor2} !important;
}
#${svgId} .task0,
#${svgId} .task1,
#${svgId} .task2,
#${svgId} .task3 {
  fill: ${taskFillColor} !important;
  stroke: ${taskBorderColor} !important;
}
#${svgId} .active0,
#${svgId} .active1,
#${svgId} .active2,
#${svgId} .active3,
#${svgId} .activeCrit0,
#${svgId} .activeCrit1,
#${svgId} .activeCrit2,
#${svgId} .activeCrit3 {
  fill: ${activeTaskFillColor} !important;
  stroke: ${activeTaskBorderColor} !important;
}
#${svgId} .done0,
#${svgId} .done1,
#${svgId} .done2,
#${svgId} .done3,
#${svgId} .doneCrit0,
#${svgId} .doneCrit1,
#${svgId} .doneCrit2,
#${svgId} .doneCrit3 {
  fill: ${doneTaskFillColor} !important;
  stroke: ${doneTaskBorderColor} !important;
}
#${svgId} .crit0,
#${svgId} .crit1,
#${svgId} .crit2,
#${svgId} .crit3 {
  fill: ${criticalTaskFillColor} !important;
  stroke: ${criticalTaskBorderColor} !important;
}
#${svgId} .titleText,
#${svgId} .sectionTitle,
#${svgId} .milestoneText {
  fill: ${textColor} !important;
}
#${svgId} .taskTextOutsideLeft,
#${svgId} .taskTextOutsideRight {
  fill: ${outsideTextColor} !important;
}
#${svgId} .taskText,
#${svgId} .taskText0,
#${svgId} .taskText1,
#${svgId} .taskText2,
#${svgId} .taskText3 {
  fill: ${taskTextColor} !important;
}
#${svgId} .doneText0,
#${svgId} .doneText1,
#${svgId} .doneText2,
#${svgId} .doneText3,
#${svgId} .doneCritText0,
#${svgId} .doneCritText1,
#${svgId} .doneCritText2,
#${svgId} .doneCritText3 {
  fill: ${doneTaskTextColor} !important;
}
#${svgId} .activeText0,
#${svgId} .activeText1,
#${svgId} .activeText2,
#${svgId} .activeText3,
#${svgId} .activeCritText0,
#${svgId} .activeCritText1,
#${svgId} .activeCritText2,
#${svgId} .activeCritText3 {
  fill: ${activeTaskTextColor} !important;
}
#${svgId} .critText0,
#${svgId} .critText1,
#${svgId} .critText2,
#${svgId} .critText3 {
  fill: ${criticalTaskTextColor} !important;
}
#${svgId} .taskText,
#${svgId} .taskTextOutsideRight,
#${svgId} .taskTextOutsideLeft {
  dominant-baseline: middle;
}
${milestoneTextContrastRules}
`;

  svgElement.append(styleElement);
}

function parseSafeMermaidSvg(
  svg: string,
  targetDocument: Document,
  config: MermaidConfig,
): SVGElement {
  const xmlCompatibleSvg = normalizeMermaidLineBreakTags(svg);
  const parsedDocument = new DOMParser().parseFromString(xmlCompatibleSvg, "image/svg+xml");
  const svgElement = parsedDocument.documentElement;

  if (svgElement.localName.toLowerCase() !== "svg" || svgElement.querySelector("parsererror") !== null) {
    throw new Error("Mermaid returned invalid SVG");
  }

  sanitizeSvgElement(svgElement);
  const importedSvg = targetDocument.importNode(svgElement, true) as unknown as SVGElement;
  tightenMermaidSequenceMessageSpacing(importedSvg);
  normalizeMermaidGanttLayerOrder(importedSvg);
  normalizeMermaidGanttTaskTextVerticalAlignment(importedSvg);
  injectMermaidGanttPostStyle(importedSvg, config);
  injectMermaidStatePostStyle(importedSvg, config);
  forceMermaidGanttBarBorderColor(importedSvg, config);
  forceMermaidGanttBarTextColor(importedSvg, config);
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
  svgElement.style.removeProperty("max-height");
  svgElement.style.removeProperty("min-width");
  svgElement.style.removeProperty("min-height");

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

function applyMermaidBlockPresentation(block: HTMLElement, prepared: PreparedMermaidRender): void {
  block.classList.toggle("kmark-mermaid-block--gantt", prepared.expectsGantt);
  block.style.setProperty("--kmark-mermaid-surface-bg", prepared.surfaceBackground);
  block.style.setProperty("--kmark-mermaid-svg-bg", prepared.svgBackground);

  if (prepared.ganttSize !== undefined) {
    block.style.setProperty("--kmark-mermaid-font-size", `${prepared.ganttSize.fontSizePx}px`);
    block.style.setProperty("--kmark-mermaid-gantt-bar-height", `${prepared.ganttSize.barHeight}px`);
  } else {
    block.style.removeProperty("--kmark-mermaid-font-size");
    block.style.removeProperty("--kmark-mermaid-gantt-bar-height");
  }
}

async function renderMermaidBlock(
  block: HTMLElement,
  theme: MermaidPreviewTheme,
  surface: MermaidPreviewSurface,
  themeVariables?: MermaidThemeVariables,
  revision = 0,
  httpsHosts: readonly string[] = [],
  signal?: AbortSignal,
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
    const svgElement = parseSafeMermaidSvg(
      svg,
      block.ownerDocument,
      prepared.config,
    );
    if (isAbortRequested(signal)) {
      throw new DOMException("Mermaid render superseded", "AbortError");
    }
    const finalized = await finalizeGeneratedSvg({
      revision,
      renderId: `mermaid-r${revision}-b${block.dataset.kmarkMermaidIndex ?? "0"}`,
      rawSvg: new XMLSerializer().serializeToString(svgElement),
      presentation: {
        rootStyle: block.dataset.kmarkGeneratedSvgStyle ?? block.dataset.kmarkMermaidSvgStyle ?? null,
        position: block.dataset.kmarkGeneratedSvgPosition ?? block.dataset.kmarkMermaidPosition ?? null,
      },
    }, httpsHosts);
    if (isAbortRequested(signal) || finalized.revision !== revision) {
      throw new DOMException("Mermaid render superseded", "AbortError");
    }
    const finalizedDocument = new DOMParser().parseFromString(finalized.svg, "image/svg+xml");
    const finalizedSvg = finalizedDocument.documentElement;
    if (finalizedSvg.localName.toLowerCase() !== "svg" || finalizedSvg.querySelector("parsererror") !== null) {
      throw new Error("Rust SVG finalizer returned invalid SVG");
    }
    const importedFinalizedSvg = block.ownerDocument.importNode(finalizedSvg, true) as unknown as SVGElement;
    block.classList.toggle("kmark-mermaid-block--gantt", prepared.expectsGantt || isMermaidGanttSvg(importedFinalizedSvg));
    renderedContainer.replaceChildren(importedFinalizedSvg);
    block.dataset.kmarkMermaidState = "rendered";
  } catch (error) {
    if ((error instanceof DOMException && error.name === "AbortError") || signal?.aborted === true) {
      throw error;
    }
    renderMermaidError(block, renderedContainer, sourceDetails, toMermaidErrorMessage(error));
  }
}

export async function renderMermaidBlocks(
  root: ParentNode,
  options: RenderMermaidHtmlOptions = {},
): Promise<void> {
  const theme = options.theme ?? resolveMermaidPreviewTheme(options.surface);
  const surface = options.surface ?? "standard";
  const themeVariables = options.themeVariables ?? resolveKmarkMermaidThemeVariables(surface);
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_BLOCK_SELECTOR));

  for (const block of blocks) {
    await renderMermaidBlock(
      block,
      theme,
      surface,
      themeVariables,
      options.revision ?? 0,
      options.httpsHosts ?? [],
      options.signal,
    );
    if (options.strict === true && block.dataset.kmarkMermaidState === "error") {
      throw new Error(block.querySelector<HTMLElement>(".kmark-mermaid-error-message")?.textContent ?? "Mermaid render failed");
    }
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
  options.onUpdate?.(template.innerHTML);

  return template.innerHTML;
}
