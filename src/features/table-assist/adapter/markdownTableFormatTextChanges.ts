export type MarkdownTableFormatTextChange = {
  readonly from: number;
  readonly insert: string;
  readonly to: number;
};

type TextLine = {
  readonly lineBreak: string;
  readonly start: number;
  readonly text: string;
};

type TextToken = {
  readonly end: number;
  readonly start: number;
  readonly text: string;
};

const MAX_LINE_DIFF_MATRIX_CELLS = 1_000_000;

export function resolveMarkdownTableFormatTextChanges(
  before: string,
  after: string,
): readonly MarkdownTableFormatTextChange[] {
  if (before === after) {
    return [];
  }

  const beforeLines = collectTextLines(before);
  const afterLines = collectTextLines(after);

  if (beforeLines.length !== afterLines.length) {
    return [resolveMinimalTextChange(before, after)];
  }

  const changes: MarkdownTableFormatTextChange[] = [];

  for (let lineIndex = 0; lineIndex < beforeLines.length; lineIndex += 1) {
    const beforeLine = beforeLines[lineIndex];
    const afterLine = afterLines[lineIndex];

    if (beforeLine === undefined || afterLine === undefined) {
      return [resolveMinimalTextChange(before, after)];
    }

    if (beforeLine.lineBreak !== afterLine.lineBreak) {
      return [resolveMinimalTextChange(before, after)];
    }

    if (beforeLine.text === afterLine.text) {
      continue;
    }

    changes.push(...resolveLineTextChanges(beforeLine.text, afterLine.text, beforeLine.start));
  }

  return changes;
}

function collectTextLines(text: string): readonly TextLine[] {
  const lines: TextLine[] = [];
  let lineStart = 0;
  let offset = 0;

  while (offset < text.length) {
    const character = text[offset];

    if (character === "\r" || character === "\n") {
      const lineBreak = character === "\r" && text[offset + 1] === "\n" ? "\r\n" : character;
      lines.push({
        lineBreak,
        start: lineStart,
        text: text.slice(lineStart, offset),
      });
      offset += lineBreak.length;
      lineStart = offset;
      continue;
    }

    offset += 1;
  }

  lines.push({
    lineBreak: "",
    start: lineStart,
    text: text.slice(lineStart),
  });

  return lines;
}

function resolveLineTextChanges(
  beforeLine: string,
  afterLine: string,
  lineStart: number,
): readonly MarkdownTableFormatTextChange[] {
  const range = resolveChangedMiddleRange(beforeLine, afterLine);

  if (range.beforeFrom === range.beforeTo && range.afterFrom === range.afterTo) {
    return [];
  }

  const beforeTokens = tokenizeText(beforeLine, range.beforeFrom, range.beforeTo);
  const afterTokens = tokenizeText(afterLine, range.afterFrom, range.afterTo);

  if (beforeTokens.length * afterTokens.length > MAX_LINE_DIFF_MATRIX_CELLS) {
    return [{
      from: lineStart + range.beforeFrom,
      insert: afterLine.slice(range.afterFrom, range.afterTo),
      to: lineStart + range.beforeTo,
    }];
  }

  return resolveTokenTextChanges(beforeTokens, afterTokens, lineStart, range.beforeTo);
}

function resolveChangedMiddleRange(beforeLine: string, afterLine: string): {
  readonly afterFrom: number;
  readonly afterTo: number;
  readonly beforeFrom: number;
  readonly beforeTo: number;
} {
  let beforeFrom = 0;
  let afterFrom = 0;

  while (beforeFrom < beforeLine.length && afterFrom < afterLine.length) {
    const beforeCharacter = readCodePoint(beforeLine, beforeFrom);
    const afterCharacter = readCodePoint(afterLine, afterFrom);

    if (beforeCharacter !== afterCharacter) {
      break;
    }

    beforeFrom += beforeCharacter.length;
    afterFrom += afterCharacter.length;
  }

  let beforeTo = beforeLine.length;
  let afterTo = afterLine.length;

  while (beforeTo > beforeFrom && afterTo > afterFrom) {
    const beforeCharacter = readPreviousCodePoint(beforeLine, beforeTo);
    const afterCharacter = readPreviousCodePoint(afterLine, afterTo);

    if (beforeCharacter !== afterCharacter) {
      break;
    }

    beforeTo -= beforeCharacter.length;
    afterTo -= afterCharacter.length;
  }

  return {
    afterFrom,
    afterTo,
    beforeFrom,
    beforeTo,
  };
}

