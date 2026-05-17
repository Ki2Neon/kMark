export type KmarkScopePaletteKey = "cyan" | "purple" | "yellow";

export type KmarkScopeRailShape = "start" | "middle" | "end" | "single";

export type KmarkScopeLineRail = {
  readonly id: number;
  readonly displayName: string;
  readonly colorKey: string;
  readonly paletteKey: KmarkScopePaletteKey;
  readonly depthIndex: number;
  readonly shape: KmarkScopeRailShape;
};

export type KmarkScopeLineBackground = {
  readonly paletteKey: KmarkScopePaletteKey;
  readonly shape: KmarkScopeRailShape;
};

export type KmarkScopeLineDisplay = {
  readonly lineNumber: number;
  readonly rails: readonly KmarkScopeLineRail[];
  readonly background: KmarkScopeLineBackground | null;
};

export type KmarkScopeDisplayDocument = {
  readonly lines: readonly KmarkScopeLineDisplay[];
};

type ActiveScope = {
  readonly id: number;
  readonly displayName: string;
  readonly colorKey: string;
  readonly paletteKey: KmarkScopePaletteKey;
};

type ScopeLineMarker =
  | {
    readonly kind: "start";
    readonly displayName: string;
    readonly colorKey: string;
    readonly paletteKey: KmarkScopePaletteKey;
  }
  | {
    readonly kind: "end";
  };

type MarkdownFence = {
  readonly marker: string;
  readonly length: number;
};

const PALETTE_KEYS = ["cyan", "purple", "yellow"] as const satisfies readonly KmarkScopePaletteKey[];

const KNOWN_SCOPE_PALETTE = new Map<string, KmarkScopePaletteKey>([
  ["hero", "cyan"],
  ["image_group", "purple"],
  ["table", "yellow"],
]);

export function collectKmarkScopeDisplayLines(markdown: string): KmarkScopeDisplayDocument {
  const lines = splitMarkdownLines(markdown);
  const displays: KmarkScopeLineDisplay[] = [];
  let activeFence: MarkdownFence | null = null;
  let activeScopes: ActiveScope[] = [];
  let nextScopeId = 1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const lineNumber = lineIndex + 1;
    const fenceState = resolveMarkdownFenceLine(line, activeFence);
    activeFence = fenceState.nextFence;

    const markers = fenceState.isCodeLine
      ? []
      : collectScopeLineMarkers(line);

    if (markers.length === 0 && activeScopes.length === 0) {
      continue;
    }

    let displayScopes = activeScopes;
    const startedScopeIds = new Set<number>();
    const endedScopeIds = new Set<number>();

    for (const marker of markers) {
      if (marker.kind === "start") {
        const scope: ActiveScope = {
          id: nextScopeId,
          displayName: marker.displayName,
          colorKey: marker.colorKey,
          paletteKey: marker.paletteKey,
        };

        nextScopeId += 1;
        activeScopes = [...activeScopes, scope];
        displayScopes = mergeScopeStacks(displayScopes, activeScopes);
        startedScopeIds.add(scope.id);
        continue;
      }

      const closingScope = activeScopes[activeScopes.length - 1];

      if (closingScope === undefined) {
        continue;
      }

      displayScopes = mergeScopeStacks(displayScopes, activeScopes);
      endedScopeIds.add(closingScope.id);
      activeScopes = activeScopes.slice(0, -1);
    }

    if (displayScopes.length === 0) {
      continue;
    }

    const rails = displayScopes.map((scope, depthIndex): KmarkScopeLineRail => {
      const shape = resolveRailShape(
        startedScopeIds.has(scope.id),
        endedScopeIds.has(scope.id),
      );

      return {
        id: scope.id,
        displayName: scope.displayName,
        colorKey: scope.colorKey,
        paletteKey: scope.paletteKey,
        depthIndex,
        shape,
      };
    });
    const deepestRail = rails[rails.length - 1] ?? null;

    displays.push({
      lineNumber,
      rails,
      background: deepestRail === null
        ? null
        : {
          paletteKey: deepestRail.paletteKey,
          shape: deepestRail.shape,
        },
    });
  }

  return { lines: displays };
}

