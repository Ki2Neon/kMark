import { expect, test } from "vitest";
import { loadFixtureResult } from "../support/fixtureFrame";

type ThemeSnapshot = {
  editorColor: string;
  gutterColor: string;
  commentColor: string;
  headingColors: string[];
};

test("CodeMirror computed colors survive dark to light to dark switching", async () => {
  const result = await loadFixtureResult<{
    dark: ThemeSnapshot;
    light: ThemeSnapshot;
    restoredDark: ThemeSnapshot;
  }>("/tests/fixtures/browser/editor-syntax-theme.html");
  expect(result.dark.editorColor).toBe("rgb(171, 178, 191)");
  expect(result.dark.gutterColor).toBe("rgb(125, 135, 153)");
  expect(result.dark.commentColor).toBe("rgb(125, 135, 153)");
  expect(result.dark.headingColors).toEqual(["rgb(152, 195, 121)", "rgb(224, 108, 117)"]);
  expect(result.light.editorColor).toBe("rgb(17, 34, 51)");
  expect(result.light.gutterColor).toBe("rgb(68, 85, 102)");
  expect(result.restoredDark).toEqual(result.dark);
});
