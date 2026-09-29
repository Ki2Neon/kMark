import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  createCodeMirrorEditorTheme,
  resolveCodeMirrorSyntaxHighlighting,
} from "../../../src/adapters/editor/codeMirrorAppearance";

type ThemeSnapshot = {
  readonly editorColor: string;
  readonly gutterColor: string;
  readonly headingColors: readonly string[];
  readonly commentColor: string;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function readColor(element: Element | null, label: string): string {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`${label} was not rendered`);
  }
  return getComputedStyle(element).color;
}

function collectSnapshot(view: EditorView): ThemeSnapshot {
  const lines = [...view.contentDOM.querySelectorAll(":scope > .cm-line")];
  const headingSpans = [...(lines[0]?.querySelectorAll("span") ?? [])];
  const commentSpan = lines[2]?.querySelector("span") ?? null;

  return {
    editorColor: readColor(view.dom, "editor"),
    gutterColor: readColor(view.dom.querySelector(".cm-gutters"), "gutter"),
    headingColors: headingSpans.map((span) => readColor(span, "heading token")),
    commentColor: readColor(commentSpan, "comment token"),
  };
}

function createTheme(mode: "dark" | "light") {
  return createCodeMirrorEditorTheme({
    mode,
    fontFamily: "monospace",
    lineWrappingEnabled: true,
    showMobileInputHelperBar: false,
  });
}

async function run(): Promise<void> {
  const parent = document.querySelector("#editor");
  if (!(parent instanceof HTMLElement)) {
    throw new Error("editor host was not found");
  }

  const syntaxCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "# Heading\n\n<!-- comment -->",
      extensions: [
        markdown(),
        lineNumbers(),
        syntaxCompartment.of(resolveCodeMirrorSyntaxHighlighting("dark")),
        themeCompartment.of(createTheme("dark")),
      ],
    }),
  });

  await nextFrame();
  const dark = collectSnapshot(view);

  view.dispatch({
    effects: [
      syntaxCompartment.reconfigure(resolveCodeMirrorSyntaxHighlighting("light")),
      themeCompartment.reconfigure(createTheme("light")),
    ],
  });
  await nextFrame();
  const light = collectSnapshot(view);

  view.dispatch({
    effects: [
      syntaxCompartment.reconfigure(resolveCodeMirrorSyntaxHighlighting("dark")),
      themeCompartment.reconfigure(createTheme("dark")),
    ],
  });
  await nextFrame();
  const restoredDark = collectSnapshot(view);

  view.destroy();
  document.body.dataset.result = btoa(JSON.stringify({ dark, light, restoredDark }));
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.result = btoa(JSON.stringify({ error: message }));
});
