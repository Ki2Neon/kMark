import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import {
  collectKmarkScopeDisplayLines,
  type KmarkScopeLineDisplay,
  type KmarkScopeLineRail,
  type KmarkScopePaletteKey,
  type KmarkScopeRailShape,
} from "../core/collectKmarkScopeDisplayLines";

const SCOPE_GUTTER_WIDTH_PX = 32;
const SCOPE_HOOK_WIDTH_PX = 12;
const SCOPE_RAIL_STEP_PX = 8;
const SCOPE_RAIL_START_X_PX = 8;
const SCOPE_MAX_VISIBLE_DEPTH_INDEX = 2;

const kmarkScopeDisplayPlugin = ViewPlugin.fromClass(class KmarkScopeDisplayPlugin {
  decorations: DecorationSet;
  lineDisplaysByNumber: ReadonlyMap<number, KmarkScopeLineDisplay>;

  constructor(view: EditorView) {
    const displayDocument = collectKmarkScopeDisplayLines(view.state.doc.toString());

    this.lineDisplaysByNumber = createLineDisplayMap(displayDocument.lines);
    this.decorations = buildKmarkScopeBackgroundDecorations(view, displayDocument.lines);
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged) {
      return;
    }

    const displayDocument = collectKmarkScopeDisplayLines(update.state.doc.toString());

    this.lineDisplaysByNumber = createLineDisplayMap(displayDocument.lines);
    this.decorations = buildKmarkScopeBackgroundDecorations(update.view, displayDocument.lines);
  }

  getLineDisplay(lineNumber: number): KmarkScopeLineDisplay | null {
    return this.lineDisplaysByNumber.get(lineNumber) ?? null;
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

const kmarkScopeGutter = gutter({
  class: "kmark-scope-gutter",
  initialSpacer: () => new KmarkScopeGutterMarker([]),
  lineMarker(view, line) {
    const plugin = view.plugin(kmarkScopeDisplayPlugin);

    if (plugin === null) {
      return null;
    }

    const lineDisplay = plugin.getLineDisplay(view.state.doc.lineAt(line.from).number);

    if (lineDisplay === null || lineDisplay.rails.length === 0) {
      return null;
    }

    return new KmarkScopeGutterMarker(lineDisplay.rails);
  },
  lineMarkerChange(update) {
    return update.docChanged;
  },
});

const kmarkScopeDisplayTheme = EditorView.baseTheme({
  "&": {
    "--kmark-scope-bg-cyan": "rgba(125, 211, 252, 0.145)",
    "--kmark-scope-bg-purple": "rgba(167, 139, 250, 0.135)",
    "--kmark-scope-bg-yellow": "rgba(251, 191, 36, 0.13)",
    "--kmark-scope-line-cyan": "rgba(125, 211, 252, 0.98)",
    "--kmark-scope-line-purple": "rgba(167, 139, 250, 0.98)",
    "--kmark-scope-line-yellow": "rgba(251, 191, 36, 0.98)",
    "--kmark-scope-line-glow-cyan": "rgba(125, 211, 252, 0.24)",
    "--kmark-scope-line-glow-purple": "rgba(167, 139, 250, 0.23)",
    "--kmark-scope-line-glow-yellow": "rgba(251, 191, 36, 0.22)",
    "--kmark-scope-rail-w": "1px",
    "--kmark-scope-hook-h": "1px",
    "--kmark-scope-hook-w": "12px",
  },
  ".kmark-scope-gutter": {
    minWidth: `${SCOPE_GUTTER_WIDTH_PX}px`,
    overflow: "hidden",
    width: `${SCOPE_GUTTER_WIDTH_PX}px`,
  },
  ".kmark-scope-gutter .cm-gutterElement": {
    minWidth: `${SCOPE_GUTTER_WIDTH_PX}px`,
    overflow: "hidden",
    padding: "0",
    width: `${SCOPE_GUTTER_WIDTH_PX}px`,
  },
  ".kmark-scope-gutter-cell": {
    height: "100%",
    minHeight: "1.7em",
    overflow: "hidden",
    position: "relative",
    width: `${SCOPE_GUTTER_WIDTH_PX}px`,
  },
  ".kmark-scope-rail": {
    backgroundColor: "var(--kmark-scope-line)",
    bottom: "-1px",
    boxShadow: "0 0 3px var(--kmark-scope-line-glow)",
    left: "var(--kmark-scope-rail-x)",
    pointerEvents: "none",
    position: "absolute",
    top: "-1px",
    width: "var(--kmark-scope-rail-w)",
  },
  ".kmark-scope-rail::before, .kmark-scope-rail::after": {
    backgroundColor: "var(--kmark-scope-line)",
    boxShadow: "0 0 3px var(--kmark-scope-line-glow)",
    content: "\"\"",
    height: "var(--kmark-scope-hook-h)",
    left: "0",
    position: "absolute",
    width: "0",
  },
  ".kmark-scope-rail-start": {
    bottom: "-1px",
    top: "6px",
  },
  ".kmark-scope-rail-end": {
    bottom: "6px",
    top: "-1px",
  },
  ".kmark-scope-rail-single": {
    bottom: "6px",
    top: "6px",
  },
  ".kmark-scope-rail-start::before, .kmark-scope-rail-single::before": {
    top: "0",
    width: "var(--kmark-scope-hook-w-resolved, var(--kmark-scope-hook-w))",
  },
  ".kmark-scope-rail-end::after, .kmark-scope-rail-single::after": {
    bottom: "0",
    width: "var(--kmark-scope-hook-w-resolved, var(--kmark-scope-hook-w))",
  },
  ".kmark-scope-rail-cyan": {
    "--kmark-scope-line": "var(--kmark-scope-line-cyan)",
    "--kmark-scope-line-glow": "var(--kmark-scope-line-glow-cyan)",
  },
  ".kmark-scope-rail-purple": {
    "--kmark-scope-line": "var(--kmark-scope-line-purple)",
    "--kmark-scope-line-glow": "var(--kmark-scope-line-glow-purple)",
  },
  ".kmark-scope-rail-yellow": {
    "--kmark-scope-line": "var(--kmark-scope-line-yellow)",
    "--kmark-scope-line-glow": "var(--kmark-scope-line-glow-yellow)",
  },
  ".cm-line.kmark-scope-bg": {
    backgroundColor: "var(--kmark-scope-bg)",
  },
  ".cm-line.kmark-scope-bg-cyan": {
    "--kmark-scope-bg": "var(--kmark-scope-bg-cyan)",
  },
  ".cm-line.kmark-scope-bg-purple": {
    "--kmark-scope-bg": "var(--kmark-scope-bg-purple)",
  },
  ".cm-line.kmark-scope-bg-yellow": {
    "--kmark-scope-bg": "var(--kmark-scope-bg-yellow)",
  },
  ".cm-line.kmark-scope-bg-start": {
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },
  ".cm-line.kmark-scope-bg-end": {
    borderBottomLeftRadius: "4px",
    borderBottomRightRadius: "4px",
  },
  ".cm-line.kmark-scope-bg-single": {
    borderRadius: "4px",
  },
});

export function createCodeMirrorKmarkScopeDisplayExtension(): Extension {
  return [
    kmarkScopeDisplayPlugin,
    kmarkScopeGutter,
    kmarkScopeDisplayTheme,
  ];
}

class KmarkScopeGutterMarker extends GutterMarker {
  readonly #rails: readonly KmarkScopeLineRail[];
  readonly #signature: string;

  constructor(rails: readonly KmarkScopeLineRail[]) {
    super();
    this.#rails = rails;
    this.#signature = rails.map((rail) => (
      `${rail.id}:${rail.paletteKey}:${rail.depthIndex}:${rail.shape}:${rail.displayName}`
    )).join("|");
  }

  eq(other: GutterMarker): boolean {
    return other instanceof KmarkScopeGutterMarker && other.#signature === this.#signature;
  }

  toDOM(): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "kmark-scope-gutter-cell";
    cell.setAttribute("aria-hidden", "true");

    for (const rail of this.#rails) {
      cell.appendChild(createRailElement(rail));
    }

    return cell;
  }
}