function splitMarkdownLines(markdown: string): readonly string[] {
  return markdown.split(/\r\n|\n|\r/u);
}

function resolveRailShape(isStart: boolean, isEnd: boolean): KmarkScopeRailShape {
  if (isStart && isEnd) {
    return "single";
  }

  if (isStart) {
    return "start";
  }

  if (isEnd) {
    return "end";
  }

  return "middle";
}

function mergeScopeStacks(left: readonly ActiveScope[], right: readonly ActiveScope[]): ActiveScope[] {
  const scopes = [...left];
  const seenScopeIds = new Set(scopes.map((scope) => scope.id));

  for (const scope of right) {
    if (seenScopeIds.has(scope.id)) {
      continue;
    }

    scopes.push(scope);
    seenScopeIds.add(scope.id);
  }

  return scopes;
}

function collectScopeLineMarkers(line: string): readonly ScopeLineMarker[] {
  const markers: ScopeLineMarker[] = [];
  let rest = line.trim();

  while (rest.length > 0) {
    const match = rest.match(/^<!--\s*kmark\b([\s\S]*?)-->/iu);

    if (match === null) {
      return [];
    }

    const directiveText = match[1]?.trim() ?? "";
    const marker = parseScopeLineMarker(directiveText);

    if (marker === null) {
      return [];
    }

    markers.push(marker);
    rest = rest.slice(match[0].length).trim();
  }

  return markers;
}

function parseScopeLineMarker(directiveText: string): ScopeLineMarker | null {
  if (directiveText === "}") {
    return { kind: "end" };
  }

  if (!directiveText.startsWith("{")) {
    return null;
  }

  const metadata = parseScopeMetadata(directiveText);

  return {
    kind: "start",
    displayName: metadata.displayName,
    colorKey: metadata.colorKey,
    paletteKey: resolveScopePalette(metadata.colorKey),
  };
}

function parseScopeMetadata(directiveText: string): {
  readonly displayName: string;
  readonly colorKey: string;
} {
  const content = normalizeScopeOpenContent(directiveText);
  const bareToken = content.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)(?=\s|$)/u)?.[1] ?? null;
  const defineValue = parseDefineValue(content);
  const displayName = defineValue ?? bareToken ?? "scope";
  const colorKey = bareToken ?? defineValue ?? "scope";

  return {
    displayName,
    colorKey,
  };
}

function normalizeScopeOpenContent(directiveText: string): string {
  const content = directiveText.slice(1).trim();

  return content.endsWith("}")
    ? content.slice(0, -1).trim()
    : content;
}

function parseDefineValue(content: string): string | null {
  const match = content.match(/(?:^|\s)define:("([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s{}]+))/u);

  if (match === null) {
    return null;
  }

  const value = match[2] ?? match[3] ?? match[4] ?? "";
  const normalizedValue = value.replace(/\\(["'\\])/gu, "$1").trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : null;
}

function resolveScopePalette(colorKey: string): KmarkScopePaletteKey {
  const normalizedKey = colorKey.toLocaleLowerCase("en-US");
  const knownPalette = KNOWN_SCOPE_PALETTE.get(normalizedKey);

  if (knownPalette !== undefined) {
    return knownPalette;
  }

  return PALETTE_KEYS[hashString(normalizedKey) % PALETTE_KEYS.length] ?? "cyan";
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash;
}

function resolveMarkdownFenceLine(line: string, activeFence: MarkdownFence | null): {
  readonly isCodeLine: boolean;
  readonly nextFence: MarkdownFence | null;
} {
  if (activeFence !== null) {
    return {
      isCodeLine: true,
      nextFence: isMarkdownFenceClose(line, activeFence)
        ? null
        : activeFence,
    };
  }

  const openingFence = parseMarkdownFenceOpen(line);

  return {
    isCodeLine: openingFence !== null,
    nextFence: openingFence,
  };
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
