const KMARK_COMMENT_PATTERN = /<!--\s*kmark\b([\s\S]*?)-->/gu;

export function collectKmarkDefinitions(markdown: string): readonly string[] {
  const definitions = new Set<string>();

  for (const match of markdown.matchAll(KMARK_COMMENT_PATTERN)) {
    const directiveText = match[1] ?? "";

    for (const token of directiveText.split(/\s+/u)) {
      const [name, value] = token.split(":", 2);

      if (name !== "define" || value === undefined) {
        continue;
      }

      const normalizedName = normalizeKmarkDefinitionName(value);

      if (normalizedName !== null) {
        definitions.add(normalizedName);
      }
    }
  }

  return [...definitions].sort((left, right) => left.localeCompare(right, "ja-JP"));
}

function normalizeKmarkDefinitionName(value: string): string | null {
  const normalized = value.trim().replace(/^["']|["']$/gu, "");

  if (!/^[A-Za-z0-9_-]+$/u.test(normalized)) {
    return null;
  }

  return normalized;
}
