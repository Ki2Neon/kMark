import { KMARK_PARAM_SPECS } from "../schema/kmarkParamSpecs";
import { type KmarkParamSpec, type KmarkValidationWarning } from "./types";

type ParsedKmarkTokenWithRange = {
  readonly name: string;
  readonly value: string;
  readonly tokenStart: number;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly valueStart: number;
  readonly tokenEnd: number;
};

type KmarkDirectiveOccurrence = {
  readonly directiveText: string;
  readonly rangeStart: number;
  readonly markerRange: {
    readonly start: number;
    readonly end: number;
  };
};

export function validateKmarkDirective(input: {
  readonly directiveText: string;
  readonly rangeStart: number;
}): readonly KmarkValidationWarning[] {
  return validateKmarkDirectiveTokens({
    directiveText: input.directiveText,
    rangeStart: input.rangeStart,
  });
}

export function validateKmarkDocument(markdown: string): readonly KmarkValidationWarning[] {
  const warnings: KmarkValidationWarning[] = [];
  const scopeStack: KmarkDirectiveOccurrence[] = [];

  for (const occurrence of collectKmarkDirectiveOccurrences(markdown)) {
    warnings.push(...validateKmarkDirectiveTokens(occurrence));

    const trimmedDirective = occurrence.directiveText.trim();

    if (trimmedDirective === "}") {
      scopeStack.pop();
      continue;
    }

    if (trimmedDirective.startsWith("{")) {
      scopeStack.push(occurrence);
    }
  }

  for (const occurrence of scopeStack) {
    const scopeOpenIndex = occurrence.directiveText.indexOf("{");
    const start = scopeOpenIndex >= 0
      ? occurrence.rangeStart + scopeOpenIndex
      : occurrence.markerRange.start;

    warnings.push({
      message: "Missing kmark scope close comment",
      range: {
        start,
        end: start + 1,
      },
    });
  }

  return warnings.sort(compareWarnings);
}

function validateKmarkDirectiveTokens(input: {
  readonly directiveText: string;
  readonly rangeStart: number;
}): readonly KmarkValidationWarning[] {
  const warnings: KmarkValidationWarning[] = [];
  const seenParamNames = new Set<string>();

  for (const token of parseKmarkTokensWithRanges(input.directiveText, input.rangeStart)) {
    const spec = findParamSpec(token.name);
    const range = { start: token.nameStart, end: token.nameEnd };

    if (spec === null) {
      warnings.push({
        message: formatUnknownParamMessage(token.name),
        range,
      });
      continue;
    }

    const canonicalName = spec.name;

    if (token.value === "") {
      warnings.push({
        message: `Missing value for ${token.name}`,
        range,
      });
    }

    if (spec.values !== undefined && token.value !== "" && !isValidEnumValue(spec, token.value)) {
      warnings.push({
        message: `Invalid value for ${token.name}: ${token.value}\nAllowed values: ${spec.values.join(", ")}`,
        range: {
          start: token.valueStart,
          end: token.tokenEnd,
        },
      });
    }

    if (seenParamNames.has(canonicalName) && spec.allowMultiple !== true) {
      warnings.push({
        message: `Duplicate parameter: ${canonicalName}`,
        range,
      });
    }

    seenParamNames.add(canonicalName);
  }

  return warnings;
}

function collectKmarkDirectiveOccurrences(markdown: string): readonly KmarkDirectiveOccurrence[] {
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

function parseKmarkTokensWithRanges(
  directiveText: string,
  rangeStart: number,
): readonly ParsedKmarkTokenWithRange[] {
  const tokens: ParsedKmarkTokenWithRange[] = [];

  for (const match of directiveText.matchAll(/[^\s{}]+/gu)) {
    if (match.index === undefined) {
      continue;
    }

    const tokenText = match[0];
    const separatorIndex = tokenText.indexOf(":");

    if (separatorIndex <= 0) {
      continue;
    }

    const tokenStart = rangeStart + match.index;
    const valueStart = tokenStart + separatorIndex + 1;

    tokens.push({
      name: tokenText.slice(0, separatorIndex),
      value: tokenText.slice(separatorIndex + 1),
      tokenStart,
      nameStart: tokenStart,
      nameEnd: tokenStart + separatorIndex,
      valueStart,
      tokenEnd: tokenStart + tokenText.length,
    });
  }

  return tokens;
}

function findParamSpec(name: string): KmarkParamSpec | null {
  return KMARK_PARAM_SPECS.find((spec) => (
    spec.name === name || spec.aliases?.includes(name) === true
  )) ?? null;
}

function isValidEnumValue(spec: KmarkParamSpec, value: string): boolean {
  if (spec.values === undefined) {
    return true;
  }

  if (spec.name === "page_size") {
    return spec.values.some((candidate) => candidate.toLocaleLowerCase("en-US") === value.toLocaleLowerCase("en-US"));
  }

  return spec.values.includes(value);
}

function formatUnknownParamMessage(name: string): string {
  const suggestion = findClosestParamName(name);

  return suggestion === null
    ? `Unknown parameter: ${name}`
    : `Unknown parameter: ${name}\nDid you mean ${suggestion}?`;
}

function findClosestParamName(name: string): string | null {
  let closestName: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const spec of KMARK_PARAM_SPECS) {
    for (const candidate of [spec.name, ...(spec.aliases ?? [])]) {
      const distance = levenshteinDistance(name, candidate);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestName = spec.name;
      }
    }
  }

  return closestDistance <= 2 ? closestName : null;
}

function levenshteinDistance(left: string, right: string): number {
  const previousRow = Array.from({ length: right.length + 1 }, (_value, index) => index);
  const currentRow = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    currentRow[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      currentRow[rightIndex] = Math.min(
        previousRow[rightIndex] + 1,
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }

    for (let index = 0; index < previousRow.length; index += 1) {
      previousRow[index] = currentRow[index];
    }
  }

  return previousRow[right.length] ?? 0;
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

function compareWarnings(left: KmarkValidationWarning, right: KmarkValidationWarning): number {
  return left.range.start - right.range.start || left.range.end - right.range.end;
}
