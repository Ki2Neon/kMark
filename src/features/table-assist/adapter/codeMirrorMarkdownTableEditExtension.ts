import { EditorSelection, Prec, Transaction, type EditorState, type Extension, type Text } from "@codemirror/state";
import { EditorView, keymap, ViewPlugin } from "@codemirror/view";
import { formatMarkdownTablesInLineRanges } from "../../../adapters/browser/browserRustCore";
import { resolveMarkdownTableFormatTextChanges } from "./markdownTableFormatTextChanges";

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

type TableContextMenuState = {
  readonly cleanup: () => void;
  readonly element: HTMLDivElement;
  readonly view: EditorView;
};

type TableContextMenuItem = {
  readonly disabled?: boolean;
  readonly icon: string;
  readonly label: string;
  readonly run: (view: EditorView) => boolean;
};

let activeTableContextMenu: TableContextMenuState | null = null;
const INSERTED_MARKDOWN_TABLE = "| 列1 | 列2 |\n| --- | --- |\n|  |  |";

export function createCodeMirrorMarkdownTableEditExtension(): Extension {
  return [
    markdownTableContextMenuTheme,
    ViewPlugin.fromClass(MarkdownTableContextMenuCleanupPlugin),
    EditorView.domEventHandlers({
      contextmenu(event, view) {
        return openEditorContextMenu(event, view);
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
      { key: "Mod-Alt-Enter", run: (view) => deleteTableRow(view) },
      { key: "Mod-Alt-ArrowLeft", run: (view) => insertTableColumn(view, "left") },
      { key: "Mod-Alt-ArrowRight", run: (view) => insertTableColumn(view, "right") },
      { key: "Mod-Alt-Backspace", run: deleteTableColumn },
      { key: "Shift-Mod-Alt-ArrowLeft", run: (view) => moveTableColumn(view, "left") },
      { key: "Shift-Mod-Alt-ArrowRight", run: (view) => moveTableColumn(view, "right") },
      { key: "Mod-Alt-l", run: (view) => setTableColumnAlignment(view, "left") },
      { key: "Mod-Alt-e", run: (view) => setTableColumnAlignment(view, "center") },
      { key: "Mod-Alt-r", run: (view) => setTableColumnAlignment(view, "right") },
      { key: "Mod-Alt-m", run: mergeSelectedTableCells },
      { key: "Mod-Alt-u", run: splitMergedTableCell },
    ])),
  ];
}

class MarkdownTableContextMenuCleanupPlugin {
  readonly #view: EditorView;

  constructor(view: EditorView) {
    this.#view = view;
  }

  destroy(): void {
    if (activeTableContextMenu?.view === this.#view) {
      closeActiveTableContextMenu();
    }
  }
}

function openEditorContextMenu(event: MouseEvent, view: EditorView): boolean {
  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });

  if (position === null) {
    return false;
  }

  const clickedCell = getTableCellAtPosition(view.state, position);

  event.preventDefault();
  event.stopPropagation();
  view.focus();

  if (clickedCell === null) {
    view.dispatch({
      selection: EditorSelection.cursor(position),
    });
  } else if (!isCellInsideSelectedTableRange(view.state, clickedCell)) {
    view.dispatch({
      selection: EditorSelection.single(clickedCell.cell.contentFrom, clickedCell.cell.contentTo),
    });
  }

  const activeCell = clickedCell === null
    ? null
    : getTableCellAtPosition(view.state, clickedCell.cell.contentFrom) ?? clickedCell;
  closeActiveTableContextMenu();

  const menu = createEditorContextMenu(view, activeCell);
  view.dom.append(menu);
  positionTableContextMenu(menu, event.clientX, event.clientY);

  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const closeOnOutsidePointer = (pointerEvent: PointerEvent) => {
    if (pointerEvent.target instanceof Node && menu.contains(pointerEvent.target)) {
      return;
    }

    closeActiveTableContextMenu();
  };
  const closeOnKeyDown = (keyboardEvent: KeyboardEvent) => {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeActiveTableContextMenu();
      view.focus();
    }
  };
  const closeOnLayoutChange = () => {
    closeActiveTableContextMenu();
  };

  ownerDocument.addEventListener("pointerdown", closeOnOutsidePointer, true);
  ownerDocument.addEventListener("keydown", closeOnKeyDown, true);
  view.scrollDOM.addEventListener("scroll", closeOnLayoutChange, true);
  ownerWindow?.addEventListener("resize", closeOnLayoutChange);

  activeTableContextMenu = {
    cleanup: () => {
      ownerDocument.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      ownerDocument.removeEventListener("keydown", closeOnKeyDown, true);
      view.scrollDOM.removeEventListener("scroll", closeOnLayoutChange, true);
      ownerWindow?.removeEventListener("resize", closeOnLayoutChange);
    },
    element: menu,
    view,
  };

  return true;
}

