import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  resolveFixedGutterScrollbarMaskGeometry,
  type FixedGutterScrollbarMaskGeometry,
} from "../domain/fixedGutterScrollbarMask";

const FIXED_GUTTER_SELECTOR = ".cm-gutters-before";

class CodeMirrorFixedGutterScrollbarMaskPlugin {
  readonly #maskElement: HTMLDivElement;
  readonly #view: EditorView;
  readonly #measureRequest = {
    key: this,
    read: (view: EditorView): FixedGutterScrollbarMaskGeometry => {
      const gutterElement = view.scrollDOM.querySelector<HTMLElement>(FIXED_GUTTER_SELECTOR);

      if (gutterElement === null) {
        return HIDDEN_MASK_GEOMETRY;
      }

      const editorRect = view.dom.getBoundingClientRect();
      const gutterRect = gutterElement.getBoundingClientRect();
      const scrollerRect = view.scrollDOM.getBoundingClientRect();

      return resolveFixedGutterScrollbarMaskGeometry({
        editorLeft: editorRect.left,
        editorTop: editorRect.top,
        gutterLeft: gutterRect.left,
        gutterWidth: gutterRect.width,
        scrollerClientHeight: view.scrollDOM.clientHeight,
        scrollerOffsetHeight: view.scrollDOM.offsetHeight,
        scrollerTop: scrollerRect.top,
      });
    },
    write: (geometry: FixedGutterScrollbarMaskGeometry): void => {
      this.#render(geometry);
    },
  };

  constructor(view: EditorView) {
    this.#view = view;
    this.#maskElement = view.dom.ownerDocument.createElement("div");
    this.#maskElement.className = "cm-fixedGutterScrollbarMask";
    this.#maskElement.setAttribute("aria-hidden", "true");
    view.requestMeasure(this.#measureRequest);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.geometryChanged || update.viewportChanged) {
      update.view.requestMeasure(this.#measureRequest);
    }
  }

  destroy(): void {
    this.#maskElement.remove();
  }

  #render(geometry: FixedGutterScrollbarMaskGeometry): void {
    if (!geometry.visible) {
      this.#maskElement.remove();
      return;
    }

    if (this.#maskElement.parentElement !== this.#view.dom) {
      this.#view.dom.appendChild(this.#maskElement);
    }

    this.#maskElement.style.height = `${geometry.height}px`;
    this.#maskElement.style.left = `${geometry.left}px`;
    this.#maskElement.style.top = `${geometry.top}px`;
    this.#maskElement.style.width = `${geometry.width}px`;
  }
}

const HIDDEN_MASK_GEOMETRY: FixedGutterScrollbarMaskGeometry = {
  height: 0,
  left: 0,
  top: 0,
  visible: false,
  width: 0,
};

const fixedGutterScrollbarMaskTheme = EditorView.baseTheme({
  ".cm-fixedGutterScrollbarMask": {
    backgroundColor: "var(--surface)",
    pointerEvents: "auto",
    position: "absolute",
    zIndex: "201",
  },
});

export function createCodeMirrorFixedGutterScrollbarMaskExtension(): Extension {
  return [
    ViewPlugin.fromClass(CodeMirrorFixedGutterScrollbarMaskPlugin),
    fixedGutterScrollbarMaskTheme,
  ];
}