function tokenizeText(text: string, from: number, to: number): readonly TextToken[] {
  const tokens: TextToken[] = [];

  for (let offset = from; offset < to;) {
    const tokenText = readCodePoint(text, offset);
    const end = offset + tokenText.length;

    tokens.push({
      end,
      start: offset,
      text: tokenText,
    });
    offset = end;
  }

  return tokens;
}

function resolveTokenTextChanges(
  beforeTokens: readonly TextToken[],
  afterTokens: readonly TextToken[],
  lineStart: number,
  fallbackEnd: number,
): readonly MarkdownTableFormatTextChange[] {
  const lengths = Array.from(
    { length: beforeTokens.length + 1 },
    () => new Uint32Array(afterTokens.length + 1),
  );

  for (let beforeIndex = beforeTokens.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterTokens.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[beforeIndex][afterIndex] = beforeTokens[beforeIndex].text === afterTokens[afterIndex].text
        ? lengths[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1]);
    }
  }

  const changes: MarkdownTableFormatTextChange[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let pendingFrom: number | null = null;
  let pendingInsert = "";
  let pendingTo = 0;

  const currentBeforeOffset = () => beforeTokens[beforeIndex]?.start ?? fallbackEnd;
  const startPending = () => {
    if (pendingFrom === null) {
      pendingFrom = currentBeforeOffset();
      pendingTo = pendingFrom;
    }
  };
  const flushPending = () => {
    if (pendingFrom === null) {
      return;
    }

    changes.push({
      from: lineStart + pendingFrom,
      insert: pendingInsert,
      to: lineStart + pendingTo,
    });
    pendingFrom = null;
    pendingInsert = "";
  };

  while (beforeIndex < beforeTokens.length || afterIndex < afterTokens.length) {
    if (
      beforeIndex < beforeTokens.length
      && afterIndex < afterTokens.length
      && beforeTokens[beforeIndex].text === afterTokens[afterIndex].text
    ) {
      flushPending();
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (
      afterIndex < afterTokens.length
      && (
        beforeIndex >= beforeTokens.length
        || lengths[beforeIndex][afterIndex + 1] >= lengths[beforeIndex + 1][afterIndex]
      )
    ) {
      startPending();
      pendingInsert += afterTokens[afterIndex].text;
      afterIndex += 1;
      continue;
    }

    startPending();
    pendingTo = beforeTokens[beforeIndex].end;
    beforeIndex += 1;
  }

  flushPending();
  return changes;
}

function resolveMinimalTextChange(before: string, after: string): MarkdownTableFormatTextChange {
  const range = resolveChangedMiddleRange(before, after);

  return {
    from: range.beforeFrom,
    insert: after.slice(range.afterFrom, range.afterTo),
    to: range.beforeTo,
  };
}

function readCodePoint(text: string, offset: number): string {
  const codePoint = text.codePointAt(offset);

  if (codePoint === undefined) {
    return "";
  }

  return String.fromCodePoint(codePoint);
}

function readPreviousCodePoint(text: string, offset: number): string {
  const lastCodeUnitOffset = offset - 1;
  const lastCodeUnit = text.charCodeAt(lastCodeUnitOffset);

  if (
    lastCodeUnit >= 0xdc00
    && lastCodeUnit <= 0xdfff
    && lastCodeUnitOffset > 0
  ) {
    const previousCodeUnit = text.charCodeAt(lastCodeUnitOffset - 1);

    if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
      return text.slice(lastCodeUnitOffset - 1, offset);
    }
  }

  return text[lastCodeUnitOffset];
}
