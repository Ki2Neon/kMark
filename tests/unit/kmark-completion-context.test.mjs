import assert from "node:assert/strict";
import { test } from "vitest";
import { detectKmarkCompletionContext } from "../../src/features/kmark-completion/core/detectKmarkCompletionContext.ts";

test("completion context inside open scope with content is text", () => {
  const markdown = "<!--k{ -->基板<!--k}-->";
  const context = detectKmarkCompletionContext({
    markdown,
    cursorOffset: "<!--k{ ".length,
  });
  assert.equal(context.active, true);
  assert.equal(context.contexts.includes("text"), true);
  assert.equal(context.contexts.includes("scope"), false);
});

test("completion context inside an empty scope is scope", () => {
  const markdown = "<!--k{ -->";
  const context = detectKmarkCompletionContext({
    markdown,
    cursorOffset: "<!--k{ ".length,
  });
  assert.equal(context.active, true);
  assert.equal(context.contexts.includes("scope"), true);
});
