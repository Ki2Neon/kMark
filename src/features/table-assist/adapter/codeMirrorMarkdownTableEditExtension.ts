import { EditorSelection, Prec, type EditorState, type Extension, type Text } from "@codemirror/state";
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";

type TableAlignment = "default" | "left" | "center" | "right";

type MarkdownTableCell = {
  readonly columnIndex: number;
  readonly contentFrom: number;
  readonly contentTo: number;
  readonly rawFrom: number;
  readonly rawTo: number;
  readonly text: string;
};

type MarkdownTableRow = {
  readonly cells: readonly MarkdownTableCell[];
  readonly kind: "header" | "body";
  readonly lineNumber: number;
};

type MarkdownTable = {
  readonly alignments: readonly TableAlignment[];
  readonly columnCount: number;
  readonly endLineNumber: number;
  readonly rows: readonly MarkdownTableRow[];
  readonly separatorLineNumber: number;
  readonly startLineNumber: number;
};

type ActiveTableCell = {
  readonly cell: MarkdownTableCell;
  readonly columnIndex: number;
  readonly row: MarkdownTableRow;
  readonly rowIndex: number;
  readonly table: MarkdownTable;
};

type TableCellSelection = {
  readonly endColumnIndex: number;
  readonly endRowIndex: number;
  readonly startColumnIndex: number;
  readonly startRowIndex: number;
  readonly table: MarkdownTable;
};

const TABLE_TOOLBAR_CLASS = "cm-markdownTableToolbar";

export function createCodeMirrorMarkdownTableEditExtension(): Extension {
  return [
    markdownTableEditTheme,
    ViewPlugin.fromClass(MarkdownTableEditToolbarPlugin),
    EditorView.domEventHandlers({
      copy(event, view) {
        return copySelectedTableCells(event, view);
      },
      paste(event, view) {
        return pasteTabularText(event, view);
      },
    }),
    Prec.highest(keymap.of([
      { key: "Tab", run: (view) => moveActiveTableCell(view, "right") },
      { key: "Shift-Tab", run: (view) => moveActiveTableCell(view, "left") },
      { key: "Enter", run: (view) => moveActiveTableCell(view, "down") },
      { key: "Ctrl-Enter", run: (view) => insertTableRow(view, "below") },
      { key: "Ctrl-Shift-Enter", run: (view) => insertTableRow(view, "above") },
      { key: "Ctrl-ArrowLeft", run: (view) => moveActiveTableCellToEdge(view, "left") },
      { key: "Ctrl-ArrowRight", run: (view) => moveActiveTableCellToEdge(view, "right") },
      { key: "Ctrl-ArrowUp", run: (view) => moveActiveTableCellToEdge(view, "up") },
      { key: "Ctrl-ArrowDown", run: (view) => moveActiveTableCellToEdge(view, "down") },
      { key: "Delete", run: clearSelectedTableCells },
    ])),
  ];
}

class MarkdownTableEditToolbarPlugin {
  readonly #view: EditorView;
  readonly #toolbar: HTMLDivElement;

  constructor(view: EditorView) {
    this.#view = view;
    this.#toolbar = createTableToolbar(view);
    this.#view.dom.append(this.#toolbar);
    this.updateToolbar();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged || update.geometryChanged) {
      this.updateToolbar();
    }
  }

  destroy(): void {
    this.#toolbar.remove();
  }

  updateToolbar(): void {
    const activeCell = getActiveTableCell(this.#view.state);

    if (activeCell === null || !this.#view.hasFocus) {
      this.#toolbar.dataset.visible = "false";
      return;
    }

    const coordinates = this.#view.coordsAtPos(activeCell.cell.contentFrom);

    if (coordinates === null) {
      this.#toolbar.dataset.visible = "false";
      return;
    }

    const editorCoordinates = this.#view.dom.getBoundingClientRect();
    this.#toolbar.dataset.visible = "true";
    this.#toolbar.style.left = `${Math.max(8, coordinates.left - editorCoordinates.left)}px`;
    this.#toolbar.style.top = `${Math.max(8, coordinates.top - editorCoordinates.top - this.#toolbar.offsetHeight - 6)}px`;
  }
}

