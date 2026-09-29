import assert from "node:assert/strict";
import { test } from "vitest";
import { collectKmarkScopeDisplayLines } from "../../src/features/kmark-scope-display/core/collectKmarkScopeDisplayLines.ts";

function getLine(document, lineNumber) {
  return document.lines.find((line) => line.lineNumber === lineNumber) ?? null;
}

test("legacy scope rails and range", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- k { table compact:true } -->",
    "| A | B |",
    "<!-- } -->",
  ].join("\n"));
  const contentLine = getLine(document, 2);

  assert.equal(contentLine.rails.length, 1);
  assert.equal(contentLine.rails[0].depthIndex, 0);
  assert.equal(contentLine.rails[0].paletteKey, "tone-0");
  assert.equal(document.scopes.length, 1);
  assert.equal(document.scopes[0].startLineNumber, 1);
  assert.equal(document.scopes[0].endLineNumber, 3);
});

test("nested scopes use depth palette", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { hero } -->",
    "<!-- kmark { image_group } -->",
    "<!-- kmark { table } -->",
    "nested",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
  ].join("\n"));
  const nestedLine = getLine(document, 4);

  assert.deepEqual(nestedLine.rails.map((rail) => rail.depthIndex), [0, 1, 2]);
  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), ["tone-0", "tone-1", "tone-2"]);
});

test("same-name nested scopes retain separate rails", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { table } -->",
    "<!-- kmark { table } -->",
    "same scope name nested",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
  ].join("\n"));
  const nestedLine = getLine(document, 3);

  assert.deepEqual(nestedLine.rails.map((rail) => rail.colorKey), ["table", "table"]);
  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), ["tone-0", "tone-1"]);
});

test("sixteen nested scopes retain distinct palette keys", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { layer_1 } -->",
    "<!-- kmark { layer_2 } -->",
    "<!-- kmark { layer_3 } -->",
    "<!-- kmark { layer_4 } -->",
    "<!-- kmark { layer_5 } -->",
    "<!-- kmark { layer_6 } -->",
    "<!-- kmark { layer_7 } -->",
    "<!-- kmark { layer_8 } -->",
    "<!-- kmark { layer_9 } -->",
    "<!-- kmark { layer_10 } -->",
    "<!-- kmark { layer_11 } -->",
    "<!-- kmark { layer_12 } -->",
    "<!-- kmark { layer_13 } -->",
    "<!-- kmark { layer_14 } -->",
    "<!-- kmark { layer_15 } -->",
    "<!-- kmark { layer_16 } -->",
    "sixteen layers",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
  ].join("\n"));
  const nestedLine = getLine(document, 17);

  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), [
    "tone-0",
    "tone-1",
    "tone-2",
    "tone-3",
    "tone-4",
    "tone-5",
    "tone-6",
    "tone-7",
    "tone-8",
    "tone-9",
    "tone-10",
    "tone-11",
    "tone-12",
    "tone-13",
    "tone-14",
    "tone-15",
  ]);
});

test("defined scope uses display name and color key", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { define:\"hero\" layout:row } -->",
    "defined",
    "<!-- kmark } -->",
  ].join("\n"));
  const contentLine = getLine(document, 2);

  assert.equal(contentLine.rails[0].displayName, "hero");
  assert.equal(contentLine.rails[0].colorKey, "hero");
  assert.equal(contentLine.rails[0].paletteKey, "tone-0");
});

test("fenced markers outside scope are ignored", () => {
  const document = collectKmarkScopeDisplayLines([
    "```markdown",
    "<!-- kmark { table } -->",
    "ignored",
    "<!-- kmark } -->",
    "```",
    "outside",
  ].join("\n"));

  assert.equal(document.lines.length, 0);
});

test("fenced markers inside scope preserve parent", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!-- k { hero } -->",
    "```markdown",
    "<!-- kmark { table } -->",
    "ignored marker, visible parent scope",
    "<!-- kmark } -->",
    "```",
    "<!-- } -->",
  ].join("\n"));
  const fencedContentLine = getLine(document, 4);

  assert.equal(fencedContentLine.rails.length, 1);
  assert.equal(fencedContentLine.rails[0].displayName, "hero");
});

test("single-line scope has single shape", () => {
  const document = collectKmarkScopeDisplayLines("<!-- k { table } --> <!-- } -->");
  const singleLine = getLine(document, 1);

  assert.equal(singleLine.rails[0].shape, "single");
  assert.equal(document.scopes[0].startLineNumber, 1);
  assert.equal(document.scopes[0].endLineNumber, 1);
});

test("compact scope syntax is recognized", () => {
  const document = collectKmarkScopeDisplayLines([
    "<!--k{ quick_scope color:red -->",
    "quick",
    "<!--k}-->",
  ].join("\n"));
  const contentLine = getLine(document, 2);

  assert.equal(contentLine.rails.length, 1);
  assert.equal(contentLine.rails[0].displayName, "quick_scope");
  assert.equal(contentLine.rails[0].paletteKey, "tone-0");
});

test("plain text scope markers are ignored", () => {
  const document = collectKmarkScopeDisplayLines([
    "k{ quick_scope color:red",
    "quick",
    "k}",
  ].join("\n"));

  assert.equal(document.lines.length, 0);
});



