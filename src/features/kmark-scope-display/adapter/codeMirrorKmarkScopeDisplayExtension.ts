import { type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import {
  collectKmarkScopeDisplayLines,
  type KmarkScopeDisplayDocument,
  type KmarkScopeDisplayScope,
} from "../core/collectKmarkScopeDisplayLines";

const SCOPE_MAX_GUTTER_WIDTH_PX = 68;
const SCOPE_GUTTER_RIGHT_PADDING_PX = 3;
const SCOPE_RAIL_STEP_PX = 4;
const SCOPE_RAIL_START_X_PX = 3;
const SCOPE_RAIL_WIDTH_PX = 8;
const SCOPE_MAX_VISIBLE_DEPTH_INDEX = 15;
const SCOPE_BAR_EDGE_INSET_PX = 6;
const SCOPE_BAR_MIN_HEIGHT_PX = 2;

type KmarkScopeBarMeasure = {
  readonly className: string;
  readonly displayName: string;
  readonly height: number;
  readonly id: number;
  readonly left: number;
  readonly top: number;
};

type KmarkScopeOverlayMeasure = {
  readonly bars: readonly KmarkScopeBarMeasure[];
  readonly contentHeight: number;
  readonly gutter: HTMLElement | null;
  readonly gutterWidth: number;
};

const kmarkScopeDisplayPlugin = ViewPlugin.fromClass(class KmarkScopeDisplayPlugin {
  displayDocument: KmarkScopeDisplayDocument;
  gutterWidth: number;

  constructor(view: EditorView) {
    this.displayDocument = collectKmarkScopeDisplayLines(view.state.doc.toString());
    this.gutterWidth = resolveDocumentGutterWidth(this.displayDocument.scopes);
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged) {
      return;
    }

    this.displayDocument = collectKmarkScopeDisplayLines(update.state.doc.toString());
    this.gutterWidth = resolveDocumentGutterWidth(this.displayDocument.scopes);
  }
});

const kmarkScopeOverlayPlugin = ViewPlugin.fromClass(class KmarkScopeOverlayPlugin {
  readonly overlayElement: HTMLElement;
  readonly measureRequest = {
    key: this,
    read: (view: EditorView): KmarkScopeOverlayMeasure => measureKmarkScopeOverlay(view),
    write: (measure: KmarkScopeOverlayMeasure): void => {
      this.render(measure);
    },
  };

  constructor(view: EditorView) {
    this.overlayElement = document.createElement("div");
    this.overlayElement.className = "kmark-scope-overlay";
    this.overlayElement.setAttribute("aria-hidden", "true");
    view.requestMeasure(this.measureRequest);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.geometryChanged || update.viewportChanged) {
      update.view.requestMeasure(this.measureRequest);
    }
  }

  destroy(): void {
    this.overlayElement.remove();
  }

  render(measure: KmarkScopeOverlayMeasure): void {
    if (measure.gutter === null || measure.gutterWidth <= 0 || measure.bars.length === 0) {
      this.overlayElement.remove();
      this.overlayElement.replaceChildren();
      return;
    }

    if (this.overlayElement.parentElement !== measure.gutter) {
      measure.gutter.appendChild(this.overlayElement);
    }

    this.overlayElement.style.height = `${measure.contentHeight}px`;
    this.overlayElement.style.width = `${measure.gutterWidth}px`;
    this.overlayElement.replaceChildren(...measure.bars.map(createScopeBarElement));
  }
});

const kmarkScopeGutter = gutter({
  class: "kmark-scope-gutter",
  initialSpacer(view) {
    const plugin = view.plugin(kmarkScopeDisplayPlugin);

    return new KmarkScopeGutterSpacer(plugin?.gutterWidth ?? 0);
  },
  updateSpacer(spacer, update) {
    const plugin = update.view.plugin(kmarkScopeDisplayPlugin);
    const gutterWidth = plugin?.gutterWidth ?? 0;

    if (spacer instanceof KmarkScopeGutterSpacer && spacer.matchesWidth(gutterWidth)) {
      return spacer;
    }

    return new KmarkScopeGutterSpacer(gutterWidth);
  },
});

