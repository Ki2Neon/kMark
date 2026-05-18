import { defaultKmarkScopeSyntaxConfig, parseKmarkScopeCommentBody, } from "../../../domain/kmarkScopeSyntax.mjs";
const PALETTE_KEYS = [
    "tone-0",
    "tone-1",
    "tone-2",
    "tone-3",
    "tone-4",
    "tone-5",
    "tone-6",
    "tone-7",
    "tone-8",
    "tone-9",
    "tone-10",
    "tone-11",
    "tone-12",
    "tone-13",
    "tone-14",
    "tone-15",
];
export function collectKmarkScopeDisplayLines(markdown, syntaxConfig = defaultKmarkScopeSyntaxConfig) {
    const lines = splitMarkdownLines(markdown);
    const displays = [];
    let activeFence = null;
    let activeScopes = [];
    let nextScopeId = 1;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] ?? "";
        const lineNumber = lineIndex + 1;
        const fenceState = resolveMarkdownFenceLine(line, activeFence);
        activeFence = fenceState.nextFence;
        const markers = fenceState.isCodeLine
            ? []
            : collectScopeLineMarkers(line, syntaxConfig);
        if (markers.length === 0 && activeScopes.length === 0) {
            continue;
        }
        let displayScopes = activeScopes;
        const startedScopeIds = new Set();
        const endedScopeIds = new Set();
        for (const marker of markers) {
            if (marker.kind === "start") {
                const scope = {
                    id: nextScopeId,
                    displayName: marker.displayName,
                    colorKey: marker.colorKey,
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
        const rails = displayScopes.map((scope, depthIndex) => {
            const shape = resolveRailShape(startedScopeIds.has(scope.id), endedScopeIds.has(scope.id));
            return {
                id: scope.id,
                displayName: scope.displayName,
                colorKey: scope.colorKey,
                paletteKey: resolveDepthPalette(depthIndex),
                depthIndex,
                shape,
            };
        });
        displays.push({
            lineNumber,
            rails,
        });
    }
    return {
        lines: displays,
        scopes: collectScopeDisplayRanges(displays),
    };
}
function splitMarkdownLines(markdown) {
    return markdown.split(/\r\n|\n|\r/u);
}
function resolveRailShape(isStart, isEnd) {
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
function mergeScopeStacks(left, right) {
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
function collectScopeDisplayRanges(displays) {
    const rangesByScopeId = new Map();
    displays.forEach((display) => {
        display.rails.forEach((rail) => {
            const currentRange = rangesByScopeId.get(rail.id);
            if (currentRange === undefined) {
                rangesByScopeId.set(rail.id, {
                    id: rail.id,
                    displayName: rail.displayName,
                    colorKey: rail.colorKey,
                    paletteKey: rail.paletteKey,
                    depthIndex: rail.depthIndex,
                    startLineNumber: display.lineNumber,
                    endLineNumber: display.lineNumber,
                });
                return;
            }
            rangesByScopeId.set(rail.id, {
                ...currentRange,
                endLineNumber: display.lineNumber,
            });
        });
    });
    return [...rangesByScopeId.values()].sort((left, right) => left.id - right.id);
}
function collectScopeLineMarkers(line, syntaxConfig) {
    const markers = [];
    let rest = line.trim();
    while (rest.length > 0) {
        const match = rest.match(/^<!--([\s\S]*?)-->/u);
        if (match === null) {
            return [];
        }
        const parsedBody = parseKmarkScopeCommentBody(match[1] ?? "", syntaxConfig);
        if (parsedBody === null) {
            return [];
        }
        const directiveText = parsedBody.directiveText.trim();
        const marker = parseScopeLineMarker(directiveText);
        if (marker === null) {
            return [];
        }
        markers.push(marker);
        rest = rest.slice(match[0].length).trim();
    }
    return markers;
}
function parseScopeLineMarker(directiveText) {
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
    };
}
function parseScopeMetadata(directiveText) {
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
function normalizeScopeOpenContent(directiveText) {
    const content = directiveText.slice(1).trim();
    return content.endsWith("}")
        ? content.slice(0, -1).trim()
        : content;
}
function parseDefineValue(content) {
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
function resolveDepthPalette(depthIndex) {
    return PALETTE_KEYS[depthIndex % PALETTE_KEYS.length] ?? "tone-0";
}
function resolveMarkdownFenceLine(line, activeFence) {
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
function parseMarkdownFenceOpen(line) {
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
function isMarkdownFenceClose(line, fence) {
    const rest = stripMarkdownFenceIndent(line);
    if (rest === null) {
        return false;
    }
    const length = countLeadingCharacters(rest, fence.marker);
    return length >= fence.length && rest.slice(length).trim().length === 0;
}
function stripMarkdownFenceIndent(line) {
    const indent = line.match(/^ */u)?.[0].length ?? 0;
    if (indent > 3) {
        return null;
    }
    return line.slice(indent);
}
function countLeadingCharacters(value, character) {
    let count = 0;
    while (value[count] === character) {
        count += 1;
    }
    return count;
}
