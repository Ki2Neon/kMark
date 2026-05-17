import { KMARK_PARAM_SPECS } from "../schema/kmarkParamSpecs";
import { KMARK_SNIPPET_SPECS } from "../schema/kmarkSnippetSpecs";
import {
  KMARK_BOOLEAN_VALUE_PRESETS,
  KMARK_COLOR_VALUE_PRESETS,
  KMARK_LENGTH_VALUE_PRESETS,
  KMARK_PAGE_LENGTH_VALUE_PRESETS,
  KMARK_SIZE_VALUE_PRESETS,
} from "../schema/kmarkValuePresets";
import { collectKmarkDefinitions } from "./collectKmarkDefinitions";
import { detectKmarkCompletionContext } from "./detectKmarkCompletionContext";
import {
  type KmarkCompletionContext,
  type KmarkCompletionItem,
  type KmarkCompletionResult,
  type KmarkCompletionSection,
  type KmarkPathCompletionEntry,
  type KmarkParamContext,
  type KmarkParamSpec,
} from "./types";

const IMAGE_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["w", 500],
  ["h", 490],
  ["border_size", 430],
  ["border_color", 420],
  ["border_style", 415],
  ["align", 410],
]);

const VIDEO_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["video_autoplay", 500],
  ["video_muted", 490],
  ["video_loop", 480],
  ["video_poster", 470],
  ["video_poster_time", 460],
]);

const IMAGE_SNIPPET_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["image size", 470],
  ["image border", 460],
  ["image width", 455],
]);

const PAGE_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["page_size", 500],
  ["orientation", 490],
  ["page_font_size", 480],
  ["page_font_family", 475],
  ["page_heading_font_family", 472],
  ["page_margin", 470],
  ["page_number", 460],
  ["page_number_format", 450],
  ["page_number_reset", 440],
  ["page_number_start", 435],
  ["page_number_count", 430],
  ["page_number_visible", 425],
  ["page_number_style", 420],
  ["page_header_center", 415],
  ["page_header_left", 414],
  ["page_header_right", 413],
  ["page_footer_center", 412],
  ["page_footer_left", 411],
  ["page_footer_right", 410],
  ["page_header_opacity", 409],
  ["page_header_offset", 408],
  ["page_footer_opacity", 407],
  ["page_footer_offset", 406],
  ["page_header", 405],
  ["page_footer", 404],
  ["page_header_border_size", 403],
  ["page_header_border_color", 402],
  ["page_header_border_style", 401],
  ["page_header_font_size", 400],
  ["page_header_font_family", 399],
  ["page_header_font_color", 398],
  ["page_header_padding", 397],
  ["page_footer_border_size", 396],
  ["page_footer_border_color", 395],
  ["page_footer_border_style", 394],
  ["page_footer_font_size", 393],
  ["page_footer_font_family", 392],
  ["page_footer_font_color", 391],
  ["page_footer_padding", 390],
]);

const SCOPE_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["layout", 500],
  ["gap", 490],
  ["wrap", 480],
  ["heading_number", 470],
  ["heading_number_from", 460],
  ["heading_number_depth", 450],
  ["heading_number_pattern", 440],
]);

const TABLE_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["table_cell_padding", 500],
  ["table_cell_padding_x", 490],
  ["table_cell_padding_y", 480],
  ["table_fit", 470],
  ["table_layout", 460],
  ["font_size", 430],
  ["line_height", 420],
  ["w", 410],
]);

const TOC_PARAM_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["toc", 520],
  ["toc_depth", 500],
  ["toc_title", 490],
  ["toc_min_depth", 470],
  ["toc_ordered", 460],
  ["toc_links", 450],
]);

const FONT_FAMILY_PARAM_NAMES = new Set([
  "font_family",
  "page_font_family",
  "page_heading_font_family",
  "page_header_font_family",
  "page_footer_font_family",
]);

const PATH_PARAM_NAMES = new Set([
  "video_poster",
]);

export function createKmarkSuggestions(input: {
  readonly markdown: string;
  readonly cursorOffset: number;
  readonly fontFamilies?: readonly string[];
  readonly pathCompletions?: readonly KmarkPathCompletionEntry[];
}): KmarkCompletionResult {
  const context = detectKmarkCompletionContext(input);

  if (!context.active) {
    return { context, items: [] };
  }

  if (context.mode === "style-use") {
    return {
      context,
      items: createStyleUseSuggestions(context, input.markdown),
    };
  }

  if (context.mode === "parameter-value" || context.mode === "style-define") {
    return {
      context,
      items: createValueSuggestions(context, input.fontFamilies ?? [], input.pathCompletions ?? []),
    };
  }

  return {
    context,
    items: [
      ...createParamNameSuggestions(context),
      ...createSnippetSuggestions(context),
    ].sort(compareCompletionItems),
  };
}