function createTableToolbar(view: EditorView): HTMLDivElement {
  const toolbar = document.createElement("div");
  toolbar.className = TABLE_TOOLBAR_CLASS;
  toolbar.dataset.visible = "false";

  const groups: readonly (readonly (readonly [string, string, () => boolean])[])[] = [
    [
      ["R+", "Insert row above", () => insertTableRow(view, "above")],
      ["+R", "Insert row below", () => insertTableRow(view, "below")],
      ["R-", "Delete row", () => deleteTableRow(view)],
      ["RU", "Move row up", () => moveTableRow(view, "up")],
      ["RD", "Move row down", () => moveTableRow(view, "down")],
    ],
    [
      ["C+", "Insert column left", () => insertTableColumn(view, "left")],
      ["+C", "Insert column right", () => insertTableColumn(view, "right")],
      ["C-", "Delete column", () => deleteTableColumn(view)],
      ["CL", "Move column left", () => moveTableColumn(view, "left")],
      ["CR", "Move column right", () => moveTableColumn(view, "right")],
    ],
    [
      ["L", "Align left", () => setTableColumnAlignment(view, "left")],
      ["C", "Align center", () => setTableColumnAlignment(view, "center")],
      ["R", "Align right", () => setTableColumnAlignment(view, "right")],
      ["M", "Merge selected cells", () => mergeSelectedTableCells(view)],
      ["S", "Split merged cell", () => splitMergedTableCell(view)],
    ],
  ];

  for (const group of groups) {
    const groupElement = document.createElement("div");
    groupElement.className = `${TABLE_TOOLBAR_CLASS}__group`;

    for (const [label, title, run] of group) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        view.focus();
        run();
      });
      groupElement.append(button);
    }

    toolbar.append(groupElement);
  }

  return toolbar;
}

function getActiveTableCell(state: EditorState): ActiveTableCell | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }

  return getTableCellAtPosition(state, state.selection.main.head);
}

function getTableCellAtPosition(state: EditorState, position: number): ActiveTableCell | null {
  const table = findMarkdownTableAtPosition(state, position);

  if (table === null) {
    return null;
  }

  return findCellInTable(state, table, position);
}

function findCellInTable(state: EditorState, table: MarkdownTable, position: number): ActiveTableCell | null {
  const lineNumber = state.doc.lineAt(clamp(position, 0, state.doc.length)).number;
  const rowIndex = table.rows.findIndex((row) => row.lineNumber === lineNumber);

  if (rowIndex === -1) {
    return null;
  }

  const row = table.rows[rowIndex];
  const fallbackCell = row.cells[row.cells.length - 1];

  for (const cell of row.cells) {
    if (position >= cell.rawFrom && position <= cell.rawTo) {
      return {
        cell,
        columnIndex: cell.columnIndex,
        row,
        rowIndex,
        table,
      };
    }
  }

  if (fallbackCell === undefined || position < row.cells[0].contentFrom) {
    const firstCell = row.cells[0];

    return firstCell === undefined
      ? null
      : { cell: firstCell, columnIndex: firstCell.columnIndex, row, rowIndex, table };
  }

  return {
    cell: fallbackCell,
    columnIndex: fallbackCell.columnIndex,
    row,
    rowIndex,
    table,
  };
}

function findMarkdownTableAtPosition(state: EditorState, position: number): MarkdownTable | null {
  const currentLineNumber = state.doc.lineAt(clamp(position, 0, state.doc.length)).number;
  let blockStartLineNumber = currentLineNumber;

  while (blockStartLineNumber > 1 && hasTableDelimiterPipe(state.doc.line(blockStartLineNumber - 1).text)) {
    blockStartLineNumber -= 1;
  }

  let blockEndLineNumber = currentLineNumber;

  while (blockEndLineNumber < state.doc.lines && hasTableDelimiterPipe(state.doc.line(blockEndLineNumber + 1).text)) {
    blockEndLineNumber += 1;
  }

  for (
    let candidateStartLineNumber = blockStartLineNumber;
    candidateStartLineNumber < blockEndLineNumber;
    candidateStartLineNumber += 1
  ) {
    const separatorLineNumber = candidateStartLineNumber + 1;

    if (!isMarkdownTableSeparatorLine(state.doc.line(separatorLineNumber).text)) {
      continue;
    }

    const tableEndLineNumber = collectTableEndLineNumber(state.doc, candidateStartLineNumber);

    if (currentLineNumber < candidateStartLineNumber || currentLineNumber > tableEndLineNumber) {
      continue;
    }

    return parseMarkdownTable(state.doc, candidateStartLineNumber, tableEndLineNumber);
  }

  return null;
}