function createEditorContextMenu(view: EditorView, activeCell: ActiveTableCell | null): HTMLDivElement {
  const ownerDocument = view.dom.ownerDocument;
  const menu = ownerDocument.createElement("div");
  menu.className = "cm-markdownTableContextMenu";
  menu.role = "menu";

  const groups: (readonly TableContextMenuItem[])[] = [];

  if (activeCell === null) {
    groups.push([{ icon: "+", label: "表を追加", run: insertMarkdownTable }]);
  }

  if (activeCell !== null) {
    groups.push([
      { icon: "↑", label: "上に行を追加", run: (targetView) => insertTableRow(targetView, "above") },
      { icon: "↓", label: "下に行を追加", run: (targetView) => insertTableRow(targetView, "below") },
      { icon: "−", label: "行を削除", run: deleteTableRow, disabled: activeCell.row.kind === "header" },
      {
        disabled: activeCell.row.kind === "header" || activeCell.rowIndex <= 1,
        icon: "↑",
        label: "行を上へ移動",
        run: (targetView) => moveTableRow(targetView, "up"),
      },
      {
        disabled: activeCell.row.kind === "header" || activeCell.rowIndex >= activeCell.table.rows.length - 1,
        icon: "↓",
        label: "行を下へ移動",
        run: (targetView) => moveTableRow(targetView, "down"),
      },
    ]);
    groups.push([
      { icon: "←", label: "左に列を追加", run: (targetView) => insertTableColumn(targetView, "left") },
      { icon: "→", label: "右に列を追加", run: (targetView) => insertTableColumn(targetView, "right") },
      {
        disabled: activeCell.table.columnCount <= 1,
        icon: "−",
        label: "列を削除",
        run: deleteTableColumn,
      },
      {
        disabled: activeCell.columnIndex <= 0,
        icon: "←",
        label: "列を左へ移動",
        run: (targetView) => moveTableColumn(targetView, "left"),
      },
      {
        disabled: activeCell.columnIndex >= activeCell.table.columnCount - 1,
        icon: "→",
        label: "列を右へ移動",
        run: (targetView) => moveTableColumn(targetView, "right"),
      },
    ]);
    groups.push([
      { icon: "L", label: "左寄せ", run: (targetView) => setTableColumnAlignment(targetView, "left") },
      { icon: "C", label: "中央寄せ", run: (targetView) => setTableColumnAlignment(targetView, "center") },
      { icon: "R", label: "右寄せ", run: (targetView) => setTableColumnAlignment(targetView, "right") },
    ]);
    groups.push([
      {
        disabled: !canMergeSelectedTableCells(view.state),
        icon: "□",
        label: "セル結合",
        run: mergeSelectedTableCells,
      },
      {
        disabled: activeCell.row.kind === "header"
          || findMergeRegionContainingCell(activeCell.table, activeCell.rowIndex, activeCell.columnIndex) === null,
        icon: "◇",
        label: "結合解除",
        run: splitMergedTableCell,
      },
    ]);
  }

  for (const group of groups) {
    const groupElement = ownerDocument.createElement("div");
    groupElement.className = "cm-markdownTableContextMenu__group";

    for (const item of group) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "cm-markdownTableContextMenu__item";
      button.disabled = item.disabled === true;
      button.role = "menuitem";
      const icon = ownerDocument.createElement("span");
      icon.className = "cm-markdownTableContextMenu__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = item.icon;
      const label = ownerDocument.createElement("span");
      label.className = "cm-markdownTableContextMenu__label";
      label.textContent = item.label;
      button.replaceChildren(icon, label);
      button.addEventListener("mousedown", (mouseEvent) => {
        mouseEvent.preventDefault();
      });
      button.addEventListener("click", (mouseEvent) => {
        mouseEvent.preventDefault();
        if (button.disabled) {
          return;
        }

        closeActiveTableContextMenu();
        view.focus();
        item.run(view);
      });
      groupElement.append(button);
    }

    menu.append(groupElement);
  }

  return menu;
}

