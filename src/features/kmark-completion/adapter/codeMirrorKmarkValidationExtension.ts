import { RangeSetBuilder, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { validateKmarkDocument } from "../core/validateKmarkDirective";

const kmarkValidationDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildKmarkValidationDecorations(state.doc.toString());
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return buildKmarkValidationDecorations(transaction.state.doc.toString());
    }

    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const kmarkValidationTheme = EditorView.baseTheme({
  ".cm-kmarkValidationWarning": {
    textDecorationColor: "var(--danger)",
    textDecorationLine: "underline",
    textDecorationSkipInk: "none",
    textDecorationStyle: "wavy",
    textUnderlineOffset: "0.18em",
  },
});

export function createCodeMirrorKmarkValidationExtension(): Extension {
  return [
    kmarkValidationDecorationField,
    kmarkValidationTheme,
  ];
}

function buildKmarkValidationDecorations(markdown: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const warnings = [...validateKmarkDocument(markdown)].sort((left, right) => (
    left.range.start - right.range.start || left.range.end - right.range.end
  ));

  for (const warning of warnings) {
    const from = clampOffset(warning.range.start, markdown.length);
    const to = clampOffset(Math.max(warning.range.end, from + 1), markdown.length);

    if (from >= to) {
      continue;
    }

    builder.add(from, to, Decoration.mark({
      attributes: {
        "aria-label": warning.message,
        title: warning.message,
      },
      class: "cm-kmarkValidationWarning",
    }));
  }

  return builder.finish();
}

function clampOffset(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}
