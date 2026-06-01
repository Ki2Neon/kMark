import { Annotation, EditorSelection, Transaction, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { formatMarkdownTablesInLineRanges } from "../../../adapters/browser/browserRustCore";
import { type TableFormatLineRangePayload } from "../../../wasm/kmarkWeb";
import { resolveMarkdownTableFormatTextChanges } from "./markdownTableFormatTextChanges";

const TABLE_AUTO_FORMAT_DEBOUNCE_MS = 350;
const tableAutoFormatAnnotation = Annotation.define<boolean>();

type CursorAnchor = {
  readonly lineNumber: number;
  readonly offset: number;
  readonly semanticOffset: number;
};

type FormattedLine = {
  readonly text: string;
  readonly start: number;
};

type EditorScrollPosition = {
  readonly left: number;
  readonly top: number;
};

export function createCodeMirrorMarkdownTableAutoFormatExtension(): Extension {
  return ViewPlugin.fromClass(MarkdownTableAutoFormatPlugin);
}

class MarkdownTableAutoFormatPlugin {
  readonly #view: EditorView;
  #formatShouldJoinHistory = false;
  #lineRanges: readonly TableFormatLineRangePayload[] = [];
  #timeoutId: number | null = null;

  constructor(view: EditorView) {
    this.#view = view;
  }

  update(update: ViewUpdate): void {
    if (hasTableAutoFormatTransaction(update)) {
      return;
    }

    if (!update.docChanged) {
      return;
    }

    const lineRanges = collectPotentialTableLineRanges(update);

    if (lineRanges.length === 0) {
      return;
    }

    this.#lineRanges = mergeLineRanges([...this.#lineRanges, ...lineRanges]);
    this.#formatShouldJoinHistory ||= isHistorySensitiveChange(update);

    if (isWhitespaceOnlyChange(update)) {
      this.#clear();
      this.#formatShouldJoinHistory = false;
      this.#lineRanges = [];
      return;
    }

    if (update.view.composing) {
      return;
    }

    this.#schedule(this.#formatShouldJoinHistory ? 0 : TABLE_AUTO_FORMAT_DEBOUNCE_MS);
  }

  destroy(): void {
    this.#clear();
  }

  #schedule(delayMs: number = TABLE_AUTO_FORMAT_DEBOUNCE_MS): void {
    this.#clear();
    this.#timeoutId = window.setTimeout(() => {
      this.#timeoutId = null;
      this.#format();
    }, delayMs);
  }

  #format(): void {
    if (this.#view.composing) {
      this.#schedule();
      return;
    }

    const source = this.#view.state.doc.toString();
    const lineRanges = this.#lineRanges;
    const shouldJoinHistory = this.#formatShouldJoinHistory;
    this.#formatShouldJoinHistory = false;
    this.#lineRanges = [];
    const result = formatMarkdownTablesInLineRanges(source, lineRanges);

    if (result.text === source) {
      return;
    }

    const scrollPosition = captureEditorScroll(this.#view);
    const textChanges = resolveMarkdownTableFormatTextChanges(source, result.text);

    if (textChanges.length === 0) {
      return;
    }

    const annotations = shouldJoinHistory
      ? [tableAutoFormatAnnotation.of(true)]
      : [
        tableAutoFormatAnnotation.of(true),
        Transaction.addToHistory.of(false),
      ];

    this.#view.dispatch({
      annotations,
      changes: [...textChanges],
      selection: resolveSelectionAfterFormatting(this.#view.state, result.text),
    });
    restoreEditorScroll(this.#view, scrollPosition);
  }

  #clear(): void {
    if (this.#timeoutId === null) {
      return;
    }

    window.clearTimeout(this.#timeoutId);
    this.#timeoutId = null;
  }
}

function hasTableAutoFormatTransaction(update: ViewUpdate): boolean {
  return update.transactions.some((transaction) => transaction.annotation(tableAutoFormatAnnotation) === true);
}

function isWhitespaceOnlyChange(update: ViewUpdate): boolean {
  let onlyWhitespace = true;

  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (!onlyWhitespace) {
      return;
    }

    const deletedText = update.startState.doc.sliceString(fromA, toA);
    const insertedText = inserted.toString();

    onlyWhitespace = isHorizontalWhitespaceOnly(deletedText) && isHorizontalWhitespaceOnly(insertedText);
  });

  return onlyWhitespace;
}

function isHorizontalWhitespaceOnly(text: string): boolean {
  return /^[ \t]*$/u.test(text);
}

function isHistorySensitiveChange(update: ViewUpdate): boolean {
  let sensitive = false;

  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (sensitive) {
      return;
    }

    sensitive = hasTableStructureCharacter(update.startState.doc.sliceString(fromA, toA))
      || hasTableStructureCharacter(inserted.toString());
  });

  return sensitive;
}

function hasTableStructureCharacter(text: string): boolean {
  return /[\r\n|]/u.test(text);
}

function collectPotentialTableLineRanges(update: ViewUpdate): readonly TableFormatLineRangePayload[] {
  const ranges: TableFormatLineRangePayload[] = [];

  update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const lineRange = resolvePotentialTableLineRange(update.state, fromB, toB);

    if (lineRange !== null) {
      ranges.push(lineRange);
    }
  });

  return mergeLineRanges(ranges);
}

