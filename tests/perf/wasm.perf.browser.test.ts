import { describe, expect, test } from "vitest";

import { createWebEditorDocument } from "../../src/wasm/kmarkWeb";
import { elapsedMilliseconds, reportPerformance } from "./support/report";

describe("WASM editor session performance (headless Chromium)", () => {
  test.each([
    { targetMiB: 1, explicitBreaks: true, unchangedMarkup: false },
    { targetMiB: 5, explicitBreaks: true, unchangedMarkup: false },
    { targetMiB: 1, explicitBreaks: false, unchangedMarkup: false },
    { targetMiB: 5, explicitBreaks: false, unchangedMarkup: false },
    { targetMiB: 1, explicitBreaks: true, unchangedMarkup: true },
  ])("$targetMiB MiB, explicitBreaks=$explicitBreaks, unchangedMarkup=$unchangedMarkup", async ({
    targetMiB, explicitBreaks, unchangedMarkup,
  }) => {
    const section = `${unchangedMarkup ? "# Section\n[guide](guide.md)\n<!-- note -->\n" : ""}${"ordinary prose ".repeat(1_000)}\n`;
    const separator = explicitBreaks ? "<!-- --- -->\n" : "";
    const sectionCount = targetMiB * 64;
    const source = Array.from({ length: sectionCount }, () => section).join(separator);
    const editor = await createWebEditorDocument({ content: source, revision: 1, isDirty: false });
    try {
      const fullStart = performance.now();
      const fullJson = editor.render_session_preview_json(JSON.stringify({
        revision: 1, baseRevision: null, filePath: null,
      }));
      const fullPreviewMs = elapsedMilliseconds(fullStart);
      const targetSection = Math.floor(sectionCount / 2);
      const position = targetSection * (section.length + separator.length) + section.indexOf("ordinary");
      const mutationStart = performance.now();
      const ackJson = editor.apply_mutation_batch_json(JSON.stringify({
        clientId: "perf-browser",
        batchId: 1,
        expectedRevision: 1,
        transactions: [{
          beforeLengthUtf16: source.length,
          changes: [{ fromUtf16: position, toUtf16: position + 8, insert: "ORDINARY" }],
        }],
      }));
      const mutationAckMs = elapsedMilliseconds(mutationStart);
      const patchStart = performance.now();
      const patchJson = editor.render_session_preview_json(JSON.stringify({
        revision: 2, baseRevision: 1, filePath: null,
      }));
      const patchPreviewMs = elapsedMilliseconds(patchStart);
      const patch = JSON.parse(patchJson) as { kind: string };
      const expectedKind = explicitBreaks ? "patch" : "full";
      expect(patch.kind).toBe(expectedKind);
      reportPerformance("wasm-session-preview-update", "chromium-headless", {
        sourceMiB: Number((new TextEncoder().encode(source).length / 1024 / 1024).toFixed(2)),
        sectionCount: explicitBreaks ? sectionCount : 1,
        explicitBreaks,
        unchangedMarkup,
        changeKind: patch.kind,
        fullPreviewMs,
        mutationAckMs,
        patchPreviewMs,
        fullPayloadBytes: new TextEncoder().encode(fullJson).length,
        mutationAckBytes: new TextEncoder().encode(ackJson).length,
        patchPayloadBytes: new TextEncoder().encode(patchJson).length,
      });
    } finally {
      editor.free();
    }
  });
});
