import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const outputRoot = ".tmp/kmark-validation-benchmark";
const sources = [
  "src/domain/kmarkScopeSyntax.ts",
  "src/features/kmark-completion/schema/kmarkParamSpecs.ts",
  "src/features/kmark-completion/core/scanKmarkDirectives.ts",
  "src/features/kmark-completion/core/collectKmarkDefinitions.ts",
  "src/features/kmark-completion/core/validateKmarkDirective.ts",
];

for (const sourcePath of sources) {
  const outputPath = `${outputRoot}/${sourcePath.replace(/\.ts$/u, ".mjs")}`;
  const source = await readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText
    .replaceAll(/(from ["'](?:\.{1,2}\/)+[^"']+)(["'])/gu, "$1.mjs$2")
    .replace('"./kmark-param-schema.json.mjs"', '"./kmark-param-schema.json" with { type: "json" }');
  await mkdir(outputPath.replace(/[/\\][^/\\]+$/u, ""), { recursive: true });
  await writeFile(outputPath, output);
}
await writeFile(
  `${outputRoot}/src/features/kmark-completion/schema/kmark-param-schema.json`,
  await readFile("src/features/kmark-completion/schema/kmark-param-schema.json"),
);

const { collectKmarkDirectiveOccurrences } = await import(pathToFileURL(`${outputRoot}/src/features/kmark-completion/core/scanKmarkDirectives.mjs`).href);
const { validateKmarkDocument } = await import(pathToFileURL(`${outputRoot}/src/features/kmark-completion/core/validateKmarkDirective.mjs`).href);

const fixture = [
  "<!-- k define:hero -->",
  "`<!-- k use:missing -->`",
  "~~~md",
  "<!-- k use:missing -->",
  "~~~",
  "<!-- k use:hero -->",
  "<!-- k { -->",
  "<!-- k } -->",
].join("\r\n");
assert.equal(collectKmarkDirectiveOccurrences(fixture).length, 4);
assert.deepEqual(validateKmarkDocument(fixture), []);
assert.equal(collectKmarkDirectiveOccurrences("```md\n<!-- k use:missing -->\n```\n<!-- k use:hero -->").length, 1);
assert.equal(collectKmarkDirectiveOccurrences("<!--\nk use:hero\n--> <!-- k use:hero -->").length, 2);

for (const pageCount of [50, 100, 200]) {
  const page = [
    "# Page",
    "ordinary prose ".repeat(250),
    ...Array.from({ length: 5 }, () => "<!-- k use:hero -->\nordinary prose ".repeat(10)),
  ].join("\n");
  const markdown = ["<!-- k define:hero -->", ...Array.from({ length: pageCount }, () => page)].join("\n");
  const startedAt = performance.now();
  const warnings = validateKmarkDocument(markdown);
  const durationMs = performance.now() - startedAt;
  assert.equal(warnings.length, 0);
  console.log(JSON.stringify({ pageCount, length: markdown.length, durationMs: Number(durationMs.toFixed(2)) }));
}
