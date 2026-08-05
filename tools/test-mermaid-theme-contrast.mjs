import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateKmarkMermaidContrastRatio,
  createKmarkMermaidThemeVariables,
} from "../src/adapters/browser/browserMermaidTheme.ts";

const GRAPHIC_CONTRAST_RATIO = 3;
const TEXT_CONTRAST_RATIO = 4.5;
const APP_THEME_TOKEN_NAMES = ["surface", "text", "text-soft", "border", "focus", "danger"];
const EXPECTED_APP_THEMES = [
  "default",
  "vscode-light",
  "github-dark",
  "github-light",
  "dracula",
  "night-owl",
  "monokai",
  "paper",
];
const DARK_APP_THEMES = new Set(["default", "github-dark", "dracula", "night-owl", "monokai"]);
const PAPER_THEME_TOKENS = {
  surface: "#ffffff",
  text: "#111111",
  textSoft: "#555555",
  border: "#d7d7d7",
  focus: "#3b5ccc",
  danger: "#9f2d20",
};

const STRUCTURAL_COLOR_PAIRS = [
  ["nodeBorder", "mainBkg"],
  ["primaryBorderColor", "primaryColor"],
  ["secondaryBorderColor", "secondaryColor"],
  ["tertiaryBorderColor", "tertiaryColor"],
  ["lineColor", "background"],
  ["defaultLinkColor", "background"],
  ["arrowheadColor", "background"],
  ["noteBorderColor", "noteBkgColor"],
  ["clusterBorder", "clusterBkg"],
  ["actorBorder", "actorBkg"],
  ["actorLineColor", "background"],
  ["signalColor", "background"],
  ["labelBoxBorderColor", "labelBoxBkgColor"],
  ["activationBorderColor", "activationBkgColor"],
  ["stateBorder", "stateBkg"],
  ["transitionColor", "background"],
  ["relationColor", "background"],
  ["entityBorder", "entityBkg"],
  ["gridColor", "background"],
  ["vertLineColor", "background"],
  ["todayLineColor", "background"],
  ["pieOuterStrokeColor", "background"],
  ["quadrantInternalBorderStrokeFill", "quadrant3Fill"],
  ["quadrantExternalBorderStrokeFill", "background"],
  ["requirementBorderColor", "requirementBackground"],
  ["archEdgeColor", "background"],
  ["archEdgeArrowColor", "background"],
  ["archGroupBorderColor", "background"],
  ["radar.axisColor", "background"],
  ["radar.graticuleColor", "background"],
  ["wardley.axisColor", "wardley.backgroundColor"],
  ["wardley.gridColor", "wardley.backgroundColor"],
  ["wardley.componentStroke", "wardley.componentFill"],
  ["wardley.linkStroke", "wardley.backgroundColor"],
  ["wardley.annotationStroke", "wardley.annotationFill"],
  ["xyChart.xAxisTickColor", "xyChart.backgroundColor"],
  ["xyChart.xAxisLineColor", "xyChart.backgroundColor"],
  ["xyChart.yAxisTickColor", "xyChart.backgroundColor"],
  ["xyChart.yAxisLineColor", "xyChart.backgroundColor"],
  ["emUiStroke", "emUiFill"],
  ["emProcessorStroke", "emProcessorFill"],
  ["emReadModelStroke", "emReadModelFill"],
  ["emCommandStroke", "emCommandFill"],
  ["emEventStroke", "emEventFill"],
  ["emSwimlaneBackgroundStroke", "background"],
  ["emArrowhead", "background"],
  ["emRelationStroke", "background"],
];

const TEXT_COLOR_PAIRS = [
  ["textColor", "background"],
  ["primaryTextColor", "primaryColor"],
  ["secondaryTextColor", "secondaryColor"],
  ["tertiaryTextColor", "tertiaryColor"],
  ["noteTextColor", "noteBkgColor"],
  ["actorTextColor", "actorBkg"],
  ["labelTextColor", "labelBoxBkgColor"],
  ["stateLabelColor", "stateBkg"],
  ["transitionLabelColor", "labelBackgroundColor"],
  ["errorTextColor", "errorBkgColor"],
  ["requirementTextColor", "requirementBackground"],
  ["quadrantPointTextFill", "quadrantPointFill"],
  ["taskTextColor", "taskBkgColor"],
  ["tagLabelColor", "tagLabelBackground"],
  ["commitLabelColor", "commitLabelBackground"],
  ["wardley.axisTextColor", "wardley.backgroundColor"],
  ["wardley.componentLabelColor", "wardley.componentFill"],
  ["wardley.annotationTextColor", "wardley.annotationFill"],
  ["xyChart.titleColor", "xyChart.backgroundColor"],
  ["xyChart.dataLabelColor", "xyChart.backgroundColor"],
  ["xyChart.xAxisTitleColor", "xyChart.backgroundColor"],
  ["xyChart.xAxisLabelColor", "xyChart.backgroundColor"],
  ["xyChart.yAxisTitleColor", "xyChart.backgroundColor"],
  ["xyChart.yAxisLabelColor", "xyChart.backgroundColor"],
];

