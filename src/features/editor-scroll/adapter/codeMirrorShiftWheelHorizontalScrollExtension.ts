import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { resolveShiftWheelHorizontalScroll } from "../domain/shiftWheelHorizontalScroll";

class CodeMirrorShiftWheelHorizontalScrollPlugin {
  readonly #view: EditorView;

  readonly #handleWheel = (event: WheelEvent): void => {
    const scrollElement = this.#view.scrollDOM;
    const decision = resolveShiftWheelHorizontalScroll({
      altKey: event.altKey,
      clientWidth: scrollElement.clientWidth,
      ctrlKey: event.ctrlKey,
      defaultPrevented: event.defaultPrevented,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      lineHeight: this.#view.defaultLineHeight,
      metaKey: event.metaKey,
      scrollLeft: scrollElement.scrollLeft,
      scrollWidth: scrollElement.scrollWidth,
      shiftKey: event.shiftKey,
    });

    if (!decision.handled) {
      return;
    }

    scrollElement.scrollLeft = decision.nextScrollLeft;
    event.preventDefault();
  };

  constructor(view: EditorView) {
    this.#view = view;
    view.scrollDOM.addEventListener("wheel", this.#handleWheel, { passive: false });
  }

  destroy(): void {
    this.#view.scrollDOM.removeEventListener("wheel", this.#handleWheel);
  }
}

export function createCodeMirrorShiftWheelHorizontalScrollExtension(): Extension {
  return ViewPlugin.fromClass(CodeMirrorShiftWheelHorizontalScrollPlugin);
}
