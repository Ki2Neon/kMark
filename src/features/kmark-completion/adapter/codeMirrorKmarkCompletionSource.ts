import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { createKmarkSuggestions } from "../core/createKmarkSuggestions";
import { type KmarkCompletionItem } from "../core/types";

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
    sortText: item.sortText,
    type: toCodeMirrorCompletionType(item.kind),
  };

  if (item.snippet === true) {
    return snippetCompletion(item.insertText, completion);
  }

  return {
    ...completion,
    apply: item.insertText,
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