function parseCssVariables(block) {
  return Object.fromEntries(
    Array.from(block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/giu))
      .map((match) => [match[1], match[2].toLowerCase()]),
  );
}

function readAppThemeTokenCases() {
  const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
  const blocks = Array.from(css.matchAll(/:root(?:\[data-app-theme="([^"]+)"\])?\s*\{([^}]*)\}/gu));
  const defaultBlock = blocks.find((match) => match[1] === undefined);

  assert.ok(defaultBlock, "default :root theme is missing");
  const defaults = parseCssVariables(defaultBlock[2]);
  const cases = new Map([["default", defaults]]);

  for (const match of blocks) {
    if (match[1] !== undefined) {
      cases.set(match[1], { ...defaults, ...parseCssVariables(match[2]) });
    }
  }

  assert.deepEqual([...cases.keys()], EXPECTED_APP_THEMES);

  return [...cases].map(([name, variables]) => {
    for (const tokenName of APP_THEME_TOKEN_NAMES) {
      assert.match(variables[tokenName] ?? "", /^#[0-9a-f]{6}$/u, `${name}.${tokenName}`);
    }

    return [name, {
      surface: variables.surface,
      text: variables.text,
      textSoft: variables["text-soft"],
      border: variables.border,
      focus: variables.focus,
      danger: variables.danger,
    }];
  });
}

function readThemeValue(theme, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], theme);
  assert.notEqual(value, undefined, `missing Mermaid theme value: ${path}`);
  return value;
}

function readThemeColor(theme, path) {
  const value = readThemeValue(theme, path);
  assert.equal(typeof value, "string", `${path} must be a color string`);
  assert.match(value, /^#[0-9a-f]{6}$/u, `${path} must be a six-digit hex color`);
  return value;
}

function assertContrast(themeName, theme, foregroundPath, backgroundPath, minimumRatio) {
  const foreground = readThemeColor(theme, foregroundPath);
  const background = readThemeColor(theme, backgroundPath);
  const ratio = calculateKmarkMermaidContrastRatio(foreground, background);

  assert.ok(
    ratio >= minimumRatio,
    `${themeName}: ${foregroundPath}/${backgroundPath} contrast ${ratio.toFixed(3)} < ${minimumRatio}`,
  );
}

function assertGeneratedThemeContrast(themeName, tokens) {
  const theme = createKmarkMermaidThemeVariables(tokens);

  assert.equal(theme.darkMode, DARK_APP_THEMES.has(themeName));
  assert.equal(theme.useGradient, false);
  assert.equal(theme.pieOpacity, "1");

  for (const [foreground, background] of STRUCTURAL_COLOR_PAIRS) {
    assertContrast(themeName, theme, foreground, background, GRAPHIC_CONTRAST_RATIO);
  }
  for (const [foreground, background] of TEXT_COLOR_PAIRS) {
    assertContrast(themeName, theme, foreground, background, TEXT_CONTRAST_RATIO);
  }

  for (let index = 0; index < 12; index += 1) {
    assertContrast(themeName, theme, `pie${index + 1}`, "background", GRAPHIC_CONTRAST_RATIO);
    assertContrast(themeName, theme, "pieSectionTextColor", `pie${index + 1}`, TEXT_CONTRAST_RATIO);
    assertContrast(themeName, theme, `cScale${index}`, "background", GRAPHIC_CONTRAST_RATIO);
    assertContrast(themeName, theme, `cScaleInv${index}`, `cScale${index}`, TEXT_CONTRAST_RATIO);
    assertContrast(themeName, theme, `cScaleLabel${index}`, `cScalePeer${index}`, TEXT_CONTRAST_RATIO);
  }
  for (let index = 0; index < 8; index += 1) {
    assertContrast(themeName, theme, `fillType${index}`, "background", GRAPHIC_CONTRAST_RATIO);
    assertContrast(themeName, theme, `git${index}`, "background", GRAPHIC_CONTRAST_RATIO);
    assertContrast(themeName, theme, `gitInv${index}`, `git${index}`, TEXT_CONTRAST_RATIO);
    assertContrast(themeName, theme, `gitBranchLabel${index}`, `git${index}`, TEXT_CONTRAST_RATIO);
    assertContrast(themeName, theme, `venn${index + 1}`, "background", GRAPHIC_CONTRAST_RATIO);
  }

  const plotColorPalette = readThemeValue(theme, "xyChart.plotColorPalette");
  assert.equal(typeof plotColorPalette, "string");
  assert.equal(plotColorPalette.split(",").length, 12);

  return theme;
}

for (const [themeName, tokens] of readAppThemeTokenCases()) {
  test(`Mermaid contrast contract: app theme ${themeName}`, () => {
    assertGeneratedThemeContrast(themeName, tokens);
  });
}

test("Mermaid contrast contract: fixed paper preview", () => {
  const theme = assertGeneratedThemeContrast("fixed-paper", PAPER_THEME_TOKENS);

  assert.equal(theme.darkMode, false);
  assert.equal(theme.transitionColor, "#111111");
  assert.equal(theme.specialStateColor, "#111111");
  assert.equal(theme.innerEndBackground, "#111111");
});
