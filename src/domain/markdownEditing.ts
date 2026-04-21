export type MarkdownSnippetDefinition = {
  readonly label: string;
  readonly detail: string;
  readonly documentation: string;
  readonly insertText: string;
  readonly filterText: string;
};

export type MarkdownEnterAction = {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly text: string;
};

export type MarkdownTabAction = {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly text: string;
  readonly nextSelectionStart: number;
  readonly nextSelectionEnd: number;
};

const FENCED_CODE_BLOCK_PATTERN = /^\s*(`{3,}|~{3,})/u;

export const MARKDOWN_SNIPPET_DEFINITIONS: readonly MarkdownSnippetDefinition[] = [
  {
    label: "heading 1",
    detail: "# 見出し",
    documentation: "レベル 1 の見出しを挿入します。",
    insertText: "# ${1:見出し}",
    filterText: "heading h1 title 見出し",
  },
  {
    label: "heading 2",
    detail: "## 見出し",
    documentation: "レベル 2 の見出しを挿入します。",
    insertText: "## ${1:見出し}",
    filterText: "heading h2 subtitle 見出し",
  },
  {
    label: "bullet list",
    detail: "- 項目",
    documentation: "箇条書きを挿入します。",
    insertText: "- ${1:項目}",
    filterText: "list bullet ul 箇条書き",
  },
  {
    label: "task list",
    detail: "- [ ] タスク",
    documentation: "タスクリスト項目を挿入します。",
    insertText: "- [ ] ${1:タスク}",
    filterText: "task checkbox todo checklist タスク",
  },
  {
    label: "ordered list",
    detail: "1. 項目",
    documentation: "番号付きリストを挿入します。",
    insertText: "1. ${1:項目}",
    filterText: "list ordered ol 番号",
  },
  {
    label: "blockquote",
    detail: "> 引用",
    documentation: "引用ブロックを挿入します。",
    insertText: "> ${1:引用}",
    filterText: "quote blockquote 引用",
  },
  {
    label: "code fence",
    detail: "```lang",
    documentation: "コードブロックを挿入します。",
    insertText: "```$1\n$2\n```",
    filterText: "code fence block コード",
  },
  {
    label: "link",
    detail: "[text](url)",
    documentation: "リンクを挿入します。",
    insertText: "[${1:text}](${2:https://example.com})",
    filterText: "link url href リンク",
  },
  {
    label: "image",
    detail: "![alt](path)",
    documentation: "画像リンクを挿入します。",
    insertText: "![${1:alt}](${2:path/to/image.png})",
    filterText: "image img 画像",
  },
  {
    label: "table",
    detail: "| col | col |",
    documentation: "2 列の Markdown テーブルを挿入します。",
    insertText: "| ${1:列1} | ${2:列2} |\n| --- | --- |\n| ${3:値1} | ${4:値2} |",
    filterText: "table 表",
  },
  {
    label: "bold",
    detail: "**text**",
    documentation: "太字を挿入します。",
    insertText: "**${1:text}**",
    filterText: "bold strong 太字",
  },
  {
    label: "italic",
    detail: "*text*",
    documentation: "斜体を挿入します。",
    insertText: "*${1:text}*",
    filterText: "italic emphasis 斜体",
  },
  {
    label: "page break",
    detail: "<!-- --- -->",
    documentation: "kMark の A4 ページ区切りを挿入します。",
    insertText: "<!-- --- -->",
    filterText: "page break a4 区切り",
  },
] as const;

function clampCursorOffset(content: string, cursorOffset: number): number {
  return Math.min(content.length, Math.max(0, cursorOffset));
}

function getLineStartOffset(content: string, cursorOffset: number): number {
  const previousLineBreakIndex = content.lastIndexOf("\n", Math.max(0, cursorOffset - 1));

  return previousLineBreakIndex === -1 ? 0 : previousLineBreakIndex + 1;
}

function getLineEndOffset(content: string, cursorOffset: number): number {
  const nextLineBreakIndex = content.indexOf("\n", cursorOffset);

  return nextLineBreakIndex === -1 ? content.length : nextLineBreakIndex;
}

