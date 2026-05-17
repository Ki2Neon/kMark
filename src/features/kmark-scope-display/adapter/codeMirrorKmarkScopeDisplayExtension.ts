import { type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import {
  collectKmarkScopeDisplayLines,
  type KmarkScopeLineDisplay,
  type KmarkScopeLineRail,
} from "../core/collectKmarkScopeDisplayLines";

const SCOPE_MAX_GUTTER_WIDTH_PX = 68;
const SCOPE_GUTTER_RIGHT_PADDING_PX = 3;
const SCOPE_RAIL_STEP_PX = 4;
const SCOPE_RAIL_START_X_PX = 3;
const SCOPE_RAIL_WIDTH_PX = 2;
const SCOPE_MAX_VISIBLE_DEPTH_INDEX = 15;

const kmarkScopeDisplayPlugin = ViewPlugin.fromClass(class KmarkScopeDisplayPlugin {
  gutterWidth: number;
  lineDisplaysByNumber: ReadonlyMap<number, KmarkScopeLineDisplay>;

  constructor(view: EditorView) {
    const displayDocument = collectKmarkScopeDisplayLines(view.state.doc.toString());

    this.gutterWidth = resolveDocumentGutterWidth(displayDocument.lines);
    this.lineDisplaysByNumber = createLineDisplayMap(displayDocument.lines);
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged) {
      return;
    }

    const displayDocument = collectKmarkScopeDisplayLines(update.state.doc.toString());

    this.gutterWidth = resolveDocumentGutterWidth(displayDocument.lines);
    this.lineDisplaysByNumber = createLineDisplayMap(displayDocument.lines);
  }

  getLineDisplay(lineNumber: number): KmarkScopeLineDisplay | null {
    return this.lineDisplaysByNumber.get(lineNumber) ?? null;
  }
});

const kmarkScopeGutter = gutter({
  class: "kmark-scope-gutter",
  lineMarker(view, line) {
    const plugin = view.plugin(kmarkScopeDisplayPlugin);

    if (plugin === null) {
      return null;
    }

    const lineDisplay = plugin.getLineDisplay(view.state.doc.lineAt(line.from).number);

    if (lineDisplay === null || lineDisplay.rails.length === 0) {
      return null;
    }

    return new KmarkScopeGutterMarker(lineDisplay.rails, plugin.gutterWidth);
  },
  lineMarkerChange(update) {
    return update.docChanged;
  },
});