function collectTableEndLineNumber(doc: Text, startLineNumber: number): number {
  let lineNumber = startLineNumber + 2;

  while (lineNumber <= doc.lines && hasTableDelimiterPipe(doc.line(lineNumber).text)) {
    lineNumber += 1;
  }

  return lineNumber - 1;
}

function parseMarkdownTable(doc: Text, startLineNumber: number, endLineNumber: number): MarkdownTable | null {
  const headerLine = doc.line(startLineNumber);
  const separatorLine = doc.line(startLineNumber + 1);
  const headerCells = splitTableRowCells(headerLine.text, headerLine.from);
  const separatorCells = splitTableRowCells(separatorLine.text, separatorLine.from);
  const columnCount = Math.max(headerCells.length, separatorCells.length);

  if (columnCount === 0 || !separatorCells.every((cell) => isMarkdownTableSeparatorCell(cell.text))) {
    return null;
  }

  const rows: MarkdownTableRow[] = [
    {
      cells: normalizeRowCells(headerCells, columnCount),
      kind: "header",
      lineNumber: startLineNumber,
    },
  ];

  for (let lineNumber = startLineNumber + 2; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = doc.line(lineNumber);
    rows.push({
      cells: normalizeRowCells(splitTableRowCells(line.text, line.from), columnCount),
      kind: "body",
      lineNumber,
    });
  }

  return {
    alignments: normalizeAlignments(separatorCells.map((cell) => parseAlignmentCell(cell.text)), columnCount),
    columnCount,
    endLineNumber,
    rows,
    separatorLineNumber: startLineNumber + 1,
    startLineNumber,
  };
}

function normalizeRowCells(cells: readonly MarkdownTableCell[], columnCount: number): readonly MarkdownTableCell[] {
  if (cells.length >= columnCount) {
    return cells.slice(0, columnCount);
  }

  const nextCells = [...cells];
  const lastCell = cells[cells.length - 1];
  const fallbackPosition = lastCell?.contentTo ?? 0;

  for (let columnIndex = cells.length; columnIndex < columnCount; columnIndex += 1) {
    nextCells.push({
      columnIndex,
      contentFrom: fallbackPosition,
      contentTo: fallbackPosition,
      rawFrom: fallbackPosition,
      rawTo: fallbackPosition,
      text: "",
    });
  }

  return nextCells;
}

function normalizeAlignments(alignments: readonly TableAlignment[], columnCount: number): readonly TableAlignment[] {
  return Array.from({ length: columnCount }, (_value, index) => alignments[index] ?? "default");
}

function splitTableRowCells(lineText: string, lineFrom: number): readonly MarkdownTableCell[] {
  const pipeOffsets = collectTablePipeOffsets(lineText);

  if (pipeOffsets.length === 0) {
    return [];
  }

  const cells: MarkdownTableCell[] = [];
  const hasLeadingPipe = pipeOffsets[0] === 0;
  const hasTrailingPipe = pipeOffsets[pipeOffsets.length - 1] === lineText.length - 1;
  let contentStart = hasLeadingPipe ? pipeOffsets[0] + 1 : 0;
  let columnIndex = 0;

  for (const pipeOffset of pipeOffsets) {
    if (hasLeadingPipe && pipeOffset === 0) {
      continue;
    }

    cells.push(createTableCell(lineText, lineFrom, columnIndex, contentStart, pipeOffset));
    columnIndex += 1;
    contentStart = pipeOffset + 1;
  }

  if (!hasTrailingPipe) {
    cells.push(createTableCell(lineText, lineFrom, columnIndex, contentStart, lineText.length));
  }

  return cells;
}

function createTableCell(
  lineText: string,
  lineFrom: number,
  columnIndex: number,
  rawStart: number,
  rawEnd: number,
): MarkdownTableCell {
  let contentStart = rawStart;
  let contentEnd = rawEnd;

  while (contentStart < contentEnd && isHorizontalWhitespace(lineText[contentStart])) {
    contentStart += 1;
  }

  while (contentEnd > contentStart && isHorizontalWhitespace(lineText[contentEnd - 1])) {
    contentEnd -= 1;
  }

  return {
    columnIndex,
    contentFrom: lineFrom + contentStart,
    contentTo: lineFrom + contentEnd,
    rawFrom: lineFrom + rawStart,
    rawTo: lineFrom + rawEnd,
    text: lineText.slice(contentStart, contentEnd),
  };
}

