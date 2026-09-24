import assert from "node:assert/strict";
import test from "node:test";
import { buildInsertedMarkdownTable } from "../src/features/table-assist/core/markdownTableInsert.ts";
import { resolveAnchoredDialogGroupPosition } from "../src/features/table-assist/adapter/tableInsertDialogGeometry.ts";

test("builds the previous two-by-two default table", () => {
  assert.equal(
    buildInsertedMarkdownTable(2, 2),
    "| 列1 | 列2 |\n| --- | --- |\n|  |  |",
  );
});

test("builds a header-only one-by-one table", () => {
  assert.equal(buildInsertedMarkdownTable(1, 1), "| 列1 |\n| --- |");
});

test("builds the initial twenty-by-twenty picker size", () => {
  const table = buildInsertedMarkdownTable(20, 20);
  const lines = table.split("\n");

  assert.equal(lines.length, 21);
  assert.match(lines[0], /^\| 列1 \|/u);
  assert.match(lines[0], /\| 列20 \|$/u);
  assert.equal(lines[1], `| ${Array.from({ length: 20 }, () => "---").join(" | ")} |`);
  assert.equal(lines.at(-1), `| ${Array.from({ length: 20 }, () => "").join(" | ")} |`);
});

test("builds tables larger than the initial picker size", () => {
  const lines = buildInsertedMarkdownTable(21, 23).split("\n");

  assert.equal(lines.length, 22);
  assert.match(lines[0], /\| 列23 \|$/u);
});

test("rejects dimensions outside the supported integer range", () => {
  for (const [rowCount, columnCount] of [
    [0, 1],
    [1, 0],
    [1.5, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ]) {
    assert.throws(() => buildInsertedMarkdownTable(rowCount, columnCount), RangeError);
  }
});

test("anchors the first table cell center to the menu activation point", () => {
  assert.deepEqual(
    resolveAnchoredDialogGroupPosition({
      anchorOffsetX: 11.5,
      anchorOffsetY: 67.5,
      anchorX: 600,
      anchorY: 400,
      groupHeight: 476,
      groupWidth: 422,
      margin: 12,
      viewportHeight: 900,
      viewportWidth: 1200,
    }),
    { left: 588.5, top: 332.5 },
  );
});

test("moves the complete table dialog group inside viewport edges", () => {
  const input = {
    anchorOffsetX: 11.5,
    anchorOffsetY: 67.5,
    groupHeight: 476,
    groupWidth: 422,
    margin: 12,
    viewportHeight: 900,
    viewportWidth: 1200,
  };

  assert.deepEqual(
    resolveAnchoredDialogGroupPosition({ ...input, anchorX: 0, anchorY: 0 }),
    { left: 12, top: 12 },
  );
  assert.deepEqual(
    resolveAnchoredDialogGroupPosition({ ...input, anchorX: 1200, anchorY: 900 }),
    { left: 766, top: 412 },
  );
});