function resolvePotentialTableLineRange(
  state: EditorState,
  from: number,
  to: number,
): TableFormatLineRangePayload | null {
  if (state.doc.length === 0) {
    return null;
  }

  const boundedFrom = Math.min(state.doc.length, Math.max(0, from));
  const boundedTo = Math.min(state.doc.length, Math.max(boundedFrom, to));
  const startLineNumber = Math.max(1, state.doc.lineAt(boundedFrom).number - 1);
  const endLineNumber = Math.min(state.doc.lines, state.doc.lineAt(boundedTo).number + 1);

  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    if (state.doc.line(lineNumber).text.includes("|")) {
      return {
        endLine: endLineNumber,
        startLine: startLineNumber,
      };
    }
  }

  return null;
}

function mergeLineRanges(ranges: readonly TableFormatLineRangePayload[]): readonly TableFormatLineRangePayload[] {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sortedRanges = [...ranges].sort((left, right) => left.startLine - right.startLine);
  const mergedRanges: TableFormatLineRangePayload[] = [];

  for (const range of sortedRanges) {
    const previousRange = mergedRanges[mergedRanges.length - 1];

    if (previousRange === undefined || range.startLine > previousRange.endLine + 1) {
      mergedRanges.push(range);
      continue;
    }

    mergedRanges[mergedRanges.length - 1] = {
      endLine: Math.max(previousRange.endLine, range.endLine),
      startLine: previousRange.startLine,
    };
  }

  return mergedRanges;
}

function resolveSelectionAfterFormatting(state: EditorState, formatted: string): EditorSelection {
  const formattedLines = collectFormattedLines(formatted);
  const ranges = state.selection.ranges.map((range) => (
    EditorSelection.range(
      resolveAnchorAfterFormatting(createCursorAnchor(state, range.anchor), formattedLines, state),
      resolveAnchorAfterFormatting(createCursorAnchor(state, range.head), formattedLines, state),
    )
  ));

  return EditorSelection.create(ranges, state.selection.mainIndex);
}

function captureEditorScroll(view: EditorView): EditorScrollPosition {
  return {
    left: view.scrollDOM.scrollLeft,
    top: view.scrollDOM.scrollTop,
  };
}

function restoreEditorScroll(view: EditorView, scrollPosition: EditorScrollPosition): void {
  view.scrollDOM.scrollLeft = scrollPosition.left;
  view.scrollDOM.scrollTop = scrollPosition.top;
  window.requestAnimationFrame(() => {
    view.scrollDOM.scrollLeft = scrollPosition.left;
    view.scrollDOM.scrollTop = scrollPosition.top;
  });
}

function createCursorAnchor(state: EditorState, position: number): CursorAnchor {
  const line = state.doc.lineAt(position);
  const offset = position - line.from;

  return {
    lineNumber: line.number,
    offset,
    semanticOffset: countSemanticCharacters(line.text.slice(0, offset)),
  };
}

function resolveAnchorAfterFormatting(
  anchor: CursorAnchor,
  formattedLines: readonly FormattedLine[],
  state: EditorState,
): number {
  const currentLine = state.doc.line(anchor.lineNumber);
  const nextLine = formattedLines[anchor.lineNumber - 1];

  if (nextLine === undefined) {
    const lastLine = formattedLines[formattedLines.length - 1];
    return lastLine === undefined ? 0 : lastLine.start + lastLine.text.length;
  }

  if (currentLine.text === nextLine.text) {
    return nextLine.start + Math.min(anchor.offset, nextLine.text.length);
  }

  return nextLine.start + resolveOffsetBySemanticCharacters(nextLine.text, anchor.semanticOffset);
}

function collectFormattedLines(text: string): readonly FormattedLine[] {
  const lines: FormattedLine[] = [];
  let lineStart = 0;
  let offset = 0;

  while (offset < text.length) {
    const character = text[offset];

    if (character === "\r" || character === "\n") {
      lines.push({
        start: lineStart,
        text: text.slice(lineStart, offset),
      });
      offset += character === "\r" && text[offset + 1] === "\n" ? 2 : 1;
      lineStart = offset;
      continue;
    }

    offset += 1;
  }

  lines.push({
    start: lineStart,
    text: text.slice(lineStart),
  });

  return lines;
}

function countSemanticCharacters(text: string): number {
  let count = 0;

  for (let offset = 0; offset < text.length;) {
    const character = readCodePoint(text, offset);
    if (character !== " " && character !== "\t") {
      count += 1;
    }
    offset += character.length;
  }

  return count;
}

function resolveOffsetBySemanticCharacters(text: string, semanticOffset: number): number {
  if (semanticOffset <= 0) {
    return 0;
  }

  let count = 0;

  for (let offset = 0; offset < text.length;) {
    const character = readCodePoint(text, offset);
    offset += character.length;

    if (character === " " || character === "\t") {
      continue;
    }

    count += 1;

    if (count >= semanticOffset) {
      return offset;
    }
  }

  return text.length;
}

function readCodePoint(text: string, offset: number): string {
  const codePoint = text.codePointAt(offset);

  if (codePoint === undefined) {
    return "";
  }

  return String.fromCodePoint(codePoint);
}