function isInsideFencedCodeBlock(content: string, cursorOffset: number): boolean {
  const textBeforeCursor = content.slice(0, clampCursorOffset(content, cursorOffset));
  const lines = textBeforeCursor.split(/\r?\n/u);
  let activeFence: { readonly marker: string; readonly length: number } | null = null;

  for (const line of lines) {
    const match = FENCED_CODE_BLOCK_PATTERN.exec(line);

    if (match === null) {
      continue;
    }

    const fence = match[1];
    const marker = fence[0];

    if (activeFence === null) {
      activeFence = { marker, length: fence.length };
      continue;
    }

    if (activeFence.marker === marker && fence.length >= activeFence.length) {
      activeFence = null;
    }
  }

  return activeFence !== null;
}

function createLinePrefix(indent: string, quoteDepth: number): string {
  return `${indent}${"> ".repeat(quoteDepth)}`;
}

function isMarkdownIndentableLine(lineContent: string): boolean {
  const trimmedLineContent = lineContent.trimStart();

  return trimmedLineContent.startsWith(">")
    || /^[-+*]\s/u.test(trimmedLineContent)
    || /^\d+[.)]\s/u.test(trimmedLineContent);
}

function removeLeadingIndent(lineContent: string): { readonly text: string; readonly removedWidth: number } {
  if (lineContent.startsWith("\t")) {
    return {
      text: lineContent.slice(1),
      removedWidth: 1,
    };
  }

  if (lineContent.startsWith("  ")) {
    return {
      text: lineContent.slice(2),
      removedWidth: 2,
    };
  }

  if (lineContent.startsWith(" ")) {
    return {
      text: lineContent.slice(1),
      removedWidth: 1,
    };
  }

  return {
    text: lineContent,
    removedWidth: 0,
  };
}

export function getMarkdownTabAction(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  isOutdent: boolean,
): MarkdownTabAction | null {
  const normalizedSelectionStart = clampCursorOffset(content, selectionStart);
  const normalizedSelectionEnd = clampCursorOffset(content, selectionEnd);
  const hasSelection = normalizedSelectionStart !== normalizedSelectionEnd;
  const effectiveSelectionEnd = hasSelection && content[normalizedSelectionEnd - 1] === "\n"
    ? Math.max(normalizedSelectionStart, normalizedSelectionEnd - 1)
    : normalizedSelectionEnd;
  const rangeStart = getLineStartOffset(content, normalizedSelectionStart);
  const rangeEnd = getLineEndOffset(content, effectiveSelectionEnd);
  const rangeContent = content.slice(rangeStart, rangeEnd);
  const lineContents = rangeContent.split("\n");

  if (hasSelection) {
    if (isOutdent && !lineContents.some((lineContent) => /^[ \t]/u.test(lineContent))) {
      return null;
    }

    const nextLineContents = isOutdent
      ? lineContents.map((lineContent) => removeLeadingIndent(lineContent).text)
      : lineContents.map((lineContent) => `  ${lineContent}`);
    const nextRangeContent = nextLineContents.join("\n");

    return {
      rangeStart,
      rangeEnd,
      text: nextRangeContent,
      nextSelectionStart: rangeStart,
      nextSelectionEnd: rangeStart + nextRangeContent.length,
    };
  }

  const currentLineContent = lineContents[0] ?? "";

  if (isOutdent) {
    const { text, removedWidth } = removeLeadingIndent(currentLineContent);

    if (removedWidth === 0) {
      return null;
    }

    const cursorOffsetInLine = normalizedSelectionStart - rangeStart;
    const nextCursorOffset = normalizedSelectionStart - Math.min(removedWidth, cursorOffsetInLine);

    return {
      rangeStart,
      rangeEnd,
      text,
      nextSelectionStart: nextCursorOffset,
      nextSelectionEnd: nextCursorOffset,
    };
  }

  if (!isMarkdownIndentableLine(currentLineContent)) {
    return null;
  }

  return {
    rangeStart,
    rangeEnd,
    text: `  ${currentLineContent}`,
    nextSelectionStart: normalizedSelectionStart + 2,
    nextSelectionEnd: normalizedSelectionStart + 2,
  };
}

