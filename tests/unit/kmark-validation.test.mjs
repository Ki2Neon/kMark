import assert from "node:assert/strict";
import { test } from "vitest";
import { collectKmarkDirectiveOccurrences } from "../../src/features/kmark-completion/core/scanKmarkDirectives.ts";
import { validateKmarkDocument } from "../../src/features/kmark-completion/core/validateKmarkDirective.ts";

test("validation skips fenced directives and resolves definitions across CRLF", () => {
  const markdown = [
    "<!-- k define:hero -->",
    "`<!-- k use:missing -->`",
    "~~~md",
    "<!-- k use:missing -->",
    "~~~",
    "<!-- k use:hero -->",
    "<!-- k { -->",
    "<!-- k } -->",
  ].join("\r\n");
  assert.equal(collectKmarkDirectiveOccurrences(markdown).length, 4);
  assert.deepEqual(validateKmarkDocument(markdown), []);
});

test("scanner ignores fenced directives but finds multiline and adjacent comments", () => {
  assert.equal(
    collectKmarkDirectiveOccurrences("```md\n<!-- k use:missing -->\n```\n<!-- k use:hero -->").length,
    1,
  );
  assert.equal(
    collectKmarkDirectiveOccurrences("<!--\nk use:hero\n--> <!-- k use:hero -->").length,
    2,
  );
});
