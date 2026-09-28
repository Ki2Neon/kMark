import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import initKmarkWeb, { WebEditorDocument } from "../src/wasm/pkg/kmark_web.js";

const wasmBytes = await readFile(new URL("../src/wasm/pkg/kmark_web_bg.wasm", import.meta.url));
await initKmarkWeb({ module_or_path: wasmBytes });

for (const [mebibytes, explicitBreaks] of [[1, true], [5, true], [1, false], [5, false]]) {
  const sectionCount = mebibytes * 64;
  const section = `${"ordinary prose ".repeat(1_000)}\n`;
  const separator = explicitBreaks ? "<!-- --- -->\n" : "";
  const source = Array.from({ length: sectionCount }, () => section).join(separator);
  const document = new WebEditorDocument(JSON.stringify({ content: source, revision: 1, isDirty: false }));
  try {
    const fullStarted = performance.now();
    const fullJson = document.render_session_preview_json(JSON.stringify({
      revision: 1, baseRevision: null, filePath: null,
    }));
    const fullMs = performance.now() - fullStarted;
    const targetSection = Math.floor(sectionCount / 2);
    const position = targetSection * (section.length + separator.length) + section.indexOf("ordinary");
    document.apply_mutation_batch_json(JSON.stringify({
      clientId: "preview-benchmark",
      batchId: 1,
      expectedRevision: 1,
      transactions: [{
        beforeLengthUtf16: source.length,
        changes: [{ fromUtf16: position, toUtf16: position + 8, insert: "ORDINARY" }],
      }],
    }));
    const patchStarted = performance.now();
    const patchJson = document.render_session_preview_json(JSON.stringify({
      revision: 2, baseRevision: 1, filePath: null,
    }));
    const patchMs = performance.now() - patchStarted;
    const change = JSON.parse(patchJson);
    const expectedKind = explicitBreaks ? "patch" : "full";
    if (change.kind !== expectedKind) throw new Error(`expected ${expectedKind}, received ${change.kind}`);
    console.log(JSON.stringify({
      sourceMiB: Number((source.length / 1024 / 1024).toFixed(2)),
      sectionCount: explicitBreaks ? sectionCount : 1,
      explicitBreaks,
      changeKind: change.kind,
      fullMs: Number(fullMs.toFixed(2)),
      patchMs: Number(patchMs.toFixed(2)),
      fullPayloadBytes: new TextEncoder().encode(fullJson).length,
      patchPayloadBytes: new TextEncoder().encode(patchJson).length,
    }));
  } finally {
    document.free();
  }
}