const kmarkScopeDisplayTheme = EditorView.baseTheme({
  "&": {
    "--kmark-scope-line-tone-0": "hsl(from var(--focus) h s l)",
    "--kmark-scope-line-tone-1": "hsl(from var(--focus) calc(h + 180) s l)",
    "--kmark-scope-line-tone-2": "hsl(from var(--focus) calc(h + 90) s l)",
    "--kmark-scope-line-tone-3": "hsl(from var(--focus) calc(h + 270) s l)",
    "--kmark-scope-line-tone-4": "hsl(from var(--focus) calc(h + 45) s l)",
    "--kmark-scope-line-tone-5": "hsl(from var(--focus) calc(h + 225) s l)",
    "--kmark-scope-line-tone-6": "hsl(from var(--focus) calc(h + 135) s l)",
    "--kmark-scope-line-tone-7": "hsl(from var(--focus) calc(h + 315) s l)",
    "--kmark-scope-line-tone-8": "hsl(from var(--focus) calc(h + 30) s l)",
    "--kmark-scope-line-tone-9": "hsl(from var(--focus) calc(h + 210) s l)",
    "--kmark-scope-line-tone-10": "hsl(from var(--focus) calc(h + 120) s l)",
    "--kmark-scope-line-tone-11": "hsl(from var(--focus) calc(h + 300) s l)",
    "--kmark-scope-line-tone-12": "hsl(from var(--focus) calc(h + 60) s l)",
    "--kmark-scope-line-tone-13": "hsl(from var(--focus) calc(h + 240) s l)",
    "--kmark-scope-line-tone-14": "hsl(from var(--focus) calc(h + 150) s l)",
    "--kmark-scope-line-tone-15": "hsl(from var(--focus) calc(h + 330) s l)",
    "--kmark-scope-rail-w": "2px",
  },
  ".kmark-scope-gutter": {
    background: "transparent",
    borderRight: "0",
    minWidth: "0",
    overflow: "hidden",
    width: "auto",
  },
  ".kmark-scope-gutter .cm-gutterElement": {
    minWidth: "0",
    overflow: "hidden",
    padding: "0",
    width: "auto",
  },
  ".kmark-scope-gutter-cell": {
    background:
      "linear-gradient(90deg, rgba(255, 255, 255, 0.025), transparent 62%), color-mix(in srgb, var(--surface-muted) 34%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--border) 74%, transparent)",
    height: "100%",
    minHeight: "1.7em",
    overflow: "hidden",
    position: "relative",
  },
  ".kmark-scope-rail": {
    backgroundColor: "currentColor",
    bottom: "-1px",
    left: "var(--kmark-scope-rail-x)",
    pointerEvents: "none",
    position: "absolute",
    top: "-1px",
    width: "var(--kmark-scope-rail-w)",
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
  ".kmark-scope-rail-tone-0": {
    color: "var(--kmark-scope-line-tone-0)",
  },
  ".kmark-scope-rail-tone-1": {
    color: "var(--kmark-scope-line-tone-1)",
  },
  ".kmark-scope-rail-tone-2": {
    color: "var(--kmark-scope-line-tone-2)",
  },
  ".kmark-scope-rail-tone-3": {
    color: "var(--kmark-scope-line-tone-3)",
  },
  ".kmark-scope-rail-tone-4": {
    color: "var(--kmark-scope-line-tone-4)",
  },
  ".kmark-scope-rail-tone-5": {
    color: "var(--kmark-scope-line-tone-5)",
  },
  ".kmark-scope-rail-tone-6": {
    color: "var(--kmark-scope-line-tone-6)",
  },
  ".kmark-scope-rail-tone-7": {
    color: "var(--kmark-scope-line-tone-7)",
  },
  ".kmark-scope-rail-tone-8": {
    color: "var(--kmark-scope-line-tone-8)",
  },
  ".kmark-scope-rail-tone-9": {
    color: "var(--kmark-scope-line-tone-9)",
  },
  ".kmark-scope-rail-tone-10": {
    color: "var(--kmark-scope-line-tone-10)",
  },
  ".kmark-scope-rail-tone-11": {
    color: "var(--kmark-scope-line-tone-11)",
  },
  ".kmark-scope-rail-tone-12": {
    color: "var(--kmark-scope-line-tone-12)",
  },
  ".kmark-scope-rail-tone-13": {
    color: "var(--kmark-scope-line-tone-13)",
  },
  ".kmark-scope-rail-tone-14": {
    color: "var(--kmark-scope-line-tone-14)",
  },
  ".kmark-scope-rail-tone-15": {
    color: "var(--kmark-scope-line-tone-15)",
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
  readonly #gutterWidth: number;
  readonly #rails: readonly KmarkScopeLineRail[];
  readonly #signature: string;

  constructor(rails: readonly KmarkScopeLineRail[], gutterWidth: number) {
    super();
    this.#gutterWidth = gutterWidth;
    this.#rails = rails;
    this.#signature = rails.map((rail) => (
      `${rail.id}:${rail.paletteKey}:${rail.depthIndex}:${rail.shape}:${rail.displayName}`
    )).join("|") + `:${gutterWidth}`;
  }

  eq(other: GutterMarker): boolean {
    return other instanceof KmarkScopeGutterMarker && other.#signature === this.#signature;
  }

  toDOM(): HTMLElement {
    const cell = document.createElement("div");

    cell.className = "kmark-scope-gutter-cell";
    cell.setAttribute("aria-hidden", "true");
    cell.style.minWidth = `${this.#gutterWidth}px`;
    cell.style.width = `${this.#gutterWidth}px`;

    for (const rail of this.#rails) {
      cell.appendChild(createRailElement(rail));
    }

    return cell;
  }
}

function createLineDisplayMap(lines: readonly KmarkScopeLineDisplay[]): ReadonlyMap<number, KmarkScopeLineDisplay> {
  return new Map(lines.map((line) => [line.lineNumber, line]));
}

function resolveDocumentGutterWidth(lines: readonly KmarkScopeLineDisplay[]): number {
  let maximumVisibleDepthIndex = -1;

  for (const line of lines) {
    for (const rail of line.rails) {
      maximumVisibleDepthIndex = Math.max(
        maximumVisibleDepthIndex,
        Math.min(rail.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX),
      );
    }
  }

  if (maximumVisibleDepthIndex < 0) {
    return 0;
  }

  const rawWidth = SCOPE_RAIL_START_X_PX
    + maximumVisibleDepthIndex * SCOPE_RAIL_STEP_PX
    + SCOPE_RAIL_WIDTH_PX
    + SCOPE_GUTTER_RIGHT_PADDING_PX;

  return Math.min(SCOPE_MAX_GUTTER_WIDTH_PX, rawWidth);
}

function createRailElement(rail: KmarkScopeLineRail): HTMLElement {
  const element = document.createElement("span");
  const visibleDepthIndex = Math.min(rail.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX);
  const railX = SCOPE_RAIL_START_X_PX + visibleDepthIndex * SCOPE_RAIL_STEP_PX;

  element.className = [
    "kmark-scope-rail",
    `kmark-scope-rail-${rail.shape}`,
    `kmark-scope-rail-${rail.paletteKey}`,
  ].join(" ");
  element.style.setProperty("--kmark-scope-rail-x", `${railX}px`);
  element.title = rail.displayName;

  return element;
}