function collectTablePipeOffsets(lineText: string): readonly number[] {
  const pipeOffsets: number[] = [];
  let codeSpanTicks: number | null = null;

  for (let offset = 0; offset < lineText.length;) {
    const character = lineText[offset];

    if (character === "\\") {
      offset += readCodePoint(lineText, offset).length;
      if (offset < lineText.length) {
        offset += readCodePoint(lineText, offset).length;
      }
      continue;
    }

    if (character === "`") {
      const tickCount = countConsecutiveCharacters(lineText, offset, "`");

      if (codeSpanTicks === null) {
        codeSpanTicks = tickCount;
      } else if (tickCount === codeSpanTicks) {
        codeSpanTicks = null;
      }

      offset += tickCount;
      continue;
    }

    if (character === "|" && codeSpanTicks === null) {
      pipeOffsets.push(offset);
    }

    offset += readCodePoint(lineText, offset).length;
  }

  return pipeOffsets;
}

function hasTableDelimiterPipe(lineText: string): boolean {
  return collectTablePipeOffsets(lineText).length > 0;
}

function isMarkdownTableSeparatorLine(lineText: string): boolean {
  const cells = splitTableRowCells(lineText, 0);

  return cells.length > 0 && cells.every((cell) => isMarkdownTableSeparatorCell(cell.text));
}

function isMarkdownTableSeparatorCell(cellText: string): boolean {
  return /^:?-+:?$/u.test(cellText.trim());
}

function parseAlignmentCell(cellText: string): TableAlignment {
  const trimmed = cellText.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");

  if (left && right) {
    return "center";
  }

  if (left) {
    return "left";
  }

  if (right) {
    return "right";
  }

  return "default";
}

function matrixFromTable(table: MarkdownTable): string[][] {
  return table.rows.map((row) => row.cells.map((cell) => cell.text));
}

function buildTableLines(cells: readonly (readonly string[])[], alignments: readonly TableAlignment[]): readonly string[] {
  const columnCount = Math.max(1, alignments.length, ...cells.map((row) => row.length));
  const normalizedRows = cells.map((row) => Array.from({ length: columnCount }, (_value, index) => row[index] ?? ""));

  return [
    formatTableRow(normalizedRows[0] ?? Array.from({ length: columnCount }, () => "")),
    formatSeparatorRow(normalizeAlignments(alignments, columnCount)),
    ...normalizedRows.slice(1).map(formatTableRow),
  ];
}

function formatTableRow(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function formatSeparatorRow(alignments: readonly TableAlignment[]): string {
  return formatTableRow(alignments.map(formatAlignmentCell));
}

function formatAlignmentCell(alignment: TableAlignment): string {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    case "default":
      return "---";
  }
}

function replaceTable(
  view: EditorView,
  table: MarkdownTable,
  cells: readonly (readonly string[])[],
  alignments: readonly TableAlignment[],
  targetRowIndex: number,
  targetColumnIndex: number,
): boolean {
  const startLine = view.state.doc.line(table.startLineNumber);
  const endLine = view.state.doc.line(table.endLineNumber);
  const lines = buildTableLines(cells, alignments);

  view.dispatch({
    changes: {
      from: startLine.from,
      insert: lines.join("\n"),
      to: endLine.to,
    },
  });

  selectTableCell(view, table.startLineNumber + targetRowIndex + (targetRowIndex === 0 ? 0 : 1), targetColumnIndex);
  return true;
}

function selectTableCell(view: EditorView, sourceLineNumber: number, columnIndex: number): void {
  const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, sourceLineNumber)));
  const activeCell = getTableCellAtPosition(view.state, line.from);
  const table = activeCell?.table ?? findMarkdownTableAtPosition(view.state, line.from);
  const row = table?.rows.find((candidate) => candidate.lineNumber === line.number);
  const cell = row?.cells[Math.min(Math.max(0, columnIndex), row.cells.length - 1)];

  if (cell === undefined) {
    return;
  }

  const selection = EditorSelection.single(cell.contentFrom, cell.contentTo);

  view.dispatch({
    effects: EditorView.scrollIntoView(cell.contentFrom, { y: "center" }),
    selection,
  });
}

