import { describe, expect, test } from "vitest";

import { createWebEditorDocument, initializeKmarkWeb } from "../../src/wasm/kmarkWeb";
import { elapsedMilliseconds, reportPerformance } from "./support/report";

const SAMPLE_COUNT = 50;

function percentile(sortedSamples: readonly number[], fraction: number): number {
  return Number(sortedSamples[Math.ceil(sortedSamples.length * fraction) - 1].toFixed(3));
}

describe("WASM editor mutation throughput (headless Chromium)", () => {
  test.each([1, 5])("%i MiB, 50 single-character edits", async (sizeMiB) => {
    await initializeKmarkWeb();
    const documentLengthUtf16 = sizeMiB * 1024 * 1024;
    const bootstrapStart = performance.now();
    const editor = await createWebEditorDocument({
      content: "a".repeat(documentLengthUtf16),
      revision: 1,
      isDirty: false,
    });
    const bootstrapMs = elapsedMilliseconds(bootstrapStart);
    try {
      const samples: number[] = [];
      let currentLengthUtf16 = documentLengthUtf16;
      let revision = 1;
      let mutationPayloadBytes = 0;
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const batchJson = JSON.stringify({
          clientId: "perf-editor-session",
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
        mutationPayloadBytes = new TextEncoder().encode(batchJson).length;
        const startedAt = performance.now();
        const ack = JSON.parse(editor.apply_mutation_batch_json(batchJson)) as {
          revision: number;
          documentLengthUtf16: number;
        };
        samples.push(performance.now() - startedAt);
        revision = ack.revision;
        currentLengthUtf16 = ack.documentLengthUtf16;
      }
      expect(revision).toBe(SAMPLE_COUNT + 1);
      expect(currentLengthUtf16).toBe(documentLengthUtf16 + SAMPLE_COUNT);
      const mutationCallsTotalMs = Number(samples.reduce((sum, value) => sum + value, 0).toFixed(3));
      samples.sort((left, right) => left - right);
      reportPerformance("wasm-editor-mutation-throughput", "chromium-headless", {
        sizeMiB,
        bootstrapMs,
        mutationPayloadBytes,
        mutationCallsTotalMs,
        mutationP50Ms: percentile(samples, 0.5),
        mutationP95Ms: percentile(samples, 0.95),
        sampleCount: SAMPLE_COUNT,
      });
    } finally {
      editor.free();
    }
  });
});
