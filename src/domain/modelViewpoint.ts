export type ModelProjection = "orthographic" | "perspective";

export type ModelViewpoint = {
  readonly fov: number | null;
  readonly position: readonly [number, number, number];
  readonly projection: ModelProjection;
  readonly target: readonly [number, number, number];
  readonly zoom: number;
};

export type SaveModelViewpointResult = {
  readonly markdown: string;
  readonly savedLineNumber: number;
};

type ParsedKmarkDirectiveLine = {
  readonly directiveText: string;
  readonly indent: string;
  readonly marker: string;
};

const MODEL_VIEWPOINT_PARAM_NAMES = [
  "model_view",
  "model_projection",
  "model_fov",
  "model_camera_yaw",
  "model_camera_pitch",
  "model_camera_distance",
  "model_camera_position",
  "model_camera_target",
  "model_camera_zoom",
] as const;
const MODEL_VIEWPOINT_PARAM_PATTERN = new RegExp(
  `(^|\\s)(?:${MODEL_VIEWPOINT_PARAM_NAMES.join("|")}):(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^\\s{}]+)`,
  "gu",
);

export function saveModelViewpointToMarkdown(input: {
  readonly markdown: string;
  readonly modelSourceLineNumber: number;
  readonly viewpoint: ModelViewpoint;
}): SaveModelViewpointResult | null {
  const lineEnding = detectLineEnding(input.markdown);
  const normalizedMarkdown = input.markdown.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
  const lines = normalizedMarkdown.split("\n");
  const contentLineCount = normalizedMarkdown.endsWith("\n")
    ? Math.max(0, lines.length - 1)
    : lines.length;
  const modelLineIndex = input.modelSourceLineNumber - 1;

  if (
    !Number.isInteger(input.modelSourceLineNumber)
    || modelLineIndex < 0
    || modelLineIndex >= contentLineCount
  ) {
    return null;
  }

  const directiveText = createModelViewpointDirectiveText(input.viewpoint);
  const existingDirectiveIndex = findReusableKmarkDirectiveLine(lines, modelLineIndex);

  if (existingDirectiveIndex !== null) {
    const parsedLine = parseKmarkDirectiveLine(lines[existingDirectiveIndex]);

    if (parsedLine === null) {
      return null;
    }

    lines[existingDirectiveIndex] = formatKmarkDirectiveLine({
      ...parsedLine,
      directiveText: mergeModelViewpointDirectiveText(parsedLine.directiveText, directiveText),
    });

    return {
      markdown: restoreLineEndings(lines.join("\n"), lineEnding),
      savedLineNumber: existingDirectiveIndex + 1,
    };
  }

  const modelLineIndent = lines[modelLineIndex]?.match(/^\s*/u)?.[0] ?? "";
  lines.splice(modelLineIndex, 0, `${modelLineIndent}<!-- kmark ${directiveText} -->`);

  return {
    markdown: restoreLineEndings(lines.join("\n"), lineEnding),
    savedLineNumber: modelLineIndex + 1,
  };
}

function detectLineEnding(markdown: string): "\n" | "\r" | "\r\n" {
  if (markdown.includes("\r\n")) {
    return "\r\n";
  }

  return markdown.includes("\r") ? "\r" : "\n";
}

function restoreLineEndings(markdown: string, lineEnding: "\n" | "\r" | "\r\n"): string {
  return lineEnding === "\n" ? markdown : markdown.replace(/\n/gu, lineEnding);
}

function createModelViewpointDirectiveText(viewpoint: ModelViewpoint): string {
  const params = [
    `model_projection:${viewpoint.projection}`,
    viewpoint.projection === "perspective" && isFiniteNumber(viewpoint.fov)
      ? `model_fov:${formatNumber(viewpoint.fov)}`
      : null,
    `model_camera_position:${formatVector(viewpoint.position)}`,
    `model_camera_target:${formatVector(viewpoint.target)}`,
    isMeaningfulZoom(viewpoint.zoom) ? `model_camera_zoom:${formatNumber(viewpoint.zoom)}` : null,
  ];

  return params.filter((param): param is string => param !== null).join(" ");
}

function mergeModelViewpointDirectiveText(currentDirectiveText: string, viewpointDirectiveText: string): string {
  const preservedDirectiveText = currentDirectiveText
    .replace(MODEL_VIEWPOINT_PARAM_PATTERN, "$1")
    .replace(/\s+/gu, " ")
    .trim();

  return preservedDirectiveText.length === 0
    ? viewpointDirectiveText
    : `${preservedDirectiveText} ${viewpointDirectiveText}`;
}

function findReusableKmarkDirectiveLine(lines: readonly string[], modelLineIndex: number): number | null {
  let fallbackDirectiveIndex: number | null = null;

  for (let index = modelLineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      return fallbackDirectiveIndex;
    }

    const parsedLine = parseKmarkDirectiveLine(line);

    if (parsedLine === null || isScopeDirectiveText(parsedLine.directiveText)) {
      return fallbackDirectiveIndex;
    }

    if (containsModelViewpointParam(parsedLine.directiveText)) {
      return index;
    }

    if (isDefinitionDirectiveText(parsedLine.directiveText)) {
      return fallbackDirectiveIndex;
    }

    fallbackDirectiveIndex ??= index;
  }

  return fallbackDirectiveIndex;
}

function parseKmarkDirectiveLine(line: string): ParsedKmarkDirectiveLine | null {
  const match = /^(\s*)<!--\s*(kmark|k)\b([\s\S]*?)-->\s*$/u.exec(line);

  if (match === null) {
    return null;
  }

  return {
    directiveText: (match[3] ?? "").trim(),
    indent: match[1] ?? "",
    marker: match[2] ?? "kmark",
  };
}

function formatKmarkDirectiveLine(line: ParsedKmarkDirectiveLine): string {
  return `${line.indent}<!-- ${line.marker} ${line.directiveText} -->`;
}

function isScopeDirectiveText(directiveText: string): boolean {
  const trimmedDirectiveText = directiveText.trim();

  return trimmedDirectiveText === "}"
    || trimmedDirectiveText.startsWith("{")
    || trimmedDirectiveText.includes(" }");
}

function containsModelViewpointParam(directiveText: string): boolean {
  MODEL_VIEWPOINT_PARAM_PATTERN.lastIndex = 0;

  return MODEL_VIEWPOINT_PARAM_PATTERN.test(directiveText);
}

function isDefinitionDirectiveText(directiveText: string): boolean {
  return /(^|\s)define:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s{}]+)/u.test(directiveText);
}

function formatVector(vector: readonly [number, number, number]): string {
  return vector.map(formatNumber).join(",");
}

function formatNumber(value: number): string {
  const normalizedValue = Math.abs(value) < 0.0000005 ? 0 : Number(value.toFixed(6));

  return Object.is(normalizedValue, -0) ? "0" : String(normalizedValue);
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isMeaningfulZoom(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Math.abs(value - 1) > 0.000001;
}