function moveActiveTableCell(view: EditorView, direction: "left" | "right" | "down"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  let rowIndex = activeCell.rowIndex;
  let columnIndex = activeCell.columnIndex;

  if (direction === "right") {
    columnIndex += 1;
    if (columnIndex >= activeCell.table.columnCount) {
      columnIndex = 0;
      rowIndex = Math.min(activeCell.table.rows.length - 1, rowIndex + 1);
    }
  } else if (direction === "left") {
    columnIndex -= 1;
    if (columnIndex < 0) {
      rowIndex = Math.max(0, rowIndex - 1);
      columnIndex = activeCell.table.columnCount - 1;
    }
  } else {
    rowIndex = Math.min(activeCell.table.rows.length - 1, rowIndex + 1);
  }

  const targetRow = activeCell.table.rows[rowIndex];
  const targetCell = targetRow.cells[Math.min(columnIndex, targetRow.cells.length - 1)];

  if (targetCell === undefined) {
    return false;
  }

  view.dispatch({
    effects: EditorView.scrollIntoView(targetCell.contentFrom, { y: "center" }),
    selection: EditorSelection.single(targetCell.contentFrom, targetCell.contentTo),
  });
  return true;
}

function moveActiveTableCellToEdge(view: EditorView, direction: "left" | "right" | "up" | "down"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  const rowIndex = direction === "up"
    ? 0
    : direction === "down"
      ? activeCell.table.rows.length - 1
      : activeCell.rowIndex;
  const columnIndex = direction === "left"
    ? 0
    : direction === "right"
      ? activeCell.table.columnCount - 1
      : activeCell.columnIndex;
  const targetRow = activeCell.table.rows[rowIndex];
  const targetCell = targetRow.cells[Math.min(columnIndex, targetRow.cells.length - 1)];

  if (targetCell === undefined) {
    return false;
  }

  view.dispatch({
    effects: EditorView.scrollIntoView(targetCell.contentFrom, { y: "center" }),
    selection: EditorSelection.single(targetCell.contentFrom, targetCell.contentTo),
  });
  return true;
}

function insertTableRow(view: EditorView, position: "above" | "below"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table);
  const newRow = Array.from({ length: activeCell.table.columnCount }, () => "");
  const insertIndex = position === "above"
    ? Math.max(1, activeCell.rowIndex)
    : Math.max(1, activeCell.rowIndex + 1);

  cells.splice(insertIndex, 0, newRow);
  return replaceTable(view, activeCell.table, cells, activeCell.table.alignments, insertIndex, activeCell.columnIndex);
}

function deleteTableRow(view: EditorView): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null || activeCell.row.kind === "header") {
    return false;
  }

  const cells = matrixFromTable(activeCell.table);

  cells.splice(activeCell.rowIndex, 1);

  if (cells.length === 1) {
    cells.push(Array.from({ length: activeCell.table.columnCount }, () => ""));
  }

  const targetRowIndex = Math.min(activeCell.rowIndex, cells.length - 1);

  return replaceTable(view, activeCell.table, cells, activeCell.table.alignments, targetRowIndex, activeCell.columnIndex);
}

function moveTableRow(view: EditorView, direction: "up" | "down"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null || activeCell.row.kind === "header") {
    return false;
  }

  const targetRowIndex = direction === "up" ? activeCell.rowIndex - 1 : activeCell.rowIndex + 1;

  if (targetRowIndex < 1 || targetRowIndex >= activeCell.table.rows.length) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table);
  const movingRow = cells[activeCell.rowIndex];
  const targetRow = cells[targetRowIndex];

  cells[activeCell.rowIndex] = targetRow;
  cells[targetRowIndex] = movingRow;

  return replaceTable(view, activeCell.table, cells, activeCell.table.alignments, targetRowIndex, activeCell.columnIndex);
}

function insertTableColumn(view: EditorView, position: "left" | "right"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  const insertIndex = position === "left" ? activeCell.columnIndex : activeCell.columnIndex + 1;
  const cells = matrixFromTable(activeCell.table).map((row) => {
    const nextRow = [...row];
    nextRow.splice(insertIndex, 0, "");
    return nextRow;
  });
  const alignments = [...activeCell.table.alignments];

  alignments.splice(insertIndex, 0, "default");
  return replaceTable(view, activeCell.table, cells, alignments, activeCell.rowIndex, insertIndex);
}

function deleteTableColumn(view: EditorView): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null || activeCell.table.columnCount <= 1) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table).map((row) => row.filter((_cell, index) => index !== activeCell.columnIndex));
  const alignments = activeCell.table.alignments.filter((_alignment, index) => index !== activeCell.columnIndex);
  const targetColumnIndex = Math.min(activeCell.columnIndex, activeCell.table.columnCount - 2);

  return replaceTable(view, activeCell.table, cells, alignments, activeCell.rowIndex, targetColumnIndex);
}