const kmarkScopeDisplayTheme = EditorView.baseTheme({
  "&": {
    "--kmark-scope-line-tone-0": "oklch(70% 0.22 245)",
    "--kmark-scope-line-tone-1": "oklch(72% 0.23 38)",
    "--kmark-scope-line-tone-2": "oklch(72% 0.20 205)",
    "--kmark-scope-line-tone-3": "oklch(70% 0.23 355)",
    "--kmark-scope-line-tone-4": "oklch(69% 0.21 275)",
    "--kmark-scope-line-tone-5": "oklch(78% 0.20 78)",
    "--kmark-scope-line-tone-6": "oklch(71% 0.19 185)",
    "--kmark-scope-line-tone-7": "oklch(71% 0.23 22)",
    "--kmark-scope-line-tone-8": "oklch(71% 0.21 225)",
    "--kmark-scope-line-tone-9": "oklch(75% 0.22 55)",
    "--kmark-scope-line-tone-10": "oklch(68% 0.20 260)",
    "--kmark-scope-line-tone-11": "oklch(71% 0.22 340)",
    "--kmark-scope-line-tone-12": "oklch(73% 0.18 195)",
    "--kmark-scope-line-tone-13": "oklch(74% 0.23 32)",
    "--kmark-scope-line-tone-14": "oklch(70% 0.20 235)",
    "--kmark-scope-line-tone-15": "oklch(77% 0.19 88)",
  },
  ".kmark-scope-gutter": {
    background: "transparent",
    borderRight: "0",
    minWidth: "0",
    overflow: "hidden",
    position: "relative",
    width: "auto",
  },
  ".kmark-scope-gutter .cm-gutterElement": {
    minWidth: "0",
    overflow: "hidden",
    padding: "0",
    width: "auto",
  },
  ".kmark-scope-overlay": {
    left: "0",
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    top: "0",
    zIndex: "1",
  },
  ".kmark-scope-bar": {
    backgroundColor: "currentColor",
    borderRadius: "2px",
    pointerEvents: "none",
    position: "absolute",
    width: `${SCOPE_RAIL_WIDTH_PX}px`,
  },
  ".kmark-scope-gutter-spacer": {
    display: "block",
    height: "1px",
    overflow: "hidden",
  },
  ".kmark-scope-bar-tone-0": {
    color: "var(--kmark-scope-line-tone-0)",
  },
  ".kmark-scope-bar-tone-1": {
    color: "var(--kmark-scope-line-tone-1)",
  },
  ".kmark-scope-bar-tone-2": {
    color: "var(--kmark-scope-line-tone-2)",
  },
  ".kmark-scope-bar-tone-3": {
    color: "var(--kmark-scope-line-tone-3)",
  },
  ".kmark-scope-bar-tone-4": {
    color: "var(--kmark-scope-line-tone-4)",
  },
  ".kmark-scope-bar-tone-5": {
    color: "var(--kmark-scope-line-tone-5)",
  },
  ".kmark-scope-bar-tone-6": {
    color: "var(--kmark-scope-line-tone-6)",
  },
  ".kmark-scope-bar-tone-7": {
    color: "var(--kmark-scope-line-tone-7)",
  },
  ".kmark-scope-bar-tone-8": {
    color: "var(--kmark-scope-line-tone-8)",
  },
  ".kmark-scope-bar-tone-9": {
    color: "var(--kmark-scope-line-tone-9)",
  },
  ".kmark-scope-bar-tone-10": {
    color: "var(--kmark-scope-line-tone-10)",
  },
  ".kmark-scope-bar-tone-11": {
    color: "var(--kmark-scope-line-tone-11)",
  },
  ".kmark-scope-bar-tone-12": {
    color: "var(--kmark-scope-line-tone-12)",
  },
  ".kmark-scope-bar-tone-13": {
    color: "var(--kmark-scope-line-tone-13)",
  },
  ".kmark-scope-bar-tone-14": {
    color: "var(--kmark-scope-line-tone-14)",
  },
  ".kmark-scope-bar-tone-15": {
    color: "var(--kmark-scope-line-tone-15)",
  },
});

