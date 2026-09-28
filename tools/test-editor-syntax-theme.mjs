import assert from "node:assert/strict";
import test from "node:test";
import { ONE_DARK_EDITOR_SYNTAX_COLORS } from "../src/adapters/editor/codeMirrorSyntaxHighlighting.ts";
import { APP_THEME_OPTIONS, isDarkAppTheme } from "../src/domain/theme.ts";

test("App Themes select the same dark or light syntax mode as the former editor wrapper", () => {
  const actualModes = Object.fromEntries(APP_THEME_OPTIONS.map(({ id }) => [
    id,
    isDarkAppTheme(id) ? "dark" : "light",
  ]));

  assert.deepEqual(actualModes, {
    "vscode-dark": "dark",
    "vscode-light": "light",
    "github-dark": "dark",
    "github-light": "light",
    dracula: "dark",
    "night-owl": "dark",
    monokai: "dark",
    paper: "light",
  });
});

test("dark syntax colors preserve the former One Dark palette", () => {
  assert.deepEqual(ONE_DARK_EDITOR_SYNTAX_COLORS, {
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
  });
});
