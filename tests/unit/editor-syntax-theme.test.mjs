import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveCodeMirrorSyntaxHighlighting } from "../../src/adapters/editor/codeMirrorAppearance.ts";
import { APP_THEME_OPTIONS, resolveAppThemeMode } from "../../src/domain/theme.ts";

test("App Themes select the same dark or light syntax mode as the former editor wrapper", () => {
  const actualModes = Object.fromEntries(APP_THEME_OPTIONS.map(({ id }) => [
    id,
    resolveAppThemeMode(id),
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

test("CodeMirror syntax extensions are stable within each explicit theme mode", () => {
  const darkSyntaxHighlighting = resolveCodeMirrorSyntaxHighlighting("dark");
  const lightSyntaxHighlighting = resolveCodeMirrorSyntaxHighlighting("light");

  assert.strictEqual(resolveCodeMirrorSyntaxHighlighting("dark"), darkSyntaxHighlighting);
  assert.strictEqual(resolveCodeMirrorSyntaxHighlighting("light"), lightSyntaxHighlighting);
  assert.notStrictEqual(darkSyntaxHighlighting, lightSyntaxHighlighting);
});