function positionTableContextMenu(menu: HTMLElement, clientX: number, clientY: number): void {
  const margin = 8;
  const ownerWindow = menu.ownerDocument.defaultView ?? window;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.min(clientX, ownerWindow.innerWidth - width - margin);
  const top = Math.min(clientY, ownerWindow.innerHeight - height - margin);

  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function closeActiveTableContextMenu(): void {
  const menu = activeTableContextMenu;

  if (menu === null) {
    return;
  }

  activeTableContextMenu = null;
  menu.cleanup();
  menu.element.remove();
}

function isCellInsideSelectedTableRange(state: EditorState, activeCell: ActiveTableCell): boolean {
  const selection = getSelectedTableCells(state);

  if (selection === null || selection.table.startLineNumber !== activeCell.table.startLineNumber) {
    return false;
  }

  return activeCell.rowIndex >= selection.startRowIndex
    && activeCell.rowIndex <= selection.endRowIndex
    && activeCell.columnIndex >= selection.startColumnIndex
    && activeCell.columnIndex <= selection.endColumnIndex;
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

  if (fallbackCell === undefined) {
    return null;
  }

  if (
    position > fallbackCell.rawTo
    && rowIndex === table.rows.length - 1
    && fallbackCell.columnIndex === table.columnCount - 1
  ) {
    return null;
  }

  if (position < row.cells[0].contentFrom) {
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

  const isEmptyCell = contentStart >= contentEnd;
  const resolvedContentStart = isEmptyCell ? rawStart : contentStart;
  const resolvedContentEnd = isEmptyCell ? rawStart : contentEnd;

  return {
    columnIndex,
    contentFrom: lineFrom + resolvedContentStart,
    contentTo: lineFrom + resolvedContentEnd,
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
  const source = view.state.doc.toString();
  const replacedSource = `${source.slice(0, startLine.from)}${lines.join("\n")}${source.slice(endLine.to)}`;
  const result = formatMarkdownTablesInLineRanges(replacedSource, [{
    endLine: table.startLineNumber + lines.length - 1,
    startLine: table.startLineNumber,
  }]);
  const changes = resolveMarkdownTableFormatTextChanges(source, result.text);

  if (changes.length > 0) {
    view.dispatch({
      changes: [...changes],
    });
  }

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

function insertMarkdownTable(view: EditorView): boolean {
  const position = view.state.selection.main.head;
  const line = view.state.doc.lineAt(position);
  const insertsInsideBlankLine = line.text.trim().length === 0;
  const from = insertsInsideBlankLine ? line.from : line.to;
  const to = insertsInsideBlankLine ? line.to : line.to;
  const insert = insertsInsideBlankLine
    ? INSERTED_MARKDOWN_TABLE
    : `\n\n${INSERTED_MARKDOWN_TABLE}${line.to < view.state.doc.length ? "\n" : ""}`;
  const tableStartLineNumber = insertsInsideBlankLine ? line.number : line.number + 2;

  view.dispatch({
    changes: {
      from,
      insert,
      to,
    },
  });
  selectTableCell(view, tableStartLineNumber + 2, 0);

  return true;
}

function moveActiveTableCell(view: EditorView, direction: "left" | "right" | "down"): boolean {
  const activeCell = getActiveTableCell(view.state);

  if (activeCell === null) {
    return false;
  }

  if (
    direction === "down"
    && activeCell.row.kind === "body"
    && activeCell.rowIndex === activeCell.table.rows.length - 1
    && activeCell.columnIndex === activeCell.table.columnCount - 1
  ) {
    return true;
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

  return formatTableAndSelectCell(view, activeCell.table, rowIndex, columnIndex);
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

  return formatTableAndSelectCell(view, activeCell.table, rowIndex, columnIndex);
}

function formatTableAndSelectCell(
  view: EditorView,
  table: MarkdownTable,
  rowIndex: number,
  columnIndex: number,
): boolean {
  const source = view.state.doc.toString();
  const result = formatMarkdownTablesInLineRanges(source, [{
    endLine: table.endLineNumber,
    startLine: table.startLineNumber,
  }]);

  if (result.text !== source) {
    const changes = resolveMarkdownTableFormatTextChanges(source, result.text);

    if (changes.length > 0) {
      view.dispatch({
        annotations: Transaction.addToHistory.of(false),
        changes: [...changes],
      });
    }
  }

  selectTableCell(view, tableRowIndexToLineNumber(table.startLineNumber, rowIndex), columnIndex);
  return true;
}

function tableRowIndexToLineNumber(tableStartLineNumber: number, rowIndex: number): number {
  return tableStartLineNumber + rowIndex + (rowIndex === 0 ? 0 : 1);
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

  if (selection === null || !canMergeTableCellSelection(selection)) {
    return false;
  }

  const cells = matrixFromTable(selection.table);

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

function canMergeSelectedTableCells(state: EditorState): boolean {
  const selection = getSelectedTableCells(state);

  return selection !== null && canMergeTableCellSelection(selection);
}

function canMergeTableCellSelection(selection: TableCellSelection): boolean {
  if (selection.startRowIndex === 0) {
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

  return true;
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

const markdownTableContextMenuTheme = EditorView.theme({
  ".cm-markdownTableContextMenu": {
    backgroundColor: "var(--surface-muted)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 10px 28px rgb(0 0 0 / 22%)",
    color: "var(--text)",
    minWidth: "176px",
    padding: "4px",
    position: "fixed",
    zIndex: "60",
  },
  ".cm-markdownTableContextMenu__group": {
    borderBottom: "1px solid var(--border)",
    padding: "3px 0",
  },
  ".cm-markdownTableContextMenu__group:last-child": {
    borderBottom: "none",
  },
  ".cm-markdownTableContextMenu__item": {
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "4px",
    color: "var(--text)",
    cursor: "pointer",
    display: "grid",
    font: "inherit",
    gap: "8px",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    alignItems: "center",
    padding: "6px 10px",
    textAlign: "left",
    width: "100%",
  },
  ".cm-markdownTableContextMenu__icon": {
    color: "var(--text-soft)",
    fontSize: "0.9em",
    fontWeight: "700",
    lineHeight: "1",
    textAlign: "center",
  },
  ".cm-markdownTableContextMenu__label": {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-markdownTableContextMenu__item:hover, .cm-markdownTableContextMenu__item:focus-visible": {
    backgroundColor: "color-mix(in srgb, var(--focus) 16%, transparent)",
    outline: "none",
  },
  ".cm-markdownTableContextMenu__item:disabled": {
    color: "var(--text-soft)",
    cursor: "default",
    opacity: "0.55",
  },
  ".cm-markdownTableContextMenu__item:disabled:hover": {
    backgroundColor: "transparent",
  },
});
