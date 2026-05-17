export type KmarkScopeSyntaxConfig = {
  readonly directiveNames: readonly string[];
  readonly openScopeToken: string;
  readonly closeScopeToken: string;
  readonly allowBareClose: boolean;
};

export type ParsedKmarkScopeCommentBody = {
  readonly directiveName: string | null;
  readonly directiveText: string;
  readonly directiveTextStart: number;
  readonly directiveNameStart: number;
  readonly directiveNameEnd: number;
};

export const defaultKmarkScopeSyntaxConfig: KmarkScopeSyntaxConfig = {
  directiveNames: ["k", "kmark"],
  openScopeToken: "{",
  closeScopeToken: "}",
  allowBareClose: true,
};

export function parseKmarkScopeCommentBody(
  body: string,
  config: KmarkScopeSyntaxConfig = defaultKmarkScopeSyntaxConfig,
): ParsedKmarkScopeCommentBody | null {
  const leadingWhitespace = body.match(/^\s*/u)?.[0].length ?? 0;
  const trimmedStart = leadingWhitespace;
  const trimmedBody = body.slice(trimmedStart);
  const bareCloseStart = trimmedBody.indexOf(config.closeScopeToken);

  if (
    config.allowBareClose
    && bareCloseStart >= 0
    && trimmedBody.slice(0, bareCloseStart).trim().length === 0
    && trimmedBody.slice(bareCloseStart + config.closeScopeToken.length).trim().length === 0
  ) {
    const tokenStart = trimmedStart + bareCloseStart;

    return {
      directiveName: null,
      directiveText: body.slice(tokenStart).trimEnd(),
      directiveTextStart: tokenStart,
      directiveNameStart: tokenStart,
      directiveNameEnd: tokenStart + config.closeScopeToken.length,
    };
  }

  for (const directiveName of [...config.directiveNames].sort((left, right) => right.length - left.length)) {
    if (!trimmedBody.startsWith(directiveName)) {
      continue;
    }

    const afterName = trimmedBody.charAt(directiveName.length);

    if (afterName.length > 0 && isKmarkDirectiveNameCharacter(afterName)) {
      continue;
    }

    const directiveNameStart = trimmedStart;
    const directiveTextStart = trimmedStart + directiveName.length;

    return {
      directiveName,
      directiveText: body.slice(directiveTextStart).trimEnd(),
      directiveTextStart,
      directiveNameStart,
      directiveNameEnd: directiveNameStart + directiveName.length,
    };
  }

  return null;
}

export function findLastKmarkDirectiveMarker(
  lineBeforeCursor: string,
  config: KmarkScopeSyntaxConfig = defaultKmarkScopeSyntaxConfig,
): { readonly index: number; readonly text: string } | null {
  let lastMatch: { index: number; text: string } | null = null;

  for (const match of lineBeforeCursor.matchAll(/<!--\s*[A-Za-z][A-Za-z0-9_-]*/gu)) {
    if (match.index === undefined) {
      continue;
    }

    const text = match[0];
    const marker = text.match(/[A-Za-z][A-Za-z0-9_-]*$/u)?.[0] ?? "";

    if (!config.directiveNames.includes(marker)) {
      continue;
    }

    lastMatch = {
      index: match.index,
      text,
    };
  }

  return lastMatch;
}

function isKmarkDirectiveNameCharacter(character: string): boolean {
  return /^[A-Za-z0-9_-]$/u.test(character);
}
