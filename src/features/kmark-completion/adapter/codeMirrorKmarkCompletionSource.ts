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
import { createKmarkSuggestions } from "../core/createKmarkSuggestions";
import { type KmarkCompletionItem, type KmarkCompletionSection } from "../core/types";

const CODE_MIRROR_COMPLETION_SECTIONS: Record<KmarkCompletionSection, CompletionSection> = {
  image: { name: "Image", rank: 10 },
  page: { name: "Page", rank: 20 },
  scope: { name: "Scope", rank: 30 },
  text: { name: "Text", rank: 40 },
  toc: { name: "TOC", rank: 50 },
  style: { name: "Style", rank: 60 },
  snippet: { name: "Snippet", rank: 70 },
  general: { name: "General", rank: 80 },
};

export function createCodeMirrorKmarkCompletionSource(): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const result = createKmarkSuggestions({
      markdown: context.state.doc.toString(),
      cursorOffset: context.pos,
    });

    if (!result.context.active || result.items.length === 0) {
      return null;
    }

    return {
      from: result.context.replaceRange.start,
      options: result.items.map(toCodeMirrorCompletion),
      to: result.context.replaceRange.end,
      validFor: /^[#%.\-\w]*$/u,
    };
  };
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
    apply: item.kind === "parameter" ? applyParameterCompletion(item) : item.insertText,
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

function toCodeMirrorCompletionType(kind: KmarkCompletionItem["kind"]): Completion["type"] {
  switch (kind) {
    case "parameter":
      return "property";
    case "value":
    case "style":
      return "constant";
    case "snippet":
      return "keyword";
  }
}
