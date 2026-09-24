export function buildInsertedMarkdownTable(rowCount: number, columnCount: number): string {
  assertTableDimension("rowCount", rowCount);
  assertTableDimension("columnCount", columnCount);

  const headerCells = Array.from({ length: columnCount }, (_, index) => `列${index + 1}`);
  const separatorCells = Array.from({ length: columnCount }, () => "---");
  const bodyRow = buildMarkdownTableRow(Array.from({ length: columnCount }, () => ""));
  const lines = [
    buildMarkdownTableRow(headerCells),
    buildMarkdownTableRow(separatorCells),
  ];

  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    lines.push(bodyRow);
  }

  return lines.join("\n");
}

function buildMarkdownTableRow(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function assertTableDimension(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
