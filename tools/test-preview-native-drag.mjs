import assert from "node:assert/strict";
import test from "node:test";
import { shouldSuppressPreviewNativeDrag } from "../src/features/preview-navigation/domain/previewNativeDragPolicy.ts";

test("an accepted pan candidate suppresses native drag for every renderer", () => {
  for (const pendingPanPointerId of [0, 1, 42]) {
    assert.equal(shouldSuppressPreviewNativeDrag({ interactionEnabled: true, pendingPanPointerId }), true);
  }
});

test("native drag remains available without an accepted pan candidate", () => {
  assert.equal(shouldSuppressPreviewNativeDrag({ interactionEnabled: true, pendingPanPointerId: null }), false);
  assert.equal(shouldSuppressPreviewNativeDrag({ interactionEnabled: false, pendingPanPointerId: 1 }), false);
});
