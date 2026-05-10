import { type KmarkCompletionContext, type KmarkParamContext } from "./types";
import { parseKmarkDirectiveFragment } from "./parseKmarkDirectiveFragment";

const INACTIVE_KMARK_COMPLETION_CONTEXT: KmarkCompletionContext = {
  active: false,
  mode: "unknown",
  lineText: "",
  cursorInLine: 0,
  directiveText: "",
  contexts: [],
  replaceRange: { start: 0, end: 0 },
  usedParamNames: new Set(),
  suffixAfterCursor: "",
};

type MarkdownFence = {
  readonly marker: string;
  readonly length: number;
};

export function detectKmarkCompletionContext(input: {
  readonly markdown: string;
  readonly cursorOffset: number;
}): KmarkCompletionContext {
  const cursorOffset = clampOffset(input.cursorOffset, input.markdown.length);

  if (isInsideFencedCodeBlock(input.markdown, cursorOffset)) {
    return INACTIVE_KMARK_COMPLETION_CONTEXT;
  }

  const lineStart = input.markdown.lastIndexOf("\n", Math.max(0, cursorOffset - 1)) + 1;
  const lineEndIndex = input.markdown.indexOf("\n", cursorOffset);
  const lineEnd = lineEndIndex === -1 ? input.markdown.length : lineEndIndex;
  const lineText = input.markdown.slice(lineStart, lineEnd);
  const cursorInLine = cursorOffset - lineStart;
  const lineBeforeCursor = lineText.slice(0, cursorInLine);
  const markerMatch = findKmarkMarker(lineBeforeCursor);

  if (markerMatch === null || isInsideInlineCode(lineBeforeCursor)) {
    return INACTIVE_KMARK_COMPLETION_CONTEXT;
  }

  const markerEnd = markerMatch.index + markerMatch.text.length;
  const closedBeforeCursorIndex = lineBeforeCursor.indexOf("-->", markerEnd);

  if (closedBeforeCursorIndex !== -1) {
    return INACTIVE_KMARK_COMPLETION_CONTEXT;
  }

  const directiveText = lineText.slice(markerEnd, cursorInLine);
  const parsedFragment = parseKmarkDirectiveFragment(directiveText);
  const token = resolveCurrentToken(directiveText);
  const replaceStart = lineStart + markerEnd + token.start;
  const replaceEnd = cursorOffset;
  const tokenText = token.text;
  const separatorIndex = tokenText.indexOf(":");
  const contexts = resolveCompletionContexts({
    markdown: input.markdown,
    lineEnd,
    lineStart,
    parsedFragment,
    tokenText,
  });

  if (separatorIndex >= 0) {
    const currentParamName = tokenText.slice(0, separatorIndex);
    const currentValuePrefix = tokenText.slice(separatorIndex + 1);

    return {
      active: true,
      mode: currentParamName === "use" ? "style-use" : currentParamName === "define" ? "style-define" : "parameter-value",
      lineText,
      cursorInLine,
      directiveText,
      currentParamName,
      currentValuePrefix,
      contexts,
      replaceRange: {
        start: replaceStart + separatorIndex + 1,
        end: replaceEnd,
      },
      usedParamNames: parsedFragment.usedParamNames,
      suffixAfterCursor: lineText.slice(cursorInLine),
    };
  }

  return {
    active: true,
    mode: tokenText.length === 0 ? "directive-start" : "parameter-name",
    lineText,
    cursorInLine,
    directiveText,
    paramPrefix: tokenText,
    contexts,
    replaceRange: {
      start: replaceStart,
      end: replaceEnd,
    },
    usedParamNames: parsedFragment.usedParamNames,
    suffixAfterCursor: lineText.slice(cursorInLine),
  };
}

function clampOffset(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}

function findKmarkMarker(lineBeforeCursor: string): { readonly index: number; readonly text: string } | null {
  const matches = [...lineBeforeCursor.matchAll(/<!--\s*kmark\b/giu)];
  const match = matches[matches.length - 1];

  if (match === undefined || match.index === undefined) {
    return null;
  }

  return {
    index: match.index,
    text: match[0],
  };
}

function resolveCurrentToken(directiveText: string): { readonly start: number; readonly text: string } {
  const tokenStart = directiveText.search(/\S*$/u);
  const rawStart = tokenStart === -1 ? directiveText.length : tokenStart;
  const rawToken = directiveText.slice(rawStart);
  const trimmedToken = rawToken.replace(/^[{}]+/u, "");

  return {
    start: rawStart + rawToken.length - trimmedToken.length,
    text: trimmedToken,
  };
}

function resolveCompletionContexts(input: {
  readonly markdown: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly parsedFragment: ReturnType<typeof parseKmarkDirectiveFragment>;
  readonly tokenText: string;
}): readonly KmarkParamContext[] {
  const contexts = new Set<KmarkParamContext>();
  const isScope = input.parsedFragment.hasScopeOpen;
  const isAtDirectiveStart = input.tokenText.trim().length === 0;

  contexts.add("single");

  if (isScope || isAtDirectiveStart) {
    contexts.add("scope");
  }

  if (isScope && (input.parsedFragment.hasPageParam || isDocumentStart(input.markdown, input.lineStart) || isAtDirectiveStart)) {
    contexts.add("page");
  }

  if (isNextBlockImage(input.markdown, input.lineEnd)) {
    contexts.add("image");
  }

  return [...contexts];
}

function isDocumentStart(markdown: string, lineStart: number): boolean {
  return markdown.slice(0, lineStart).split(/\r?\n/u).length <= 5;
}

function isNextBlockImage(markdown: string, lineEnd: number): boolean {
  const followingLines = markdown.slice(lineEnd).split(/\r?\n/u).slice(1);

  for (const line of followingLines) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      continue;
    }

    return /^!\[[^\]]*\]\([^)]+?\)/u.test(trimmedLine);
  }

  return false;
}

function isInsideInlineCode(lineBeforeCursor: string): boolean {
  const textWithoutFences = lineBeforeCursor.replace(/(`{3,}|~{3,}).*$/u, "");
  const unescapedBackticks = [...textWithoutFences].filter((character, index) => (
    character === "`" && textWithoutFences[index - 1] !== "\\"
  ));

  return unescapedBackticks.length % 2 === 1;
}

function isInsideFencedCodeBlock(markdown: string, cursorOffset: number): boolean {
  const textBeforeCursor = markdown.slice(0, cursorOffset);
  const lines = textBeforeCursor.split(/\r?\n/u);
  let activeFence: MarkdownFence | null = null;

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

function parseMarkdownFenceOpen(line: string): MarkdownFence | null {
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

function isMarkdownFenceClose(line: string, fence: MarkdownFence): boolean {
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