function createLineDisplayMap(lines: readonly KmarkScopeLineDisplay[]): ReadonlyMap<number, KmarkScopeLineDisplay> {
  return new Map(lines.map((line) => [line.lineNumber, line]));
}

function buildKmarkScopeBackgroundDecorations(
  view: EditorView,
  lines: readonly KmarkScopeLineDisplay[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const lineDisplay of lines) {
    if (lineDisplay.background === null || lineDisplay.lineNumber > view.state.doc.lines) {
      continue;
    }

    const line = view.state.doc.line(lineDisplay.lineNumber);
    builder.add(line.from, line.from, Decoration.line({
      class: createBackgroundClassName(lineDisplay.background.paletteKey, lineDisplay.background.shape),
    }));
  }

  return builder.finish();
}

function createBackgroundClassName(
  paletteKey: KmarkScopePaletteKey,
  shape: KmarkScopeRailShape,
): string {
  return `kmark-scope-bg kmark-scope-bg-${paletteKey} kmark-scope-bg-${shape}`;
}

function createRailElement(rail: KmarkScopeLineRail): HTMLElement {
  const element = document.createElement("span");
  const visibleDepthIndex = Math.min(rail.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX);
  const railX = SCOPE_RAIL_START_X_PX + visibleDepthIndex * SCOPE_RAIL_STEP_PX;
  const hookWidth = Math.max(0, Math.min(SCOPE_HOOK_WIDTH_PX, SCOPE_GUTTER_WIDTH_PX - railX));

  element.className = [
    "kmark-scope-rail",
    `kmark-scope-rail-${rail.shape}`,
    `kmark-scope-rail-${rail.paletteKey}`,
  ].join(" ");
  element.style.setProperty("--kmark-scope-rail-x", `${railX}px`);
  element.style.setProperty("--kmark-scope-hook-w-resolved", `${hookWidth}px`);
  element.title = rail.displayName;

  return element;
}
