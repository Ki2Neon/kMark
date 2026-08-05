export type KmarkMermaidPreviewSurface = "standard" | "paper";
export type KmarkMermaidThemeValue = string | number | boolean | KmarkMermaidThemeVariables;
export interface KmarkMermaidThemeVariables {
  [key: string]: KmarkMermaidThemeValue;
}

export type KmarkMermaidThemeTokens = {
  readonly surface: string;
  readonly text: string;
  readonly textSoft: string;
  readonly border: string;
  readonly focus: string;
  readonly danger: string;
};

type RgbColor = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
};

type HslColor = {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
};

const PAPER_MERMAID_THEME_TOKENS: KmarkMermaidThemeTokens = {
  surface: "#ffffff",
  text: "#111111",
  textSoft: "#555555",
  border: "#d7d7d7",
  focus: "#3b5ccc",
  danger: "#9f2d20",
};

const LOW_CHROMA_ACCENTS = [
  "#5e6b7d",
  "#647467",
  "#766b5f",
  "#756a7a",
  "#5d7478",
  "#78715e",
  "#6f6571",
  "#687065",
  "#6e6f78",
  "#70685f",
  "#5f7074",
  "#6f6a7a",
] as const;

const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/iu;
const MAX_THEME_SATURATION = 0.42;
const MIN_GRAPHIC_CONTRAST_RATIO = 3;
const MIN_TEXT_CONTRAST_RATIO = 4.5;
const CONTRAST_SEARCH_STEPS = 255;
const BLACK = "#000000";
const WHITE = "#ffffff";

export function shouldUsePaperMermaidColors(_surface: KmarkMermaidPreviewSurface = "standard"): boolean {
  return typeof document === "undefined" || document.documentElement.dataset.previewColors !== "app";
}

export function resolveKmarkMermaidThemeVariables(
  surface: KmarkMermaidPreviewSurface = "standard",
): KmarkMermaidThemeVariables {
  return createKmarkMermaidThemeVariables(resolveKmarkMermaidThemeTokens(surface));
}

function resolveKmarkMermaidThemeTokens(surface: KmarkMermaidPreviewSurface): KmarkMermaidThemeTokens {
  if (shouldUsePaperMermaidColors(surface) || typeof document === "undefined") {
    return PAPER_MERMAID_THEME_TOKENS;
  }

  const rootStyle = getComputedStyle(document.documentElement);

  return {
    surface: readCssHexColor(rootStyle, "--preview-surface", PAPER_MERMAID_THEME_TOKENS.surface),
    text: readCssHexColor(rootStyle, "--preview-text", PAPER_MERMAID_THEME_TOKENS.text),
    textSoft: readCssHexColor(rootStyle, "--preview-text-soft", PAPER_MERMAID_THEME_TOKENS.textSoft),
    border: readCssHexColor(rootStyle, "--preview-border", PAPER_MERMAID_THEME_TOKENS.border),
    focus: readCssHexColor(rootStyle, "--focus", PAPER_MERMAID_THEME_TOKENS.focus),
    danger: readCssHexColor(rootStyle, "--danger", PAPER_MERMAID_THEME_TOKENS.danger),
  };
}