function createParamNameSuggestions(context: KmarkCompletionContext): readonly KmarkCompletionItem[] {
  const paramPrefix = (context.paramPrefix ?? "").toLocaleLowerCase("en-US");

  return KMARK_PARAM_SPECS
    .filter((spec) => matchesAnyContext(spec.contexts, context.contexts))
    .filter((spec) => !hasUsedParamName(spec, context.usedParamNames) || spec.allowMultiple === true)
    .filter((spec) => matchesParamPrefix(spec, paramPrefix))
    .map((spec) => {
      const priority = scoreParamSpec(spec, context, paramPrefix);

      return {
        label: spec.name,
        insertText: spec.insertText ?? `${spec.name}:`,
        description: formatDescription(spec.description, spec.examples),
        detail: detailForSection(resolveCompletionSection(spec.contexts, context.contexts, "general")),
        kind: "parameter",
        priority,
        section: resolveCompletionSection(spec.contexts, context.contexts, "general"),
        sortText: sortTextForScore(priority, spec.name),
      };
    });
}

export function isKmarkFontFamilyParamName(name: string): boolean {
  return FONT_FAMILY_PARAM_NAMES.has(name);
}

export function isKmarkPathParamName(name: string): boolean {
  return PATH_PARAM_NAMES.has(name);
}

function createValueSuggestions(
  context: KmarkCompletionContext,
  fontFamilies: readonly string[],
  pathCompletions: readonly KmarkPathCompletionEntry[],
): readonly KmarkCompletionItem[] {
  const paramName = context.currentParamName ?? "";
  const spec = findParamSpec(paramName);

  if (spec === null) {
    return [];
  }

  if (isKmarkFontFamilyParamName(spec.name)) {
    return createFontFamilyValueSuggestions(context, spec, fontFamilies);
  }

  if (isKmarkPathParamName(spec.name)) {
    return createPathValueSuggestions(context, spec, pathCompletions);
  }

  const prefix = (context.currentValuePrefix ?? "").toLocaleLowerCase("en-US");
  const values = valuesForParamSpec(spec);

  return values
    .filter((value) => value.toLocaleLowerCase("en-US").startsWith(prefix))
    .map((value, index) => ({
      label: value,
      insertText: withOptionalTrailingSpace(value, context),
      description: spec.description,
      detail: spec.name,
      kind: "value",
      section: resolveCompletionSection(spec.contexts, context.contexts, "general"),
      priority: (spec.priority ?? 0) - index,
      sortText: `${String(index).padStart(3, "0")}-${value}`,
    }));
}

function createPathValueSuggestions(
  context: KmarkCompletionContext,
  spec: KmarkParamSpec,
  pathCompletions: readonly KmarkPathCompletionEntry[],
): readonly KmarkCompletionItem[] {
  return pathCompletions.map((pathCompletion, index) => {
    const insertText = pathCompletion.entryKind === "directory"
      ? pathCompletion.insertText
      : withOptionalTrailingSpace(pathCompletion.insertText, context);

    return {
      label: pathCompletion.label,
      insertText,
      description: `${spec.description}: ${pathCompletion.relativePath}`,
      detail: pathCompletion.entryKind === "directory" ? "directory" : spec.name,
      kind: "path",
      pathEntryKind: pathCompletion.entryKind,
      section: resolveCompletionSection(spec.contexts, context.contexts, "general"),
      priority: (spec.priority ?? 0) - index,
      sortText: `${String(index).padStart(3, "0")}-${pathCompletion.label}`,
    };
  });
}

function createFontFamilyValueSuggestions(
  context: KmarkCompletionContext,
  spec: KmarkParamSpec,
  fontFamilies: readonly string[],
): readonly KmarkCompletionItem[] {
  const prefix = normalizeFontFamilyPrefix(context.currentValuePrefix ?? "");

  return fontFamilies
    .filter((fontFamily) => fontFamily.toLocaleLowerCase("ja-JP").startsWith(prefix))
    .map((fontFamily, index) => {
      const insertText = quoteKmarkFontFamilyValue(fontFamily);

      return {
        label: fontFamily,
        insertText: withOptionalTrailingSpace(insertText, context),
        description: `${spec.description}: ${fontFamily}`,
        detail: "PC font family",
        kind: "value",
        section: resolveCompletionSection(spec.contexts, context.contexts, "general"),
        priority: (spec.priority ?? 0) - index,
        sortText: `${String(index).padStart(3, "0")}-${fontFamily}`,
      };
    });
}

