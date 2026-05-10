import { KMARK_PARAM_SPECS } from "../schema/kmarkParamSpecs";
import { KMARK_SNIPPET_SPECS } from "../schema/kmarkSnippetSpecs";
import {
  KMARK_BOOLEAN_VALUE_PRESETS,
  KMARK_COLOR_VALUE_PRESETS,
  KMARK_LENGTH_VALUE_PRESETS,
  KMARK_PAGE_LENGTH_VALUE_PRESETS,
} from "../schema/kmarkValuePresets";
import { collectKmarkDefinitions } from "./collectKmarkDefinitions";
import { detectKmarkCompletionContext } from "./detectKmarkCompletionContext";
import {
  type KmarkCompletionContext,
  type KmarkCompletionItem,
  type KmarkCompletionResult,
  type KmarkParamContext,
  type KmarkParamSpec,
} from "./types";

export function createKmarkSuggestions(input: {
  readonly markdown: string;
  readonly cursorOffset: number;
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
      items: createValueSuggestions(context),
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
    .filter((spec) => !context.usedParamNames.has(spec.name) || spec.allowMultiple === true)
    .filter((spec) => matchesParamPrefix(spec, paramPrefix))
    .map((spec) => ({
      label: spec.name,
      insertText: spec.insertText ?? `${spec.name}:`,
      description: formatDescription(spec.description, spec.examples),
      detail: "kmark parameter",
      kind: "parameter",
      priority: scoreParamSpec(spec, context, paramPrefix),
      sortText: sortTextForSpec(spec, context, paramPrefix),
    }));
}

function createValueSuggestions(context: KmarkCompletionContext): readonly KmarkCompletionItem[] {
  const paramName = context.currentParamName ?? "";
  const spec = findParamSpec(paramName);

  if (spec === null) {
    return [];
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
      priority: (spec.priority ?? 0) - index,
      sortText: `${String(index).padStart(3, "0")}-${value}`,
    }));
}

function createSnippetSuggestions(context: KmarkCompletionContext): readonly KmarkCompletionItem[] {
  const prefix = (context.paramPrefix ?? "").toLocaleLowerCase("en-US");

  return KMARK_SNIPPET_SPECS
    .filter((snippet) => matchesAnyContext(snippet.contexts, context.contexts))
    .filter((snippet) => matchesSnippetPrefix(snippet, prefix))
    .map((snippet) => ({
      label: snippet.label,
      insertText: snippet.insertText,
      description: formatDescription(snippet.description, snippet.examples),
      detail: "kmark snippet",
      kind: "snippet",
      snippet: true,
      priority: scoreSnippetSpec(snippet.contexts, context, snippet.priority ?? 0, prefix),
      sortText: `snippet-${snippet.label}`,
    }));
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
      priority: 100 - index,
      sortText: `${String(index).padStart(3, "0")}-${name}`,
    }));
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
  const imageBoost = context.contexts.includes("image") && spec.contexts.includes("image") ? 60 : 0;
  const pageBoost = context.contexts.includes("page") && spec.contexts.includes("page") ? 40 : 0;
  const scopeBoost = context.contexts.includes("scope") && spec.contexts.includes("scope") ? 20 : 0;
  const prefixBoost = prefix.length > 0 && spec.name.toLocaleLowerCase("en-US").startsWith(prefix) ? 80 : 0;

  return (spec.priority ?? 0) + imageBoost + pageBoost + scopeBoost + prefixBoost;
}

function scoreSnippetSpec(
  snippetContexts: readonly KmarkParamContext[],
  context: KmarkCompletionContext,
  basePriority: number,
  prefix: string,
): number {
  const imageBoost = context.contexts.includes("image") && snippetContexts.includes("image") ? 50 : 0;
  const pageBoost = context.contexts.includes("page") && snippetContexts.includes("page") ? 30 : 0;
  const prefixBoost = prefix.length > 0 ? 70 : 0;

  return basePriority + imageBoost + pageBoost + prefixBoost - 10;
}

function sortTextForSpec(spec: KmarkParamSpec, context: KmarkCompletionContext, prefix: string): string {
  const score = scoreParamSpec(spec, context, prefix);

  return `${String(999 - score).padStart(3, "0")}-${spec.name}`;
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

function formatDescription(description: string, examples: readonly string[] | undefined): string {
  if (examples === undefined || examples.length === 0) {
    return description;
  }

  return `${description}\n\n${examples.join("\n")}`;
}
