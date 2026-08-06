function skipQuotedString(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
    } else if (source[index] === '"') {
      return index + 1;
    }
  }
  return source.length;
}

function skipHtmlString(source: string, start: number): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "<") {
      depth += 1;
    } else if (character === ">" && --depth === 0) {
      return index + 1;
    }
  }
  return source.length;
}

function skipLine(source: string, start: number): number {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline + 1;
}

export function withTransparentDotBackground(source: string): string {
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      index = skipQuotedString(source, index) - 1;
    } else if (character === "<") {
      index = skipHtmlString(source, index) - 1;
    } else if (character === "/" && next === "/") {
      index = skipLine(source, index + 2) - 1;
    } else if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 1;
    } else if (character === "#") {
      index = skipLine(source, index + 1) - 1;
    } else if (character === "{") {
      // Insert before all user statements so an explicit bgcolor remains authoritative.
      return `${source.slice(0, index + 1)}\nbgcolor=transparent;${source.slice(index + 1)}`;
    }
  }
  return source;
}
