import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { validateKmarkDocument } from "../core/validateKmarkDirective";

const setKmarkValidationDecorations = StateEffect.define<DecorationSet>();

const kmarkValidationDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setKmarkValidationDecorations)) {
        next = effect.value;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const kmarkValidationAnalysisPlugin = ViewPlugin.fromClass(class {
  #timer: number | null = null;
  #revision = 0;

  constructor(view: EditorView) {
    this.#schedule(view, 0);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.#schedule(update.view, 250);
    }
  }

  destroy(): void {
    if (this.#timer !== null) {
      window.clearTimeout(this.#timer);
    }
  }

  #schedule(view: EditorView, delayMs: number): void {
    this.#revision += 1;
    const revision = this.#revision;
    if (this.#timer !== null) {
      window.clearTimeout(this.#timer);
    }
    this.#timer = window.setTimeout(() => {
      this.#timer = null;
      const decorations = buildKmarkValidationDecorations(view.state.doc.toString());
      if (revision === this.#revision) {
        view.dispatch({ effects: setKmarkValidationDecorations.of(decorations) });
      }
    }, delayMs);
  }
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
    kmarkValidationAnalysisPlugin,
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
