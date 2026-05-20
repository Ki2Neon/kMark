import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const outputRoot = ".tmp/kmark-completion-context";
const sources = [
  {
    sourcePath: "src/domain/kmarkScopeSyntax.ts",
    outputPath: `${outputRoot}/src/domain/kmarkScopeSyntax.mjs`,
  },
  {
    sourcePath: "src/features/kmark-completion/core/parseKmarkDirectiveFragment.ts",
    outputPath: `${outputRoot}/src/features/kmark-completion/core/parseKmarkDirectiveFragment.mjs`,
  },
  {
    sourcePath: "src/features/kmark-completion/core/detectKmarkCompletionContext.ts",
    outputPath: `${outputRoot}/src/features/kmark-completion/core/detectKmarkCompletionContext.mjs`,
    replacements: [
      ["../../../domain/kmarkScopeSyntax", "../../../domain/kmarkScopeSyntax.mjs"],
      ["./parseKmarkDirectiveFragment", "./parseKmarkDirectiveFragment.mjs"],
    ],
  },
];

for (const source of sources) {
  const sourceText = await readFile(source.sourcePath, "utf8");
  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: source.sourcePath,
  });
  const outputText = (source.replacements ?? []).reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    transpiled.outputText,
  );

  await mkdir(source.outputPath.replace(/[/\\][^/\\]+$/u, ""), { recursive: true });
  await writeFile(source.outputPath, outputText);
}

const { detectKmarkCompletionContext } = await import(
  pathToFileURL(`${outputRoot}/src/features/kmark-completion/core/detectKmarkCompletionContext.mjs`).href
);

{
  const markdown = "<!--k{ -->基板<!--k}-->";
  const context = detectKmarkCompletionContext({
    markdown,
    cursorOffset: "<!--k{ ".length,
  });

  assert.equal(context.active, true);
  assert.equal(context.contexts.includes("text"), true);
  assert.equal(context.contexts.includes("scope"), false);
}

{
  const markdown = "<!--k{ -->";
  const context = detectKmarkCompletionContext({
    markdown,
    cursorOffset: "<!--k{ ".length,
  });

  assert.equal(context.active, true);
  assert.equal(context.contexts.includes("scope"), true);
}

console.log("kmark completion context tests passed");
