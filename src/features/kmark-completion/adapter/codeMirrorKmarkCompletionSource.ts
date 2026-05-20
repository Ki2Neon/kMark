import {
  insertCompletionText,
  snippetCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { createKmarkSuggestions, isKmarkFontFamilyParamName, isKmarkPathParamName } from "../core/createKmarkSuggestions";
import { type KmarkCompletionItem, type KmarkCompletionSection, type KmarkPathCompletionEntry } from "../core/types";
import { loadLocalFontFamilies } from "./localFontFamilies";

const CODE_MIRROR_COMPLETION_SECTIONS: Record<KmarkCompletionSection, CompletionSection> = {
  image: { name: "Image", rank: 10 },
  video: { name: "Video", rank: 15 },
  model: { name: "Model", rank: 18 },
  page: { name: "Page", rank: 20 },
  scope: { name: "Scope", rank: 30 },
  table: { name: "Table", rank: 40 },
  text: { name: "Text", rank: 50 },
  toc: { name: "TOC", rank: 60 },
  style: { name: "Style", rank: 70 },
  snippet: { name: "Snippet", rank: 80 },
  general: { name: "General", rank: 90 },
};

export type KmarkPathCompletionFilter =
  | { readonly kind: "all" }
  | { readonly kind: "extensions"; readonly extensions: readonly string[] };

export type KmarkPathCompletionRequest = {
  readonly filter: KmarkPathCompletionFilter;
  readonly input: string;
  readonly markdownFilePath: string;
};

export type KmarkPathCompletionProvider = (
  request: KmarkPathCompletionRequest,
) => Promise<readonly KmarkPathCompletionEntry[]>;

export type CodeMirrorKmarkCompletionSourceOptions = {
  readonly markdownFilePath?: string | null;
  readonly pathCompletionProvider?: KmarkPathCompletionProvider;
};

const IMAGE_PATH_COMPLETION_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] as const;

export function createCodeMirrorKmarkCompletionSource(
  options: CodeMirrorKmarkCompletionSourceOptions = {},
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const input = {
      markdown: context.state.doc.toString(),
      cursorOffset: context.pos,
    };
    const firstResult = createKmarkSuggestions(input);
    const currentParamName = firstResult.context.mode === "parameter-value"
      ? firstResult.context.currentParamName
      : undefined;

    const fontFamilies = currentParamName !== undefined
      && isKmarkFontFamilyParamName(currentParamName)
      ? await loadLocalFontFamilies()
      : [];
    const pathCompletions = currentParamName !== undefined
      && isKmarkPathParamName(currentParamName)
      && options.markdownFilePath !== null
      && options.markdownFilePath !== undefined
      && options.pathCompletionProvider !== undefined
      ? await options.pathCompletionProvider({
        filter: pathCompletionFilterForParam(currentParamName),
        input: firstResult.context.currentValuePrefix ?? "",
        markdownFilePath: options.markdownFilePath,
      })
      : [];
    const resolvedResult = fontFamilies.length > 0 || pathCompletions.length > 0
      ? createKmarkSuggestions({ ...input, fontFamilies, pathCompletions })
      : firstResult;

    if (!resolvedResult.context.active || resolvedResult.items.length === 0) {
      return null;
    }

    return {
      from: resolvedResult.context.replaceRange.start,
      options: resolvedResult.items.map(toCodeMirrorCompletion),
      to: resolvedResult.context.replaceRange.end,
      validFor: validForKmarkCompletion(resolvedResult.context.currentParamName),
    };
  };
}

function pathCompletionFilterForParam(paramName: string): KmarkPathCompletionFilter {
  if (paramName === "video_poster" || paramName === "3d_poster") {
    return {
      kind: "extensions",
      extensions: IMAGE_PATH_COMPLETION_EXTENSIONS,
    };
  }

  return { kind: "all" };
}

function validForKmarkCompletion(currentParamName: string | undefined): RegExp {
  if (currentParamName !== undefined && isKmarkFontFamilyParamName(currentParamName)) {
    return /^[#%.,\-\w\s"'\u3000-\u30ff\u3400-\u9fff]*$/u;
  }

  if (currentParamName !== undefined && isKmarkPathParamName(currentParamName)) {
    return /^[^\n]*$/u;
  }

  return /^[#%.\-\w]*$/u;
}

function toCodeMirrorCompletion(item: KmarkCompletionItem): Completion {
  const completion = {
    detail: item.detail,
    info: item.description,
    label: item.label,
    section: item.section === undefined ? undefined : CODE_MIRROR_COMPLETION_SECTIONS[item.section],
    sortText: item.sortText,
    type: toCodeMirrorCompletionType(item.kind),
  };

  if (item.snippet === true) {
    return snippetCompletion(item.insertText, completion);
  }

  return {
    ...completion,
    apply: item.kind === "parameter"
      ? applyParameterCompletion(item)
      : item.kind === "path"
        ? applyPathCompletion(item)
        : item.insertText,
  };
}

function applyParameterCompletion(item: KmarkCompletionItem): Completion["apply"] {
  return (view, _completion, from, to) => {
    view.dispatch(insertCompletionText(view.state, item.insertText, from, to));

    window.setTimeout(() => {
      startCompletion(view);
    }, 0);
  };
}

function applyPathCompletion(item: KmarkCompletionItem): Completion["apply"] {
  return (view, _completion, from, to) => {
    view.dispatch(insertCompletionText(view.state, item.insertText, from, to));

    if (item.pathEntryKind !== "directory") {
      return;
    }

    window.setTimeout(() => {
      startCompletion(view);
    }, 0);
  };
}

function toCodeMirrorCompletionType(kind: KmarkCompletionItem["kind"]): Completion["type"] {
  switch (kind) {
    case "parameter":
      return "property";
    case "value":
    case "style":
    case "path":
      return "constant";
    case "snippet":
      return "keyword";
  }
}