export function createKmarkMermaidThemeVariables(tokens: KmarkMermaidThemeTokens): KmarkMermaidThemeVariables {
  const surface = limitSaturation(tokens.surface);
  const preferredText = limitSaturation(tokens.text);
  const textSoft = limitSaturation(tokens.textSoft);
  const border = limitSaturation(tokens.border);
  const focus = limitSaturation(tokens.focus);
  const danger = limitSaturation(tokens.danger);
  const isDark = relativeLuminance(surface) < 0.38;
  const text = readableTextColor([surface], preferredText);
  const panel = mixHex(surface, text, isDark ? 0.10 : 0.04);
  const panelAlt = mixHex(surface, text, isDark ? 0.16 : 0.07);
  const panelStrong = mixHex(surface, text, isDark ? 0.26 : 0.13);
  const primary = softenedMix(surface, focus, isDark ? 0.30 : 0.17);
  const secondary = softenedMix(surface, LOW_CHROMA_ACCENTS[1], isDark ? 0.54 : 0.28);
  const tertiary = softenedMix(surface, LOW_CHROMA_ACCENTS[2], isDark ? 0.50 : 0.22);
  const dangerFill = softenedMix(surface, danger, isDark ? 0.28 : 0.14);
  const structuralBackgrounds = [surface, panel, panelAlt, panelStrong, primary, secondary, tertiary, dangerFill];
  const structuralTarget = preferredContrastEndpoint(structuralBackgrounds);
  const line = ensureMinimumContrast(textSoft, structuralBackgrounds, structuralTarget, MIN_GRAPHIC_CONTRAST_RATIO);
  const lineStrong = ensureMinimumContrast(border, structuralBackgrounds, structuralTarget, MIN_GRAPHIC_CONTRAST_RATIO);
  const dangerBorder = ensureMinimumContrast(
    softenedMix(text, danger, 0.18),
    [surface, dangerFill],
    structuralTarget,
    MIN_GRAPHIC_CONTRAST_RATIO,
  );
  const chartColors = LOW_CHROMA_ACCENTS.map((accent) => (
    ensureChartColorContrast(
      softenedMix(surface, accent, isDark ? 0.62 : 0.38),
      surface,
    )
  ));
  const chartPeerColors = chartColors.map((color) => (
    ensureMinimumContrast(
      mixHex(color, text, isDark ? 0.16 : 0.10),
      [surface, BLACK],
      WHITE,
      MIN_GRAPHIC_CONTRAST_RATIO,
    )
  ));
  const chartText = BLACK;
  const themeVariables: KmarkMermaidThemeVariables = {
    darkMode: isDark,
    useGradient: false,
    background: surface,
    mainBkg: panel,
    nodeBkg: panel,
    nodeBorder: lineStrong,
    primaryColor: primary,
    primaryTextColor: readableTextColor([primary], text),
    primaryBorderColor: lineStrong,
    secondaryColor: secondary,
    secondaryTextColor: readableTextColor([secondary], text),
    secondaryBorderColor: lineStrong,
    tertiaryColor: tertiary,
    tertiaryTextColor: readableTextColor([tertiary], text),
    tertiaryBorderColor: lineStrong,
    textColor: text,
    nodeTextColor: text,
    titleColor: text,
    lineColor: lineStrong,
    defaultLinkColor: lineStrong,
    arrowheadColor: lineStrong,
    border1: lineStrong,
    border2: line,
    note: tertiary,
    noteBorderColor: line,
    noteBkgColor: tertiary,
    noteTextColor: readableTextColor([tertiary], text),
    clusterBkg: panel,
    clusterBorder: line,
    edgeLabelBackground: surface,
    actorBkg: panel,
    actorBorder: lineStrong,
    actorTextColor: text,
    actorLineColor: line,
    signalColor: lineStrong,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: line,
    labelTextColor: text,
    loopTextColor: text,
    activationBorderColor: lineStrong,
    activationBkgColor: panelStrong,
    sequenceNumberColor: text,
    personBorder: lineStrong,
    personBkg: panel,
    stateBkg: panel,
    stateBorder: lineStrong,
    stateLabelColor: text,
    labelBackgroundColor: surface,
    transitionColor: text,
    transitionLabelColor: text,
    specialStateColor: text,
    innerEndBackground: text,
    compositeBackground: surface,
    compositeTitleBackground: panel,
    compositeBorder: lineStrong,
    errorBkgColor: dangerFill,
    errorTextColor: readableTextColor([dangerFill], text),
    classText: text,
    relationColor: lineStrong,
    relationLabelBackground: surface,
    relationLabelColor: text,
    entityBkg: panel,
    entityBorder: lineStrong,
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: panel,
    rowOdd: surface,
    rowEven: panel,
    sectionBkgColor: panelAlt,
    altSectionBkgColor: surface,
    sectionBkgColor2: panelStrong,
    taskBkgColor: lineStrong,
    taskBorderColor: lineStrong,
    taskTextLightColor: readableTextColor([lineStrong], text),
    taskTextColor: readableTextColor([lineStrong], text),
    taskTextDarkColor: readableTextColor([lineStrong], text),
    taskTextOutsideColor: text,
    taskTextClickableColor: readableTextColor([lineStrong], text),
    activeTaskBkgColor: primary,
    activeTaskBorderColor: lineStrong,
    doneTaskBkgColor: panelStrong,
    doneTaskBorderColor: lineStrong,
    critBkgColor: dangerFill,
    critBorderColor: lineStrong,
    gridColor: line,
    vertLineColor: lineStrong,
    todayLineColor: dangerBorder,
    excludeBkgColor: panelStrong,
    pieTitleTextSize: "1.25rem",
    pieTitleTextColor: text,
    pieSectionTextSize: "1rem",
    pieSectionTextColor: chartText,
    pieLegendTextColor: text,
    pieStrokeColor: surface,
    pieOpacity: "1",
    pieOuterStrokeColor: lineStrong,
    quadrant1Fill: panel,
    quadrant2Fill: panelAlt,
    quadrant3Fill: panelStrong,
    quadrant4Fill: mixHex(surface, text, isDark ? 0.20 : 0.10),
    quadrant1TextFill: text,
    quadrant2TextFill: text,
    quadrant3TextFill: text,
    quadrant4TextFill: text,
    quadrantPointFill: lineStrong,
    quadrantPointTextFill: readableTextColor([lineStrong], text),
    quadrantXAxisTextFill: text,
    quadrantYAxisTextFill: text,
    quadrantInternalBorderStrokeFill: line,
    quadrantExternalBorderStrokeFill: lineStrong,
    quadrantTitleFill: text,
    requirementBackground: panel,
    requirementBorderColor: lineStrong,
    requirementTextColor: text,
    scaleLabelColor: text,
    archEdgeColor: lineStrong,
    archEdgeArrowColor: lineStrong,
    archGroupBorderColor: lineStrong,
    radar: {
      axisColor: lineStrong,
      graticuleColor: line,
      graticuleOpacity: 1,
    },
    wardley: {
      backgroundColor: surface,
      axisColor: lineStrong,
      axisTextColor: text,
      gridColor: line,
      componentFill: panel,
      componentStroke: lineStrong,
      componentLabelColor: text,
      linkStroke: lineStrong,
      evolutionStroke: dangerBorder,
      annotationStroke: lineStrong,
      annotationTextColor: text,
      annotationFill: surface,
    },
    xyChart: {
      backgroundColor: surface,
      titleColor: text,
      dataLabelColor: text,
      xAxisTitleColor: text,
      xAxisLabelColor: text,
      xAxisTickColor: lineStrong,
      xAxisLineColor: lineStrong,
      yAxisTitleColor: text,
      yAxisLabelColor: text,
      yAxisTickColor: lineStrong,
      yAxisLineColor: lineStrong,
      plotColorPalette: chartColors.join(","),
    },
    emUiFill: panel,
    emUiStroke: lineStrong,
    emProcessorFill: primary,
    emProcessorStroke: lineStrong,
    emReadModelFill: secondary,
    emReadModelStroke: lineStrong,
    emCommandFill: tertiary,
    emCommandStroke: lineStrong,
    emEventFill: dangerFill,
    emEventStroke: lineStrong,
    emSwimlaneBackgroundOdd: panel,
    emSwimlaneBackgroundStroke: line,
    emArrowhead: lineStrong,
    emRelationStroke: lineStrong,
    tagLabelColor: readableTextColor([primary], text),
    tagLabelBackground: primary,
    tagLabelBorder: lineStrong,
    commitLabelColor: readableTextColor([secondary], text),
    commitLabelBackground: secondary,
    commitLineColor: lineStrong,
    fillType0: chartColors[0],
    fillType1: chartColors[1],
    fillType2: chartColors[2],
    fillType3: chartColors[3],
    fillType4: chartColors[4],
    fillType5: chartColors[5],
    fillType6: chartColors[6],
    fillType7: chartColors[7],
  };

  for (const [index, color] of chartColors.entries()) {
    const peerColor = chartPeerColors[index];
    const labelColor = readableTextColor([color, peerColor], chartText);
    themeVariables[`pie${index + 1}`] = color;
    themeVariables[`cScale${index}`] = color;
    themeVariables[`cScaleInv${index}`] = labelColor;
    themeVariables[`cScalePeer${index}`] = peerColor;
    themeVariables[`cScaleLabel${index}`] = labelColor;
  }
  for (let index = 0; index < 8; index += 1) {
    themeVariables[`git${index}`] = chartColors[index];
    themeVariables[`gitInv${index}`] = readableTextColor([chartColors[index]], chartText);
    themeVariables[`gitBranchLabel${index}`] = readableTextColor([chartColors[index]], chartText);
  }
  for (let index = 0; index < 8; index += 1) {
    themeVariables[`venn${index + 1}`] = chartColors[index];
  }
  themeVariables.vennTitleTextColor = text;
  themeVariables.vennSetTextColor = chartText;

  return themeVariables;
}

