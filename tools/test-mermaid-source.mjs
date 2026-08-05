import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMermaidLineBreakTags } from "../src/adapters/browser/browserMermaidSource.ts";

test("normalizes Mermaid line break tag variants", () => {
  assert.equal(
    normalizeMermaidLineBreakTags("<br><br/><br /></br></BR >"),
    "<br/><br/><br/><br/><br/>",
  );
});

test("normalizes malformed closing br tags inside diagram labels", () => {
  assert.equal(
    normalizeMermaidLineBreakTags("state1: line1</br>line2"),
    "state1: line1<br/>line2",
  );
});

test("makes Mermaid foreignObject line breaks XML-compatible", () => {
  assert.equal(
    normalizeMermaidLineBreakTags(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">line1<br>line2</div></foreignObject></svg>',
    ),
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">line1<br/>line2</div></foreignObject></svg>',
  );
});

test("leaves escaped and unrelated tags unchanged", () => {
  const source = "&lt;/br&gt; <brake> </b> <br data-kind='manual'>";
  assert.equal(normalizeMermaidLineBreakTags(source), source);
});
