export type PlantUmlStdlibAsset = {
  readonly displayName: string;
  readonly key: string;
  readonly version: string;
};

function meaningfulBodyLines(lines: readonly string[]): string[] {
  const result: string[] = [];
  let insideBlockComment = false;

  for (const line of lines) {
    const value = line.trim();
    if (insideBlockComment) {
      if (value.includes("'/")) {
        insideBlockComment = false;
      }
      continue;
    }
    if (value.startsWith("/'")) {
      insideBlockComment = !value.includes("'/", 2);
      continue;
    }
    if (value.length === 0 || value.startsWith("'")) {
      continue;
    }
    result.push(value);
  }

  return result;
}

export function resolveBundledStdlibListingSource(
  source: string,
  assets: readonly PlantUmlStdlibAsset[],
): string {
  const lines = source.split(/\r\n|\r|\n/gu);
  while (lines[0]?.trim().length === 0) {
    lines.shift();
  }
  while (lines[lines.length - 1]?.trim().length === 0) {
    lines.pop();
  }

  const start = lines[0]?.trim() ?? "";
  const end = lines[lines.length - 1]?.trim() ?? "";
  if (!/^@startuml(?:\s+\S.*)?$/iu.test(start) || !/^@enduml$/iu.test(end)) {
    return source;
  }
  const body = meaningfulBodyLines(lines.slice(1, -1));
  if (body.length !== 1 || body[0].toLowerCase() !== "stdlib") {
    return source;
  }

  const rows = [...assets]
    .sort((left, right) => (left.key < right.key ? -1 : Number(left.key > right.key)))
    .map((asset) => `| ${asset.key} | ${asset.displayName} | ${asset.version || "-"} |`);
  return [
    start,
    "title Bundled PlantUML Standard Libraries",
    "legend",
    "|= Library |= Name |= Version |",
    ...rows,
    "endlegend",
    "@enduml",
  ].join("\n");
}