function createSnippetSuggestions(context: KmarkCompletionContext): readonly KmarkCompletionItem[] {
  const prefix = (context.paramPrefix ?? "").toLocaleLowerCase("en-US");

  return KMARK_SNIPPET_SPECS
    .filter((snippet) => matchesAnyContext(snippet.contexts, context.contexts))
    .filter((snippet) => matchesSnippetPrefix(snippet, prefix))
    .map((snippet) => {
      const section = resolveCompletionSection(snippet.contexts, context.contexts, "snippet");
      const priority = scoreSnippetSpec(snippet.label, snippet.contexts, context, snippet.priority ?? 0, prefix);

      return {
        label: snippet.label,
        insertText: snippet.insertText,
        description: formatDescription(snippet.description, snippet.examples),
        detail: detailForSection(section),
        kind: "snippet",
        priority,
        section,
        snippet: true,
        sortText: sortTextForScore(priority, snippet.label),
      };
    });
}

function createStyleUseSuggestions(context: KmarkCompletionContext, markdown: string): readonly KmarkCompletionItem[] {
  const prefix = (context.currentValuePrefix ?? "").toLocaleLowerCase("en-US");

  return collectKmarkDefinitions(markdown)
    .filter((name) => name.toLocaleLowerCase("en-US").startsWith(prefix))
    .map((name, index) => ({
      label: name,
      insertText: withOptionalTrailingSpace(name, context),
      description: `定義済みkmarkスタイル ${name} を使用する`,
      detail: "kmark style",
      kind: "style",
      section: "style",
      priority: 100 - index,
      sortText: `${String(index).padStart(3, "0")}-${name}`,
    }));
}

