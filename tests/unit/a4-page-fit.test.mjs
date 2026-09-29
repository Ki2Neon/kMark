import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resolveA4PageContentRect,
  resolveA4PageFitAvailableSize,
  resolveA4PageFitContainSize,
  resolveA4PageValignSpacerHeight,
} from "../../src/domain/a4PageFit.ts";

test("page_fit uses the unscaled remaining page area", () => {
  assert.deepEqual(
    resolveA4PageContentRect(
      { left: 0, top: 0, right: 600, bottom: 800 },
      { left: 1, top: 1, right: 1, bottom: 1 },
      { left: 50, top: 50, right: 50, bottom: 50 },
      1,
    ),
    { left: 51, top: 51, right: 549, bottom: 749 },
  );
  assert.deepEqual(
    resolveA4PageFitAvailableSize(
      { left: 20, top: 40, right: 500, bottom: 800 },
      { left: 140, top: 260, right: 320, bottom: 400 },
      2,
    ),
    { width: 180, height: 270 },
  );
  assert.deepEqual(
    resolveA4PageFitAvailableSize(
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 120, top: 140, right: 160, bottom: 180 },
      1,
    ),
    { width: 0, height: 0 },
  );
});

test("page_fit_contain preserves aspect ratio within both limits", () => {
  assert.deepEqual(resolveA4PageFitContainSize(2, 300, 200), { width: 300, height: 150 });
  assert.deepEqual(resolveA4PageFitContainSize(2, 300, 100), { width: 200, height: 100 });
  assert.deepEqual(resolveA4PageFitContainSize(2, 0, 100), { width: 0, height: 0 });
  assert.equal(resolveA4PageFitContainSize(Number.NaN, 300, 200), null);
});

test("page_valign spacer stays within fixed page bounds", () => {
  assert.equal(resolveA4PageValignSpacerHeight("bottom", 800, 400, 2), 200);
  assert.equal(resolveA4PageValignSpacerHeight("center", 800, 400, 2), 100);
  assert.equal(resolveA4PageValignSpacerHeight("bottom", 800, 900, 2), 0);
});