function moveTableColumn(view: EditorView, direction: "left" | "right"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  const targetColumnIndex = direction === "left" ? activeCell.columnIndex - 1 : activeCell.columnIndex + 1;

  if (targetColumnIndex < 0 || targetColumnIndex >= activeCell.table.columnCount) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table).map((row) => swapArrayItems(row, activeCell.columnIndex, targetColumnIndex));
  const alignments = swapArrayItems([...activeCell.table.alignments], activeCell.columnIndex, targetColumnIndex);

  return replaceTable(view, activeCell.table, cells, alignments, activeCell.rowIndex, targetColumnIndex);
}

function setTableColumnAlignment(view: EditorView, alignment: TableAlignment): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  const alignments = [...activeCell.table.alignments];
  alignments[activeCell.columnIndex] = alignment;

  return replaceTable(view, activeCell.table, matrixFromTable(activeCell.table), alignments, activeCell.rowIndex, activeCell.columnIndex);
}

function clearSelectedTableCells(view: EditorView): boolean {
  const selection = getSelectedTableCells(view.state) ?? selectedRangeFromActiveCell(view.state);

  if (selection === null) {
    return false;
  }

  const cells = matrixFromTable(selection.table);

  for (let rowIndex = selection.startRowIndex; rowIndex <= selection.endRowIndex; rowIndex += 1) {
    for (let columnIndex = selection.startColumnIndex; columnIndex <= selection.endColumnIndex; columnIndex += 1) {
      cells[rowIndex][columnIndex] = "";
    }
  }

  return replaceTable(
    view,
    selection.table,
    cells,
    selection.table.alignments,
    selection.startRowIndex,
    selection.startColumnIndex,
  );
}

function mergeSelectedTableCells(view: EditorView): boolean {
  const selection = getSelectedTableCells(view.state);

  if (selection === null || selection.startRowIndex === 0) {
    return false;
  }

  if (selection.startRowIndex === selection.endRowIndex && selection.startColumnIndex === selection.endColumnIndex) {
    return false;
  }

  const cells = matrixFromTable(selection.table);

  for (let rowIndex = selection.startRowIndex; rowIndex <= selection.endRowIndex; rowIndex += 1) {
    for (let columnIndex = selection.startColumnIndex; columnIndex <= selection.endColumnIndex; columnIndex += 1) {
      if (rowIndex === selection.startRowIndex && columnIndex === selection.startColumnIndex) {
        continue;
      }

      const trimmed = cells[rowIndex][columnIndex].trim();
      if (trimmed !== "" && trimmed !== "<" && trimmed !== "^") {
        return false;
      }
    }
  }

  for (let rowIndex = selection.startRowIndex; rowIndex <= selection.endRowIndex; rowIndex += 1) {
    for (let columnIndex = selection.startColumnIndex; columnIndex <= selection.endColumnIndex; columnIndex += 1) {
      if (rowIndex === selection.startRowIndex && columnIndex === selection.startColumnIndex) {
        continue;
      }

      cells[rowIndex][columnIndex] = columnIndex === selection.startColumnIndex ? "^" : "<";
    }
  }

  return replaceTable(
    view,
    selection.table,
    cells,
    selection.table.alignments,
    selection.startRowIndex,
    selection.startColumnIndex,
  );
}

function splitMergedTableCell(view: EditorView): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null || activeCell.row.kind === "header") {
    return false;
  }

  const region = findMergeRegionContainingCell(activeCell.table, activeCell.rowIndex, activeCell.columnIndex);

  if (region === null) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table);

  for (let rowIndex = region.startRowIndex; rowIndex <= region.endRowIndex; rowIndex += 1) {
    for (let columnIndex = region.startColumnIndex; columnIndex <= region.endColumnIndex; columnIndex += 1) {
      if (rowIndex === region.startRowIndex && columnIndex === region.startColumnIndex) {
        continue;
      }

      cells[rowIndex][columnIndex] = "";
    }
  }

  return replaceTable(
    view,
    activeCell.table,
    cells,
    activeCell.table.alignments,
    region.startRowIndex,
    region.startColumnIndex,
  );
}

