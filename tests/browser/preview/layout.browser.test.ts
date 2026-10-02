import { expect, test } from "vitest";
import { loadFixtureResult } from "../support/fixtureFrame";

type Measure = {
  contentBottom: number;
  targetBottom: number;
  targetWidth: number;
  targetHeight: number;
};
type LayoutResult = {
  frameCount: number;
  spacerCount: number;
  fit: Measure;
  contain: Measure;
  tallContain: Measure;
  svgContain: Measure;
  bottom: Measure;
  center: Measure;
  print: Measure;
  zoom: Measure;
};

test("page fit and vertical alignment use actual browser geometry", async () => {
  const result = await loadFixtureResult<LayoutResult>("/tests/fixtures/browser/a4-page-layout.html");
  const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.5);
  expect(result.frameCount).toBe(8);
  expect(result.spacerCount).toBe(2);
  near(result.fit.targetBottom, result.fit.contentBottom);
  expect(result.fit.targetHeight).toBeGreaterThan(500);
  expect(result.fit.targetWidth).toBeGreaterThan(450);
  near(result.contain.targetWidth / result.contain.targetHeight, 2);
  expect(result.contain.targetBottom).toBeLessThanOrEqual(result.contain.contentBottom + 1.5);
  near(result.tallContain.targetWidth / result.tallContain.targetHeight, 0.5);
  near(result.tallContain.targetBottom, result.tallContain.contentBottom);
  near(result.svgContain.targetWidth / result.svgContain.targetHeight, 0.5);
  expect(result.svgContain.targetBottom).toBeLessThanOrEqual(result.svgContain.contentBottom + 1.5);
  near(result.bottom.targetBottom, result.bottom.contentBottom);
  expect(result.center.contentBottom - result.center.targetBottom).toBeGreaterThan(200);
  near(result.print.targetBottom, result.print.contentBottom);
  near(result.zoom.targetBottom, result.zoom.contentBottom);
});
