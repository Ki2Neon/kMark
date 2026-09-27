import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import initKmarkWeb, { WebEditorDocument } from "../src/wasm/pkg/kmark_web.js";

const wasmBytes = await readFile(new URL("../src/wasm/pkg/kmark_web_bg.wasm", import.meta.url));
await initKmarkWeb({ module_or_path: wasmBytes });

const SAMPLE_COUNT = 50;
const DOCUMENT_SIZES = [1, 5].map((mebibytes) => ({
  label: `${mebibytes}MiB`,
  lengthUtf16: mebibytes * 1024 * 1024,
}));

for (const size of DOCUMENT_SIZES) {
  const bootstrapStartedAt = performance.now();
  const document = new WebEditorDocument(JSON.stringify({
    content: "a".repeat(size.lengthUtf16),
    revision: 1,
    isDirty: false,
  }));
  const bootstrapMs = performance.now() - bootstrapStartedAt;
  const samples = [];
  let currentLengthUtf16 = size.lengthUtf16;
  let revision = 1;
  let mutationPayloadBytes = 0;

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const batchJson = JSON.stringify({
      clientId: "editor-session-benchmark",
      batchId: index + 1,
      expectedRevision: revision,
      transactions: [{
        beforeLengthUtf16: currentLengthUtf16,
        changes: [{
          fromUtf16: currentLengthUtf16,
          toUtf16: currentLengthUtf16,
          insert: "x",
        }],
      }],
    });
    mutationPayloadBytes = new TextEncoder().encode(batchJson).byteLength;
    const startedAt = performance.now();
    const ack = JSON.parse(document.apply_mutation_batch_json(batchJson));
    samples.push(performance.now() - startedAt);
    revision = ack.revision;
    currentLengthUtf16 = ack.documentLengthUtf16;
  }

  samples.sort((left, right) => left - right);
  const percentile = (value) => samples[Math.ceil(samples.length * value) - 1];
  console.log(JSON.stringify({
    documentSize: size.label,
    bootstrapMs: Number(bootstrapMs.toFixed(3)),
    mutationPayloadBytes,
    mutationP50Ms: Number(percentile(0.5).toFixed(3)),
    mutationP95Ms: Number(percentile(0.95).toFixed(3)),
    samples: SAMPLE_COUNT,
  }));
  document.free();
}
