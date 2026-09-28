import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

type CodeMirrorThemeMode = "dark" | "light";

const ONE_DARK_EDITOR_COLORS = {
  chalky: "#e5c07b",
  coral: "#e06c75",
  cyan: "#56b6c2",
  invalid: "#ffffff",
  ivory: "#abb2bf",
  malibu: "#61afef",
  sage: "#98c379",
  stone: "#7d8799",
  violet: "#c678dd",
  whiskey: "#d19a66",
} as const;

const oneDarkEditorSyntaxHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: ONE_DARK_EDITOR_COLORS.violet },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName],
    color: ONE_DARK_EDITOR_COLORS.coral,
  },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: ONE_DARK_EDITOR_COLORS.malibu,
  },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: ONE_DARK_EDITOR_COLORS.whiskey,
  },
  {
    tag: [tags.definition(tags.name), tags.separator],
    color: ONE_DARK_EDITOR_COLORS.ivory,
  },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: ONE_DARK_EDITOR_COLORS.chalky,
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: ONE_DARK_EDITOR_COLORS.cyan,
  },
  { tag: [tags.meta, tags.comment], color: ONE_DARK_EDITOR_COLORS.stone },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.link,
    color: ONE_DARK_EDITOR_COLORS.stone,
    textDecoration: "underline",
  },
  {
    tag: tags.heading,
    fontWeight: "bold",
    color: ONE_DARK_EDITOR_COLORS.coral,
  },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: ONE_DARK_EDITOR_COLORS.whiskey,
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: ONE_DARK_EDITOR_COLORS.sage,
  },
  { tag: tags.invalid, color: ONE_DARK_EDITOR_COLORS.invalid },
]);

const DARK_SYNTAX_HIGHLIGHTING = syntaxHighlighting(oneDarkEditorSyntaxHighlightStyle);
const LIGHT_SYNTAX_HIGHLIGHTING = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

export type CodeMirrorEditorThemeOptions = {
  readonly mode: CodeMirrorThemeMode;
  readonly fontFamily: string;
  readonly lineWrappingEnabled: boolean;
  readonly showMobileInputHelperBar: boolean;
};

export function resolveCodeMirrorSyntaxHighlighting(mode: CodeMirrorThemeMode): Extension {
  return mode === "dark" ? DARK_SYNTAX_HIGHLIGHTING : LIGHT_SYNTAX_HIGHLIGHTING;
}

export function createCodeMirrorEditorTheme({
  mode,
  fontFamily,
  lineWrappingEnabled,
  showMobileInputHelperBar,
}: CodeMirrorEditorThemeOptions): Extension {
  const isDarkTheme = mode === "dark";

  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: isDarkTheme ? ONE_DARK_EDITOR_COLORS.ivory : "var(--text)",
      fontFamily,
      fontSize: "var(--edit-font-size)",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--text)",
      padding: "0 16px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--text)",
    },
    ".cm-editor": {
      height: "100%",
    },
    ".cm-focused": {
      outline: "none",
    },
    "&.cm-editor .cm-gutters": {
      backgroundColor: "var(--surface)",
    },
    ".cm-gutters": {
      border: "none",
      color: isDarkTheme ? ONE_DARK_EDITOR_COLORS.stone : "var(--text-soft)",
      userSelect: "none",
    },
    ".cm-gutter, .cm-lineNumbers, .cm-lineNumbers .cm-gutterElement": {
      userSelect: "none",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-previewRequestedLine": {
      backgroundColor: "color-mix(in srgb, var(--focus) 15%, transparent)",
    },
    ".cm-assetDropLine": {
      backgroundColor: "color-mix(in srgb, var(--focus) 24%, transparent)",
      boxShadow: "inset 3px 0 0 var(--focus)",
    },
    ".cm-panels": {
      backgroundColor: "var(--surface-muted)",
      borderBottom: "1px solid var(--border)",
      color: "var(--text)",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.7",
      overflowX: lineWrappingEnabled ? "auto" : "scroll",
      overflowY: "auto",
      padding: showMobileInputHelperBar
        ? "16px 0 calc(16px + var(--mobile-input-helper-height) + env(safe-area-inset-bottom))"
        : "16px 0",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "color-mix(in srgb, var(--focus) 35%, transparent)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface-muted)",
      border: "1px solid var(--border)",
      color: "var(--text)",
    },
    ".cm-tooltip-autocomplete": {
      fontFamily: "inherit",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "color-mix(in srgb, var(--focus) 18%, var(--surface-muted))",
      color: "var(--text)",
    },
  }, {
    dark: isDarkTheme,
  });
}
