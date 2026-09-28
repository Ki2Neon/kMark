import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import initKmarkWeb, {
  WebEditorDocument,
  render_markdown_preview_json as renderMarkdownPreviewJson,
} from "../src/wasm/pkg/kmark_web.js";

const wasmBytes = await readFile(new URL("../src/wasm/pkg/kmark_web_bg.wasm", import.meta.url));
await initKmarkWeb({ module_or_path: wasmBytes });

test("Web session returns one-section patch equal to full renderer", () => {
  const source = "# Intro\nfirst\n<!-- --- -->\n# Section\nbefore\n<!-- --- -->\n# Tail\nlast";
  const document = new WebEditorDocument(JSON.stringify({ content: source, revision: 1, isDirty: false }));
  try {
    const full = JSON.parse(document.render_session_preview_json(JSON.stringify({
      revision: 1, baseRevision: null, filePath: null,
    })));
    assert.equal(full.kind, "full");
    assert.equal(full.sections.length, 3);

    const start = source.indexOf("before");
    document.apply_mutation_batch_json(JSON.stringify({
      clientId: "web-preview-test",
      batchId: 1,
      expectedRevision: 1,
      transactions: [{
        beforeLengthUtf16: source.length,
        changes: [{ fromUtf16: start, toUtf16: start + 6, insert: "after" }],
      }],
    }));
    const patch = JSON.parse(document.render_session_preview_json(JSON.stringify({
      revision: 2, baseRevision: 1, filePath: null,
    })));
    assert.equal(patch.kind, "patch");
    assert.equal(patch.sectionIndex, 1);
    full.sections[1] = patch.pages;
    const canonical = JSON.parse(renderMarkdownPreviewJson(source.replace("before", "after"), null, "a4"));
    assert.deepEqual(full.sections.flat(), canonical.pages);

    const secondSource = source.replace("before", "after");
    document.apply_mutation_batch_json(JSON.stringify({
      clientId: "web-preview-test",
      batchId: 2,
      expectedRevision: 2,
      transactions: [{
        beforeLengthUtf16: secondSource.length,
        changes: [{
          fromUtf16: start,
          toUtf16: start + 5,
          insert: "after\n<!-- --- -->",
        }],
      }],
    }));
    const rebuilt = JSON.parse(document.render_session_preview_json(JSON.stringify({
      revision: 3, baseRevision: 2, filePath: null,
    })));
    assert.equal(rebuilt.kind, "full");
    const finalSource = secondSource.replace("after", "after\n<!-- --- -->");
    const finalFull = JSON.parse(renderMarkdownPreviewJson(finalSource, null, "a4"));
    assert.deepEqual(rebuilt.sections.flat(), finalFull.pages);
  } finally {
    document.free();
  }
});