function normalizeFontFamilyPrefix(value: string): string {
  return value
    .trim()
    .replace(/^["']/u, "")
    .toLocaleLowerCase("ja-JP");
}

function quoteKmarkFontFamilyValue(value: string): string {
  return `"${value.replace(/["\\]/gu, "")}"`;
}

function valuesForParamSpec(spec: KmarkParamSpec): readonly string[] {
  if (spec.values !== undefined) {
    return spec.values;
  }

  if (spec.type === "boolean") {
    return KMARK_BOOLEAN_VALUE_PRESETS;
  }

  if (spec.type === "color") {
    return KMARK_COLOR_VALUE_PRESETS;
  }

  if (spec.type === "length") {
    if (spec.name === "w" || spec.name === "h") {
      return KMARK_SIZE_VALUE_PRESETS;
    }

    return spec.contexts.includes("page") ? KMARK_PAGE_LENGTH_VALUE_PRESETS : KMARK_LENGTH_VALUE_PRESETS;
  }

  if (spec.type === "identifier" && spec.defaultValue !== undefined) {
    return [spec.defaultValue];
  }

  return [];
}

function findParamSpec(name: string): KmarkParamSpec | null {
  return KMARK_PARAM_SPECS.find((spec) => (
    spec.name === name || spec.aliases?.includes(name) === true
  )) ?? null;
}

function hasUsedParamName(spec: KmarkParamSpec, usedParamNames: ReadonlySet<string>): boolean {
  return usedParamNames.has(spec.name)
    || spec.aliases?.some((alias) => usedParamNames.has(alias)) === true;
}

function matchesParamPrefix(spec: KmarkParamSpec, prefix: string): boolean {
  if (prefix.length === 0) {
    return true;
  }

  return spec.name.toLocaleLowerCase("en-US").startsWith(prefix)
    || spec.aliases?.some((alias) => alias.toLocaleLowerCase("en-US").startsWith(prefix)) === true;
}

function matchesSnippetPrefix(
  snippet: { readonly label: string; readonly filterText?: string },
  prefix: string,
): boolean {
  if (prefix.length === 0) {
    return true;
  }

  return snippet.label.toLocaleLowerCase("en-US").includes(prefix)
    || snippet.filterText?.toLocaleLowerCase("en-US").includes(prefix) === true;
}

function matchesAnyContext(
  candidateContexts: readonly KmarkParamContext[],
  activeContexts: readonly KmarkParamContext[],
): boolean {
  return candidateContexts.some((context) => activeContexts.includes(context));
}

function scoreParamSpec(spec: KmarkParamSpec, context: KmarkCompletionContext, prefix: string): number {
  const prefixBoost = scorePrefix(spec, prefix);

  if (context.contexts.includes("video") && spec.contexts.includes("video")) {
    return 10_500 + (VIDEO_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("image") && spec.contexts.includes("image")) {
    return 10_000 + (IMAGE_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("page") && spec.contexts.includes("page")) {
    return 8_000 + (PAGE_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("table") && spec.contexts.includes("table")) {
    return 6_500 + (TABLE_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("scope") && spec.contexts.includes("scope")) {
    return 6_000 + (SCOPE_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("toc") && spec.contexts.includes("toc")) {
    return 5_000 + (TOC_PARAM_PRIORITY.get(spec.name) ?? 300) + prefixBoost;
  }

  if (context.contexts.includes("text") && spec.contexts.includes("text")) {
    return 4_000 + (spec.priority ?? 0) + prefixBoost;
  }

  return (spec.priority ?? 0) + prefixBoost;
}

function scoreSnippetSpec(
  label: string,
  snippetContexts: readonly KmarkParamContext[],
  context: KmarkCompletionContext,
  basePriority: number,
  prefix: string,
): number {
  const prefixBoost = prefix.length > 0 ? 700 : 0;

  if (context.contexts.includes("image") && snippetContexts.includes("image")) {
    return 10_000 + (IMAGE_SNIPPET_PRIORITY.get(label) ?? 350) + prefixBoost;
  }

  if (context.contexts.includes("page") && snippetContexts.includes("page")) {
    return 8_000 + basePriority + prefixBoost;
  }

  if (context.contexts.includes("table") && snippetContexts.includes("table")) {
    return 6_500 + basePriority + prefixBoost;
  }

  if (context.contexts.includes("scope") && snippetContexts.includes("scope")) {
    return 6_000 + basePriority + prefixBoost;
  }

  return basePriority + prefixBoost - 10;
}

function scorePrefix(spec: KmarkParamSpec, prefix: string): number {
  if (prefix.length === 0) {
    return 0;
  }

  const lowerPrefix = prefix.toLocaleLowerCase("en-US");

  if (spec.name.toLocaleLowerCase("en-US").startsWith(lowerPrefix)) {
    return 1_000;
  }

  return spec.aliases?.some((alias) => alias.toLocaleLowerCase("en-US").startsWith(lowerPrefix)) === true
    ? 900
    : 0;
}

function sortTextForScore(score: number, label: string): string {
  const inverseScore = Math.max(0, 99_999 - score);

  return `${String(inverseScore).padStart(5, "0")}-${label}`;
}

function compareCompletionItems(left: KmarkCompletionItem, right: KmarkCompletionItem): number {
  const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.label.localeCompare(right.label, "ja-JP");
}

function withOptionalTrailingSpace(value: string, context: KmarkCompletionContext): string {
  return /^\s*(?:\}|-->)/u.test(context.suffixAfterCursor) || context.suffixAfterCursor.startsWith(" ")
    ? value
    : `${value} `;
}

function resolveCompletionSection(
  candidateContexts: readonly KmarkParamContext[],
  activeContexts: readonly KmarkParamContext[],
  fallback: KmarkCompletionSection,
): KmarkCompletionSection {
  if (activeContexts.includes("video") && candidateContexts.includes("video")) {
    return "video";
  }

  if (activeContexts.includes("image") && candidateContexts.includes("image")) {
    return "image";
  }

  if (activeContexts.includes("page") && candidateContexts.includes("page")) {
    return "page";
  }

  if (activeContexts.includes("table") && candidateContexts.includes("table")) {
    return "table";
  }

  if (activeContexts.includes("scope") && candidateContexts.includes("scope")) {
    return "scope";
  }

  if (activeContexts.includes("toc") && candidateContexts.includes("toc")) {
    return "toc";
  }

  if (activeContexts.includes("text") && candidateContexts.includes("text")) {
    return "text";
  }

  return fallback;
}

function detailForSection(section: KmarkCompletionSection): string {
  switch (section) {
    case "image":
      return "kmark image";
    case "video":
      return "kmark video";
    case "page":
      return "kmark page";
    case "scope":
      return "kmark scope";
    case "table":
      return "kmark table";
    case "text":
      return "kmark text";
    case "style":
      return "kmark style";
    case "toc":
      return "kmark toc";
    case "snippet":
      return "kmark snippet";
    case "general":
      return "kmark parameter";
  }
}

function formatDescription(description: string, examples: readonly string[] | undefined): string {
  if (examples === undefined || examples.length === 0) {
    return description;
  }

  return `${description}\n\n${examples.join("\n")}`;
}
