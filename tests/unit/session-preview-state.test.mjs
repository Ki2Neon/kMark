import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applySessionPreviewResponse,
  changedSessionPreviewSectionIndices,
} from "../../src/adapters/browser/sessionPreviewState.ts";

test("section patch preserves unaffected view sections", () => {
  const full = {
    kind: "full",
    revision: 1,
    sections: [[{ html: "<p>a</p>" }], [{ html: "<p>b</p>" }]],
    defaultPageStyle: {},
    defaultTextStyle: {},
  };
  const first = applySessionPreviewResponse(null, full);
  assert.ok(first);
  const second = applySessionPreviewResponse(first, {
    kind: "patch",
    baseRevision: 1,
    revision: 2,
    sectionIndex: 1,
    pages: [{ html: "<p>changed</p>" }],
  });
  assert.ok(second);
  assert.strictEqual(second.sections[0], first.sections[0]);
  assert.deepEqual(changedSessionPreviewSectionIndices(first, second), [1]);
});

test("full response reuses sections with identical page payloads", () => {
  const previous = applySessionPreviewResponse(null, {
    kind: "full", revision: 1, sections: [[{ html: "a" }], [{ html: "b" }]],
    defaultPageStyle: {}, defaultTextStyle: {},
  });
  const next = applySessionPreviewResponse(previous, {
    kind: "full", revision: 2, sections: [[{ html: "a" }], [{ html: "B" }]],
    defaultPageStyle: {}, defaultTextStyle: {},
  });
  assert.deepEqual(changedSessionPreviewSectionIndices(previous, next), [1]);
  assert.deepEqual(changedSessionPreviewSectionIndices(null, next), [0, 1]);
  assert.deepEqual(changedSessionPreviewSectionIndices(next, next), []);
  assert.deepEqual(changedSessionPreviewSectionIndices(previous, {
    ...next,
    sections: [...next.sections, [{ html: "c" }]],
  }), [0, 1, 2]);
});

test("stale or out-of-range patches demand a full response", () => {
  const state = applySessionPreviewResponse(null, {
    kind: "full", revision: 4, sections: [[]], defaultPageStyle: {}, defaultTextStyle: {},
  });
  assert.ok(state);
  assert.equal(applySessionPreviewResponse(state, {
    kind: "patch", baseRevision: 3, revision: 5, sectionIndex: 0, pages: [],
  }), null);
  assert.equal(applySessionPreviewResponse(state, {
    kind: "patch", baseRevision: 4, revision: 5, sectionIndex: 1, pages: [],
  }), null);
});