function getSelectedTableCells(state: EditorState): TableCellSelection | null {
  if (state.selection.ranges.length !== 1 || state.selection.main.empty) {
    return null;
  }

  const range = state.selection.main;
  const anchorCell = getTableCellAtPosition(state, range.from);
  const headCell = getTableCellAtPosition(state, Math.max(range.from, range.to - 1));

  if (anchorCell === null || headCell === null || anchorCell.table.startLineNumber !== headCell.table.startLineNumber) {
    return null;
  }

  return {
    endColumnIndex: Math.max(anchorCell.columnIndex, headCell.columnIndex),
    endRowIndex: Math.max(anchorCell.rowIndex, headCell.rowIndex),
    startColumnIndex: Math.min(anchorCell.columnIndex, headCell.columnIndex),
    startRowIndex: Math.min(anchorCell.rowIndex, headCell.rowIndex),
    table: anchorCell.table,
  };
}

function selectedRangeFromActiveCell(state: EditorState): TableCellSelection | null {
  const activeCell = getActiveTableCell(state);

  if (activeCell === null) {
    return null;
  }

  return {
    endColumnIndex: activeCell.columnIndex,
    endRowIndex: activeCell.rowIndex,
    startColumnIndex: activeCell.columnIndex,
    startRowIndex: activeCell.rowIndex,
    table: activeCell.table,
  };
}

function findMergeRegionContainingCell(
  table: MarkdownTable,
  rowIndex: number,
  columnIndex: number,
): TableCellSelection | null {
  for (let candidateRowIndex = rowIndex; candidateRowIndex >= 1; candidateRowIndex -= 1) {
    for (let candidateColumnIndex = columnIndex; candidateColumnIndex >= 0; candidateColumnIndex -= 1) {
      const region = findMergeRegionFromRoot(table, candidateRowIndex, candidateColumnIndex);

      if (
        region !== null
        && rowIndex >= region.startRowIndex
        && rowIndex <= region.endRowIndex
        && columnIndex >= region.startColumnIndex
        && columnIndex <= region.endColumnIndex
      ) {
        return region;
      }
    }
  }

  return null;
}

function findMergeRegionFromRoot(table: MarkdownTable, rowIndex: number, columnIndex: number): TableCellSelection | null {
  const rootCell = table.rows[rowIndex]?.cells[columnIndex];

  if (rootCell === undefined || isMergeMarker(rootCell.text)) {
    return null;
  }

  let endColumnIndex = columnIndex;
  while (table.rows[rowIndex]?.cells[endColumnIndex + 1]?.text.trim() === "<") {
    endColumnIndex += 1;
  }

  let endRowIndex = rowIndex;
  while (endRowIndex + 1 < table.rows.length && table.rows[endRowIndex + 1]?.cells[columnIndex]?.text.trim() === "^") {
    let rectangular = true;

    for (let scanColumnIndex = columnIndex + 1; scanColumnIndex <= endColumnIndex; scanColumnIndex += 1) {
      if (table.rows[endRowIndex + 1]?.cells[scanColumnIndex]?.text.trim() !== "<") {
        rectangular = false;
        break;
      }
    }

    if (!rectangular) {
      break;
    }

    endRowIndex += 1;
  }

  if (endRowIndex === rowIndex && endColumnIndex === columnIndex) {
    return null;
  }

  return {
    endColumnIndex,
    endRowIndex,
    startColumnIndex: columnIndex,
    startRowIndex: rowIndex,
    table,
  };
}

function copySelectedTableCells(event: ClipboardEvent, view: EditorView): boolean {
  const selection = getSelectedTableCells(view.state);

  if (selection === null || event.clipboardData === null) {
    return false;
  }

  const cells = matrixFromTable(selection.table);
  const text = cells
    .slice(selection.startRowIndex, selection.endRowIndex + 1)
    .map((row) => row.slice(selection.startColumnIndex, selection.endColumnIndex + 1).join("\t"))
    .join("\n");

  event.clipboardData.setData("text/plain", text);
  event.preventDefault();
  return true;
}