function readCssHexColor(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return normalizeHexColor(style.getPropertyValue(name), fallback);
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();

  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function parseHexColor(value: string): RgbColor {
  const normalized = normalizeHexColor(value, "#000000");

  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function toHexColor(color: RgbColor): string {
  return `#${toHexByte(color.red)}${toHexByte(color.green)}${toHexByte(color.blue)}`;
}

function toHexByte(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixHex(left: string, right: string, rightWeight: number): string {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);
  const ratio = Math.max(0, Math.min(1, rightWeight));
  const inverseRatio = 1 - ratio;

  return toHexColor({
    red: leftRgb.red * inverseRatio + rightRgb.red * ratio,
    green: leftRgb.green * inverseRatio + rightRgb.green * ratio,
    blue: leftRgb.blue * inverseRatio + rightRgb.blue * ratio,
  });
}

function softenedMix(left: string, right: string, rightWeight: number): string {
  return limitSaturation(mixHex(left, right, rightWeight));
}

function limitSaturation(hexColor: string): string {
  const hsl = rgbToHsl(parseHexColor(hexColor));

  if (hsl.saturation <= MAX_THEME_SATURATION) {
    return hexColor;
  }

  return toHexColor(hslToRgb({ ...hsl, saturation: MAX_THEME_SATURATION }));
}

function relativeLuminance(hexColor: string): number {
  const { red, green, blue } = parseHexColor(hexColor);
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

export function calculateKmarkMermaidContrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function minimumContrastRatio(color: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((background) => calculateKmarkMermaidContrastRatio(color, background)));
}

function preferredContrastEndpoint(backgrounds: readonly string[]): string {
  return minimumContrastRatio(BLACK, backgrounds) >= minimumContrastRatio(WHITE, backgrounds)
    ? BLACK
    : WHITE;
}

function ensureMinimumContrast(
  candidate: string,
  backgrounds: readonly string[],
  target: string,
  minimumRatio: number,
): string {
  if (minimumContrastRatio(candidate, backgrounds) >= minimumRatio) {
    return candidate;
  }

  let bestColor = candidate;
  let bestRatio = minimumContrastRatio(candidate, backgrounds);

  for (let step = 1; step <= CONTRAST_SEARCH_STEPS; step += 1) {
    const adjusted = mixHex(candidate, target, step / CONTRAST_SEARCH_STEPS);
    const ratio = minimumContrastRatio(adjusted, backgrounds);

    if (ratio > bestRatio) {
      bestColor = adjusted;
      bestRatio = ratio;
    }
    if (ratio >= minimumRatio) {
      return adjusted;
    }
  }

  return bestColor;
}

function readableTextColor(backgrounds: readonly string[], preferred: string): string {
  return ensureMinimumContrast(
    preferred,
    backgrounds,
    preferredContrastEndpoint(backgrounds),
    MIN_TEXT_CONTRAST_RATIO,
  );
}

function ensureChartColorContrast(candidate: string, surface: string): string {
  const visibleFill = ensureMinimumContrast(
    candidate,
    [surface],
    preferredContrastEndpoint([surface]),
    MIN_GRAPHIC_CONTRAST_RATIO,
  );

  return ensureMinimumContrast(visibleFill, [BLACK], WHITE, MIN_TEXT_CONTRAST_RATIO);
}

function rgbToHsl(color: RgbColor): HslColor {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === red
    ? ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
    : max === green
      ? ((blue - red) / delta + 2) / 6
      : ((red - green) / delta + 4) / 6;

  return { hue, saturation, lightness };
}

function hslToRgb(color: HslColor): RgbColor {
  if (color.saturation === 0) {
    const channel = color.lightness * 255;

    return { red: channel, green: channel, blue: channel };
  }

  const q = color.lightness < 0.5
    ? color.lightness * (1 + color.saturation)
    : color.lightness + color.saturation - color.lightness * color.saturation;
  const p = 2 * color.lightness - q;

  return {
    red: hueToRgb(p, q, color.hue + 1 / 3) * 255,
    green: hueToRgb(p, q, color.hue) * 255,
    blue: hueToRgb(p, q, color.hue - 1 / 3) * 255,
  };
}

function hueToRgb(p: number, q: number, rawHue: number): number {
  let hue = rawHue;
  if (hue < 0) {
    hue += 1;
  }
  if (hue > 1) {
    hue -= 1;
  }
  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue;
  }
  if (hue < 1 / 2) {
    return q;
  }
  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6;
  }

  return p;
}
