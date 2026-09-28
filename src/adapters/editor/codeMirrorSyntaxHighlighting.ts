import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

export const ONE_DARK_EDITOR_SYNTAX_COLORS = {
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
  { tag: tags.keyword, color: ONE_DARK_EDITOR_SYNTAX_COLORS.violet },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.coral,
  },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.malibu,
  },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.whiskey,
  },
  {
    tag: [tags.definition(tags.name), tags.separator],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.ivory,
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
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.chalky,
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
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.cyan,
  },
  { tag: [tags.meta, tags.comment], color: ONE_DARK_EDITOR_SYNTAX_COLORS.stone },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.link,
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.stone,
    textDecoration: "underline",
  },
  {
    tag: tags.heading,
    fontWeight: "bold",
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.coral,
  },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.whiskey,
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: ONE_DARK_EDITOR_SYNTAX_COLORS.sage,
  },
  { tag: tags.invalid, color: ONE_DARK_EDITOR_SYNTAX_COLORS.invalid },
]);

const DARK_SYNTAX_HIGHLIGHTING = syntaxHighlighting(oneDarkEditorSyntaxHighlightStyle);
const LIGHT_SYNTAX_HIGHLIGHTING = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

export function resolveCodeMirrorSyntaxHighlighting(isDarkTheme: boolean): Extension {
  return isDarkTheme ? DARK_SYNTAX_HIGHLIGHTING : LIGHT_SYNTAX_HIGHLIGHTING;
}
