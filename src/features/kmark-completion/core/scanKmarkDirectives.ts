import { parseKmarkScopeCommentBody } from "../../../domain/kmarkScopeSyntax";

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
  let activeFence: { readonly marker: string; readonly length: number } | null = null;
  let lineStart = 0;
  let lineEnd = markdown.indexOf("\n");

  for (const match of markdown.matchAll(/<!--[\s\S]*?-->/gu)) {
    if (match.index === undefined) {
      continue;
    }

    while (lineEnd >= 0 && lineEnd < match.index) {
      const line = markdown.slice(lineStart, lineEnd);
      activeFence = nextMarkdownFence(line, activeFence);
      lineStart = lineEnd + 1;
      lineEnd = markdown.indexOf("\n", lineStart);
    }

    const lineBeforeComment = markdown.slice(lineStart, match.index);
    const insideFence = activeFence === null
      ? parseMarkdownFenceOpen(lineBeforeComment) !== null
      : !isMarkdownFenceClose(lineBeforeComment, activeFence);
    if (insideFence || isInsideInlineCode(lineBeforeComment)) {
      continue;
    }

    const commentText = match[0];
    const body = commentText.slice(4, -3);
    const parsedBody = parseKmarkScopeCommentBody(body);

    if (parsedBody === null) {
      continue;
    }

    occurrences.push({
      directiveText: parsedBody.directiveText,
      rangeStart: match.index + 4 + parsedBody.directiveTextStart,
      markerRange: {
        start: match.index + 4 + parsedBody.directiveNameStart,
        end: match.index + 4 + parsedBody.directiveNameEnd,
      },
    });
  }

  return occurrences;
}

function isInsideInlineCode(lineBeforeOffset: string): boolean {
  const textWithoutFences = lineBeforeOffset.replace(/(`{3,}|~{3,}).*$/u, "");
  const unescapedBackticks = [...textWithoutFences].filter((character, index) => (
    character === "`" && textWithoutFences[index - 1] !== "\\"
  ));

  return unescapedBackticks.length % 2 === 1;
}

function nextMarkdownFence(
  line: string,
  activeFence: { readonly marker: string; readonly length: number } | null,
): { readonly marker: string; readonly length: number } | null {
  if (activeFence !== null) {
    return isMarkdownFenceClose(line, activeFence) ? null : activeFence;
  }
  return parseMarkdownFenceOpen(line);
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
