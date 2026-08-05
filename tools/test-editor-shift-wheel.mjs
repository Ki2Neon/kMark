import assert from "node:assert/strict";
import test from "node:test";
import { resolveFixedGutterScrollbarMaskGeometry } from "../src/features/editor-scroll/domain/fixedGutterScrollbarMask.ts";
import { resolveShiftWheelHorizontalScroll } from "../src/features/editor-scroll/domain/shiftWheelHorizontalScroll.ts";

const BASE_INPUT = Object.freeze({
  altKey: false,
  clientWidth: 400,
  ctrlKey: false,
  defaultPrevented: false,
  deltaMode: 0,
  deltaX: 0,
  deltaY: 0,
  lineHeight: 20,
  metaKey: false,
  scrollLeft: 100,
  scrollWidth: 1_000,
  shiftKey: true,
});

function resolve(overrides = {}) {
  return resolveShiftWheelHorizontalScroll({
    ...BASE_INPUT,
    ...overrides,
  });
}

test("maps a shifted vertical pixel wheel to horizontal scrolling", () => {
  assert.deepEqual(resolve({ deltaY: 40 }), {
    handled: true,
    nextScrollLeft: 140,
  });
});

test("uses the dominant axis without adding native horizontal and vertical deltas", () => {
  assert.equal(resolve({ deltaX: 60, deltaY: 10 }).nextScrollLeft, 160);
  assert.equal(resolve({ deltaX: 1, deltaY: 50 }).nextScrollLeft, 150);
});

test("normalizes line and page delta modes", () => {
  assert.equal(resolve({ deltaMode: 1, deltaY: 3 }).nextScrollLeft, 160);
  assert.equal(resolve({ deltaMode: 2, deltaY: 1 }).nextScrollLeft, 500);
});

test("clamps movement to both horizontal boundaries", () => {
  assert.equal(resolve({ deltaY: -200, scrollLeft: 50 }).nextScrollLeft, 0);
  assert.equal(resolve({ deltaY: 200, scrollLeft: 550 }).nextScrollLeft, 600);
});

test("consumes shifted wheel input at a horizontal boundary", () => {
  assert.deepEqual(resolve({ deltaY: 40, scrollLeft: 600 }), {
    handled: true,
    nextScrollLeft: 600,
  });
});

test("ignores already handled events and non-shift modifier combinations", () => {
  for (const overrides of [
    { defaultPrevented: true, deltaY: 40 },
    { shiftKey: false, deltaY: 40 },
    { altKey: true, deltaY: 40 },
    { ctrlKey: true, deltaY: 40 },
    { metaKey: true, deltaY: 40 },
  ]) {
    assert.deepEqual(resolve(overrides), {
      handled: false,
      nextScrollLeft: 100,
    });
  }
});

test("ignores zero delta and editors without horizontal overflow", () => {
  assert.equal(resolve().handled, false);
  assert.equal(resolve({ deltaY: 40, scrollWidth: 400 }).handled, false);
});

test("positions the fixed-gutter mask over the scrollbar segment below the gutter", () => {
  assert.deepEqual(resolveFixedGutterScrollbarMaskGeometry({
    editorLeft: 10,
    editorTop: 20,
    gutterLeft: 10,
    gutterWidth: 32,
    scrollerClientHeight: 478,
    scrollerOffsetHeight: 488,
    scrollerTop: 20,
  }), {
    height: 10,
    left: 0,
    top: 478,
    visible: true,
    width: 32,
  });
});

test("hides the fixed-gutter mask without a gutter width or horizontal scrollbar", () => {
  for (const overrides of [
    { gutterWidth: 0 },
    { scrollerClientHeight: 488 },
  ]) {
    assert.deepEqual(resolveFixedGutterScrollbarMaskGeometry({
      editorLeft: 10,
      editorTop: 20,
      gutterLeft: 10,
      gutterWidth: 32,
      scrollerClientHeight: 478,
      scrollerOffsetHeight: 488,
      scrollerTop: 20,
      ...overrides,
    }), {
      height: 0,
      left: 0,
      top: 0,
      visible: false,
      width: 0,
    });
  }
});