function pasteTabularText(event: ClipboardEvent, view: EditorView): boolean {
  const activeCell = getActiveTableCell(view.state);
  const clipboardText = event.clipboardData?.getData("text/plain") ?? "";

  if (activeCell === null || !isTabularText(clipboardText)) {
    return false;
  }

  const pastedCells = clipboardText.includes("\t")
    ? parseTsv(clipboardText)
    : parseCsv(clipboardText);

  if (pastedCells.length === 0 || pastedCells.every((row) => row.length === 0)) {
    return false;
  }

  const cells = matrixFromTable(activeCell.table).map((row) => [...row]);
  const requiredRowCount = activeCell.rowIndex + pastedCells.length;
  const requiredColumnCount = activeCell.columnIndex + Math.max(...pastedCells.map((row) => row.length));

  while (cells.length < requiredRowCount) {
    cells.push(Array.from({ length: activeCell.table.columnCount }, () => ""));
  }

  for (const row of cells) {
    while (row.length < requiredColumnCount) {
      row.push("");
    }
  }

  const alignments = [...activeCell.table.alignments];
  while (alignments.length < requiredColumnCount) {
    alignments.push("default");
  }

  for (let rowOffset = 0; rowOffset < pastedCells.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < pastedCells[rowOffset].length; columnOffset += 1) {
      cells[activeCell.rowIndex + rowOffset][activeCell.columnIndex + columnOffset] = pastedCells[rowOffset][columnOffset];
    }
  }

  event.preventDefault();
  return replaceTable(
    view,
    activeCell.table,
    cells,
    alignments,
    activeCell.rowIndex + pastedCells.length - 1,
    activeCell.columnIndex + pastedCells[pastedCells.length - 1].length - 1,
  );
}

function isTabularText(text: string): boolean {
  const trimmed = text.trimEnd();

  return trimmed.includes("\t") || (trimmed.includes("\n") && trimmed.includes(","));
}

function parseTsv(text: string): readonly string[][] {
  return text.trimEnd().split(/\r?\n/u).map((line) => line.split("\t"));
}

function parseCsv(text: string): readonly string[][] {
  const rows: string[][] = [[]];
  let field = "";
  let quoted = false;

  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset];

    if (quoted) {
      if (character === "\"" && text[offset + 1] === "\"") {
        field += "\"";
        offset += 1;
        continue;
      }

      if (character === "\"") {
        quoted = false;
        continue;
      }

      field += character;
      continue;
    }

    if (character === "\"") {
      quoted = true;
      continue;
    }

    if (character === ",") {
      rows[rows.length - 1].push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      rows[rows.length - 1].push(field);
      rows.push([]);
      field = "";
      continue;
    }

    if (character !== "\r") {
      field += character;
    }
  }

  rows[rows.length - 1].push(field);

  return rows.filter((row) => row.length > 1 || row[0] !== "");
}

function isMergeMarker(text: string): boolean {
  const trimmed = text.trim();

  return trimmed === "<" || trimmed === "^";
}

function swapArrayItems<T>(items: readonly T[], leftIndex: number, rightIndex: number): T[] {
  const nextItems = [...items];
  const leftItem = nextItems[leftIndex];

  nextItems[leftIndex] = nextItems[rightIndex];
  nextItems[rightIndex] = leftItem;

  return nextItems;
}

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t";
}

function countConsecutiveCharacters(text: string, offset: number, target: string): number {
  let count = 0;

  while (text[offset + count] === target) {
    count += 1;
  }

  return count;
}

function readCodePoint(text: string, offset: number): string {
  const codePoint = text.codePointAt(offset);

  if (codePoint === undefined) {
    return "";
  }

  return String.fromCodePoint(codePoint);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const markdownTableEditTheme = EditorView.theme({
  "&": {
    position: "relative",
  },
  ".cm-markdownTableToolbar": {
    alignItems: "center",
    backgroundColor: "var(--surface-muted)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 8px 24px rgb(0 0 0 / 18%)",
    display: "none",
    gap: "4px",
    padding: "4px",
    position: "absolute",
    zIndex: "20",
  },
  ".cm-markdownTableToolbar[data-visible=\"true\"]": {
    display: "flex",
  },
  ".cm-markdownTableToolbar__group": {
    borderRight: "1px solid var(--border)",
    display: "flex",
    gap: "2px",
    paddingRight: "4px",
  },
  ".cm-markdownTableToolbar__group:last-child": {
    borderRight: "none",
    paddingRight: "0",
  },
  ".cm-markdownTableToolbar button": {
    alignItems: "center",
    backgroundColor: "transparent",
    border: "1px solid transparent",
    borderRadius: "4px",
    color: "var(--text)",
    cursor: "pointer",
    display: "inline-flex",
    font: "600 10px/1 var(--app-font-family)",
    height: "24px",
    justifyContent: "center",
    minWidth: "24px",
    padding: "0 5px",
  },
  ".cm-markdownTableToolbar button:hover": {
    backgroundColor: "color-mix(in srgb, var(--focus) 16%, transparent)",
    borderColor: "var(--border)",
  },
});
