import { type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import {
  collectKmarkScopeDisplayLines,
  type KmarkScopeLineDisplay,
  type KmarkScopeLineRail,
} from "../core/collectKmarkScopeDisplayLines";

const SCOPE_MAX_GUTTER_WIDTH_PX = 32;
const SCOPE_HOOK_WIDTH_PX = 12;
const SCOPE_RAIL_STEP_PX = 8;
const SCOPE_RAIL_START_X_PX = 8;
const SCOPE_RAIL_WIDTH_PX = 1;
const SCOPE_MAX_VISIBLE_DEPTH_INDEX = 2;

const kmarkScopeDisplayPlugin = ViewPlugin.fromClass(class KmarkScopeDisplayPlugin {
  lineDisplaysByNumber: ReadonlyMap<number, KmarkScopeLineDisplay>;

  constructor(view: EditorView) {
    const displayDocument = collectKmarkScopeDisplayLines(view.state.doc.toString());

    this.lineDisplaysByNumber = createLineDisplayMap(displayDocument.lines);
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged) {
      return;
    }

    const displayDocument = collectKmarkScopeDisplayLines(update.state.doc.toString());

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

    return new KmarkScopeGutterMarker(lineDisplay.rails);
  },
  lineMarkerChange(update) {
    return update.docChanged;
  },
});

const kmarkScopeDisplayTheme = EditorView.baseTheme({
  "&": {
    "--kmark-scope-line-cyan": "hsl(from var(--focus) h s l)",
    "--kmark-scope-line-purple": "hsl(from var(--focus) calc(h + 30) s l)",
    "--kmark-scope-line-yellow": "hsl(from var(--focus) calc(h + 60) s l)",
    "--kmark-scope-line-emerald": "hsl(from var(--focus) calc(h + 90) s l)",
    "--kmark-scope-line-rose": "hsl(from var(--focus) calc(h + 120) s l)",
    "--kmark-scope-line-indigo": "hsl(from var(--focus) calc(h + 150) s l)",
    "--kmark-scope-line-orange": "hsl(from var(--focus) calc(h + 180) s l)",
    "--kmark-scope-line-teal": "hsl(from var(--focus) calc(h + 210) s l)",
    "--kmark-scope-line-lime": "hsl(from var(--focus) calc(h + 240) s l)",
    "--kmark-scope-line-fuchsia": "hsl(from var(--focus) calc(h + 270) s l)",
    "--kmark-scope-line-blue": "hsl(from var(--focus) calc(h + 300) s l)",
    "--kmark-scope-line-red": "hsl(from var(--focus) calc(h + 330) s l)",
    "--kmark-scope-rail-w": "1px",
    "--kmark-scope-hook-h": "1px",
    "--kmark-scope-hook-w": "12px",
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
    borderRadius: "999px",
    left: "var(--kmark-scope-rail-x)",
    pointerEvents: "none",
    position: "absolute",
    top: "-1px",
    width: "var(--kmark-scope-rail-w)",
  },
  ".kmark-scope-rail::before, .kmark-scope-rail::after": {
    backgroundColor: "currentColor",
    borderRadius: "999px",
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
    color: "var(--kmark-scope-line-cyan)",
  },
  ".kmark-scope-rail-purple": {
    color: "var(--kmark-scope-line-purple)",
  },
  ".kmark-scope-rail-yellow": {
    color: "var(--kmark-scope-line-yellow)",
  },
  ".kmark-scope-rail-emerald": {
    color: "var(--kmark-scope-line-emerald)",
  },
  ".kmark-scope-rail-rose": {
    color: "var(--kmark-scope-line-rose)",
  },
  ".kmark-scope-rail-indigo": {
    color: "var(--kmark-scope-line-indigo)",
  },
  ".kmark-scope-rail-orange": {
    color: "var(--kmark-scope-line-orange)",
  },
  ".kmark-scope-rail-teal": {
    color: "var(--kmark-scope-line-teal)",
  },
  ".kmark-scope-rail-lime": {
    color: "var(--kmark-scope-line-lime)",
  },
  ".kmark-scope-rail-fuchsia": {
    color: "var(--kmark-scope-line-fuchsia)",
  },
  ".kmark-scope-rail-blue": {
    color: "var(--kmark-scope-line-blue)",
  },
  ".kmark-scope-rail-red": {
    color: "var(--kmark-scope-line-red)",
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
    const cellWidth = resolveGutterCellWidth(this.#rails);

    cell.className = "kmark-scope-gutter-cell";
    cell.setAttribute("aria-hidden", "true");
    cell.style.minWidth = `${cellWidth}px`;
    cell.style.width = `${cellWidth}px`;

    for (const rail of this.#rails) {
      cell.appendChild(createRailElement(rail));
    }

    return cell;
  }
}

function createLineDisplayMap(lines: readonly KmarkScopeLineDisplay[]): ReadonlyMap<number, KmarkScopeLineDisplay> {
  return new Map(lines.map((line) => [line.lineNumber, line]));
}

function createRailElement(rail: KmarkScopeLineRail): HTMLElement {
  const element = document.createElement("span");
  const visibleDepthIndex = Math.min(rail.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX);
  const railX = SCOPE_RAIL_START_X_PX + visibleDepthIndex * SCOPE_RAIL_STEP_PX;
  const hookWidth = Math.max(0, Math.min(SCOPE_HOOK_WIDTH_PX, SCOPE_MAX_GUTTER_WIDTH_PX - railX));

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

function resolveGutterCellWidth(rails: readonly KmarkScopeLineRail[]): number {
  const deepestVisibleDepthIndex = rails.reduce((currentDepthIndex, rail) => (
    Math.max(currentDepthIndex, Math.min(rail.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX))
  ), 0);
  const rawWidth = SCOPE_RAIL_START_X_PX
    + deepestVisibleDepthIndex * SCOPE_RAIL_STEP_PX
    + SCOPE_HOOK_WIDTH_PX
    + SCOPE_RAIL_WIDTH_PX;

  return Math.min(SCOPE_MAX_GUTTER_WIDTH_PX, rawWidth);
}