export function getMarkdownEnterAction(content: string, cursorOffset: number): MarkdownEnterAction | null {
  const normalizedCursorOffset = clampCursorOffset(content, cursorOffset);

  if (isInsideFencedCodeBlock(content, normalizedCursorOffset)) {
    return null;
  }

  const lineStartOffset = getLineStartOffset(content, normalizedCursorOffset);
  const lineEndOffset = getLineEndOffset(content, normalizedCursorOffset);

  if (normalizedCursorOffset !== lineEndOffset) {
    return null;
  }

  const lineContent = content.slice(lineStartOffset, lineEndOffset);
  const quoteMatch = /^(\s*)((?:>\s?)*)?(.*)$/u.exec(lineContent);

  if (quoteMatch === null) {
    return null;
  }

  const indent = quoteMatch[1] ?? "";
  const quoteMarkers = quoteMatch[2] ?? "";
  const quoteDepth = (quoteMarkers.match(/>/gu) ?? []).length;
  const lineContentWithoutQuote = quoteMatch[3] ?? "";
  const linePrefix = createLinePrefix(indent, quoteDepth);

  const taskMatch = /^([-+*])\s\[(?: |x|X)\]\s?(.*)$/u.exec(lineContentWithoutQuote);

  if (taskMatch !== null) {
    const bulletMarker = taskMatch[1];
    const taskContent = taskMatch[2] ?? "";

    if (taskContent.trim().length === 0) {
      return {
        rangeStart: lineStartOffset,
        rangeEnd: lineEndOffset,
        text: linePrefix,
      };
    }

    return {
      rangeStart: normalizedCursorOffset,
      rangeEnd: normalizedCursorOffset,
      text: `\n${linePrefix}${bulletMarker} [ ] `,
    };
  }

  const bulletMatch = /^([-+*])\s(.*)$/u.exec(lineContentWithoutQuote);

  if (bulletMatch !== null) {
    const bulletMarker = bulletMatch[1];
    const bulletContent = bulletMatch[2] ?? "";

    if (bulletContent.trim().length === 0) {
      return {
        rangeStart: lineStartOffset,
        rangeEnd: lineEndOffset,
        text: linePrefix,
      };
    }

    return {
      rangeStart: normalizedCursorOffset,
      rangeEnd: normalizedCursorOffset,
      text: `\n${linePrefix}${bulletMarker} `,
    };
  }

  const orderedMatch = /^(\d+)([.)])\s(.*)$/u.exec(lineContentWithoutQuote);

  if (orderedMatch !== null) {
    const nextNumber = Number.parseInt(orderedMatch[1], 10) + 1;
    const delimiter = orderedMatch[2];
    const orderedContent = orderedMatch[3] ?? "";

    if (orderedContent.trim().length === 0) {
      return {
        rangeStart: lineStartOffset,
        rangeEnd: lineEndOffset,
        text: linePrefix,
      };
    }

    return {
      rangeStart: normalizedCursorOffset,
      rangeEnd: normalizedCursorOffset,
      text: `\n${linePrefix}${nextNumber}${delimiter} `,
    };
  }

  if (quoteDepth > 0) {
    if (lineContentWithoutQuote.trim().length === 0) {
      return {
        rangeStart: lineStartOffset,
        rangeEnd: lineEndOffset,
        text: indent,
      };
    }

    return {
      rangeStart: normalizedCursorOffset,
      rangeEnd: normalizedCursorOffset,
      text: `\n${linePrefix}`,
    };
  }

  if (indent.length > 0 && lineContentWithoutQuote.trim().length > 0) {
    return {
      rangeStart: normalizedCursorOffset,
      rangeEnd: normalizedCursorOffset,
      text: `\n${indent}`,
    };
  }

  return null;
}