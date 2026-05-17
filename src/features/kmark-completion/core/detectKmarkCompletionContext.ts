import { type KmarkCompletionContext, type KmarkParamContext } from "./types";
import { findLastKmarkDirectiveMarker } from "../../../domain/kmarkScopeSyntax";
import { parseKmarkDirectiveFragment, splitKmarkDirectiveTokens } from "./parseKmarkDirectiveFragment";

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

const MARKDOWN_IMAGE_PATTERN = /^!\[[^\]]*\]\((?:<([^>]+)>|([^)]+?))\)/u;
const VIDEO_EXTENSION_PATTERN = /\.(?:mp4|webm|ogg|mov|m4v)$/iu;
const MODEL_EXTENSION_PATTERN = /\.(?:glb|gltf|obj|stl|fbx)$/iu;

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
  return findLastKmarkDirectiveMarker(lineBeforeCursor);
}

function resolveCurrentToken(directiveText: string): { readonly start: number; readonly text: string } {
  if (endsAtKmarkTokenBoundary(directiveText)) {
    return {
      start: directiveText.length,
      text: "",
    };
  }

  const tokens = splitKmarkDirectiveTokensWithRanges(directiveText);
  const token = tokens[tokens.length - 1];

  return token ?? {
    start: directiveText.length,
    text: "",
  };
}

function endsAtKmarkTokenBoundary(directiveText: string): boolean {
  if (directiveText.length === 0) {
    return true;
  }

  let quote: string | null = null;
  let escaped = false;

  for (const character of directiveText) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote !== null && character === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== null && character === quote) {
      quote = null;
      continue;
    }

    if (quote === null && (character === "\"" || character === "'")) {
      quote = character;
    }
  }

  if (quote !== null) {
    return false;
  }

  const lastCharacter = directiveText.charAt(directiveText.length - 1);
  return lastCharacter === "{" || lastCharacter === "}" || /\s/u.test(lastCharacter ?? "");
}

function splitKmarkDirectiveTokensWithRanges(
  directiveText: string,
): readonly { readonly start: number; readonly text: string }[] {
  const tokens = splitKmarkDirectiveTokens(directiveText);

  if (tokens.length === 0) {
    return [];
  }

  const ranges: { start: number; text: string }[] = [];
  let searchStart = 0;

  for (const token of tokens) {
    const tokenStart = directiveText.indexOf(token, searchStart);

    if (tokenStart === -1) {
      continue;
    }

    ranges.push({ start: tokenStart, text: token });
    searchStart = tokenStart + token.length;
  }

  return ranges;
}

function resolveCompletionContexts(input: {
  readonly markdown: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly parsedFragment: ReturnType<typeof parseKmarkDirectiveFragment>;
  readonly tokenText: string;
}): readonly KmarkParamContext[] {
  const contexts: KmarkParamContext[] = [];
  const isScope = input.parsedFragment.hasScopeOpen;
  const isAtDirectiveStart = input.tokenText.trim().length === 0;
  const nextBlockKind = resolveNextBlockKind(input.markdown, input.lineEnd);
  const isTocCandidate = input.parsedFragment.hasTocParam
    || isAtDirectiveStart
    || input.tokenText.toLocaleLowerCase("en-US").startsWith("toc");
  const isPageCandidate = input.parsedFragment.hasPageParam
    || ((isScope || isAtDirectiveStart) && isDocumentStart(input.markdown, input.lineStart));

  if (isTocCandidate) {
    addContext(contexts, "toc");
  }

  if (nextBlockKind === "image" || nextBlockKind === "video" || nextBlockKind === "model") {
    addContext(contexts, "image");
  }

  if (nextBlockKind === "video") {
    addContext(contexts, "video");
  }

  if (nextBlockKind === "model") {
    addContext(contexts, "model");
  }

  if (nextBlockKind === "table") {
    addContext(contexts, "table");
  }

  if (isPageCandidate) {
    addContext(contexts, "page");
  }

  if (isScope || isAtDirectiveStart) {
    addContext(contexts, "scope");
  }

  if (nextBlockKind === "text" || (!isScope && nextBlockKind === "none")) {
    addContext(contexts, "text");
  }

  addContext(contexts, "single");

  return contexts;
}

function addContext(contexts: KmarkParamContext[], context: KmarkParamContext): void {
  if (!contexts.includes(context)) {
    contexts.push(context);
  }
}

function isDocumentStart(markdown: string, lineStart: number): boolean {
  return markdown.slice(0, lineStart).split(/\r?\n/u).length <= 5;
}

function resolveNextBlockKind(markdown: string, lineEnd: number): "image" | "video" | "model" | "table" | "text" | "none" {
  const followingLines = markdown.slice(lineEnd).split(/\r?\n/u).slice(1);

  for (let lineIndex = 0; lineIndex < followingLines.length; lineIndex += 1) {
    const line = followingLines[lineIndex] ?? "";
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      continue;
    }

    const imageMatch = MARKDOWN_IMAGE_PATTERN.exec(trimmedLine);

    if (imageMatch !== null) {
      const destination = (imageMatch[1] ?? imageMatch[2] ?? "").trim();

      if (isVideoMarkdownDestination(destination)) {
        return "video";
      }
      if (isModelMarkdownDestination(destination)) {
        return "model";
      }

      return "image";
    }

    if (isMarkdownTableStart(trimmedLine, followingLines.slice(lineIndex + 1))) {
      return "table";
    }

    return "text";
  }

  return "none";
}

function isVideoMarkdownDestination(destination: string): boolean {
  const suffixStartCandidates = [
    destination.indexOf("?"),
    destination.indexOf("#"),
  ].filter((index) => index >= 0);
  const suffixStart = suffixStartCandidates.length > 0 ? Math.min(...suffixStartCandidates) : destination.length;

  return VIDEO_EXTENSION_PATTERN.test(destination.slice(0, suffixStart));
}

function isModelMarkdownDestination(destination: string): boolean {
  const suffixStartCandidates = [
    destination.indexOf("?"),
    destination.indexOf("#"),
  ].filter((index) => index >= 0);
  const suffixStart = suffixStartCandidates.length > 0 ? Math.min(...suffixStartCandidates) : destination.length;

  return MODEL_EXTENSION_PATTERN.test(destination.slice(0, suffixStart));
}

function isMarkdownTableStart(headerLine: string, followingLines: readonly string[]): boolean {
  if (!headerLine.includes("|")) {
    return false;
  }

  const delimiterLine = followingLines.find((line) => line.trim().length > 0)?.trim() ?? "";
  if (!delimiterLine.includes("|") || !delimiterLine.includes("-")) {
    return false;
  }

  const cells = delimiterLine
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
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
