export type KmarkDirectiveOccurrence = {
  readonly directiveText: string;
  readonly rangeStart: number;
  readonly markerRange: {
    readonly start: number;
    readonly end: number;
  };
};

export function collectKmarkDirectiveOccurrences(markdown: string): readonly KmarkDirectiveOccurrence[] {
  const occurrences: KmarkDirectiveOccurrence[] = [];

  for (const match of markdown.matchAll(/<!--[\s\S]*?-->/gu)) {
    if (match.index === undefined || isInsideMarkdownCode(markdown, match.index)) {
      continue;
    }

    const commentText = match[0];
    const body = commentText.slice(4, -3);
    const markerMatch = body.match(/^\s*kmark\b/iu);

    if (markerMatch === null) {
      continue;
    }

    const markerStart = match.index + 4 + markerMatch[0].search(/kmark/iu);
    const directiveStartInBody = markerMatch[0].length;

    occurrences.push({
      directiveText: body.slice(directiveStartInBody),
      rangeStart: match.index + 4 + directiveStartInBody,
      markerRange: {
        start: markerStart,
        end: markerStart + "kmark".length,
      },
    });
  }

  return occurrences;
}

function isInsideMarkdownCode(markdown: string, offset: number): boolean {
  return isInsideFencedCodeBlock(markdown, offset) || isInsideInlineCode(markdown, offset);
}

function isInsideInlineCode(markdown: string, offset: number): boolean {
  const lineStart = markdown.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineBeforeOffset = markdown.slice(lineStart, offset);
  const textWithoutFences = lineBeforeOffset.replace(/(`{3,}|~{3,}).*$/u, "");
  const unescapedBackticks = [...textWithoutFences].filter((character, index) => (
    character === "`" && textWithoutFences[index - 1] !== "\\"
  ));

  return unescapedBackticks.length % 2 === 1;
}

function isInsideFencedCodeBlock(markdown: string, offset: number): boolean {
  const textBeforeOffset = markdown.slice(0, offset);
  const lines = textBeforeOffset.split(/\r?\n/u);
  let activeFence: { readonly marker: string; readonly length: number } | null = null;

  for (const line of lines) {
    if (activeFence !== null && isMarkdownFenceClose(line, activeFence)) {
      activeFence = null;
      continue;
    }

    if (activeFence === null) {
      activeFence = parseMarkdownFenceOpen(line);
    }
  }

  return activeFence !== null;
}

function parseMarkdownFenceOpen(line: string): { readonly marker: string; readonly length: number } | null {
  const rest = stripMarkdownFenceIndent(line);

  if (rest === null) {
    return null;
  }

  const marker = rest[0];

  if (marker !== "`" && marker !== "~") {
    return null;
  }

  const length = countLeadingCharacters(rest, marker);

  if (length < 3) {
    return null;
  }

  if (marker === "`" && rest.slice(length).includes("`")) {
    return null;
  }

  return { marker, length };
}

function isMarkdownFenceClose(
  line: string,
  fence: { readonly marker: string; readonly length: number },
): boolean {
  const rest = stripMarkdownFenceIndent(line);

  if (rest === null) {
    return false;
  }

  const length = countLeadingCharacters(rest, fence.marker);

  return length >= fence.length && rest.slice(length).trim().length === 0;
}

function stripMarkdownFenceIndent(line: string): string | null {
  const indent = line.match(/^ */u)?.[0].length ?? 0;

  if (indent > 3) {
    return null;
  }

  return line.slice(indent);
}

function countLeadingCharacters(value: string, character: string): number {
  let count = 0;

  while (value[count] === character) {
    count += 1;
  }

  return count;
}