export function createCodeMirrorKmarkScopeDisplayExtension(): Extension {
  return [
    kmarkScopeDisplayPlugin,
    kmarkScopeGutter,
    kmarkScopeOverlayPlugin,
    kmarkScopeDisplayTheme,
  ];
}

class KmarkScopeGutterSpacer extends GutterMarker {
  readonly #gutterWidth: number;

  constructor(gutterWidth: number) {
    super();
    this.#gutterWidth = gutterWidth;
  }

  eq(other: GutterMarker): boolean {
    return other instanceof KmarkScopeGutterSpacer && other.#gutterWidth === this.#gutterWidth;
  }

  matchesWidth(gutterWidth: number): boolean {
    return this.#gutterWidth === gutterWidth;
  }

  toDOM(): HTMLElement {
    const spacer = document.createElement("div");

    spacer.className = "kmark-scope-gutter-spacer";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.minWidth = `${this.#gutterWidth}px`;
    spacer.style.width = `${this.#gutterWidth}px`;

    return spacer;
  }
}

function measureKmarkScopeOverlay(view: EditorView): KmarkScopeOverlayMeasure {
  const displayPlugin = view.plugin(kmarkScopeDisplayPlugin);
  const gutterElement = view.scrollDOM.querySelector<HTMLElement>(".kmark-scope-gutter");
  const gutterWidth = displayPlugin?.gutterWidth ?? 0;

  if (displayPlugin === null || gutterElement === null || gutterWidth <= 0) {
    return {
      bars: [],
      contentHeight: 0,
      gutter: gutterElement,
      gutterWidth,
    };
  }

  return {
    bars: displayPlugin.displayDocument.scopes
      .map((scope) => measureScopeBar(view, scope))
      .filter((bar): bar is KmarkScopeBarMeasure => bar !== null),
    contentHeight: view.contentHeight / view.scaleY,
    gutter: gutterElement,
    gutterWidth,
  };
}

function measureScopeBar(view: EditorView, scope: KmarkScopeDisplayScope): KmarkScopeBarMeasure | null {
  if (view.state.doc.lines === 0) {
    return null;
  }

  const startLineNumber = clampLineNumber(scope.startLineNumber, view.state.doc.lines);
  const endLineNumber = clampLineNumber(scope.endLineNumber, view.state.doc.lines);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  const startBlock = view.lineBlockAt(startLine.from);
  const endBlock = view.lineBlockAt(endLine.from);
  const top = (startBlock.top + view.documentPadding.top) / view.scaleY + SCOPE_BAR_EDGE_INSET_PX;
  const bottom = (endBlock.bottom + view.documentPadding.top) / view.scaleY - SCOPE_BAR_EDGE_INSET_PX;
  const visibleDepthIndex = Math.min(scope.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX);

  return {
    className: `kmark-scope-bar kmark-scope-bar-${scope.paletteKey}`,
    displayName: scope.displayName,
    height: Math.max(SCOPE_BAR_MIN_HEIGHT_PX, bottom - top),
    id: scope.id,
    left: SCOPE_RAIL_START_X_PX + visibleDepthIndex * SCOPE_RAIL_STEP_PX,
    top,
  };
}

function createScopeBarElement(bar: KmarkScopeBarMeasure): HTMLElement {
  const element = document.createElement("span");

  element.className = bar.className;
  element.style.height = `${bar.height}px`;
  element.style.left = `${bar.left}px`;
  element.style.top = `${bar.top}px`;
  element.title = bar.displayName;

  return element;
}

function resolveDocumentGutterWidth(scopes: readonly KmarkScopeDisplayScope[]): number {
  let maximumVisibleDepthIndex = -1;

  for (const scope of scopes) {
    maximumVisibleDepthIndex = Math.max(
      maximumVisibleDepthIndex,
      Math.min(scope.depthIndex, SCOPE_MAX_VISIBLE_DEPTH_INDEX),
    );
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

function clampLineNumber(value: number, maximumLineNumber: number): number {
  return Math.min(maximumLineNumber, Math.max(1, value));
}
