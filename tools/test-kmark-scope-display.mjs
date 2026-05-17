import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = "src/features/kmark-scope-display/core/collectKmarkScopeDisplayLines.ts";
const outputPath = ".tmp/kmark-scope-display/collectKmarkScopeDisplayLines.mjs";
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
});

await mkdir(".tmp/kmark-scope-display", { recursive: true });
await writeFile(outputPath, transpiled.outputText);

const { collectKmarkScopeDisplayLines } = await import(pathToFileURL(outputPath).href);

function getLine(document, lineNumber) {
  return document.lines.find((line) => line.lineNumber === lineNumber) ?? null;
}

{
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { table compact:true } -->",
    "| A | B |",
    "<!-- kmark } -->",
  ].join("\n"));
  const contentLine = getLine(document, 2);

  assert.equal(contentLine.rails.length, 1);
  assert.equal(contentLine.rails[0].depthIndex, 0);
  assert.equal(contentLine.rails[0].paletteKey, "cyan");
}

{
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
  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), ["cyan", "purple", "yellow"]);
}

{
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { table } -->",
    "<!-- kmark { table } -->",
    "same scope name nested",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
  ].join("\n"));
  const nestedLine = getLine(document, 3);

  assert.deepEqual(nestedLine.rails.map((rail) => rail.colorKey), ["table", "table"]);
  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), ["cyan", "purple"]);
}

{
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { layer_1 } -->",
    "<!-- kmark { layer_2 } -->",
    "<!-- kmark { layer_3 } -->",
    "<!-- kmark { layer_4 } -->",
    "<!-- kmark { layer_5 } -->",
    "<!-- kmark { layer_6 } -->",
    "six layers",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
    "<!-- kmark } -->",
  ].join("\n"));
  const nestedLine = getLine(document, 7);

  assert.deepEqual(nestedLine.rails.map((rail) => rail.paletteKey), [
    "cyan",
    "purple",
    "yellow",
    "emerald",
    "rose",
    "indigo",
  ]);
}

{
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { define:\"hero\" layout:row } -->",
    "defined",
    "<!-- kmark } -->",
  ].join("\n"));
  const contentLine = getLine(document, 2);

  assert.equal(contentLine.rails[0].displayName, "hero");
  assert.equal(contentLine.rails[0].colorKey, "hero");
  assert.equal(contentLine.rails[0].paletteKey, "cyan");
}

{
  const document = collectKmarkScopeDisplayLines([
    "```markdown",
    "<!-- kmark { table } -->",
    "ignored",
    "<!-- kmark } -->",
    "```",
    "outside",
  ].join("\n"));

  assert.equal(document.lines.length, 0);
}

{
  const document = collectKmarkScopeDisplayLines([
    "<!-- kmark { hero } -->",
    "```markdown",
    "<!-- kmark { table } -->",
    "ignored marker, visible parent scope",
    "<!-- kmark } -->",
    "```",
    "<!-- kmark } -->",
  ].join("\n"));
  const fencedContentLine = getLine(document, 4);

  assert.equal(fencedContentLine.rails.length, 1);
  assert.equal(fencedContentLine.rails[0].displayName, "hero");
}

{
  const document = collectKmarkScopeDisplayLines("<!-- kmark { table } --> <!-- kmark } -->");
  const singleLine = getLine(document, 1);

  assert.equal(singleLine.rails[0].shape, "single");
}

console.log("kmark scope display parser tests passed");
