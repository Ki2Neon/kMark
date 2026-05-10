import { collectKmarkDirectiveOccurrences } from "./scanKmarkDirectives";

export function collectKmarkDefinitions(markdown: string): readonly string[] {
  const definitions = new Set<string>();

  for (const occurrence of collectKmarkDirectiveOccurrences(markdown)) {
    for (const token of occurrence.directiveText.matchAll(/[^\s{}]+/gu)) {
      const [name, value] = token[0].split(":", 2);

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

export function normalizeKmarkDefinitionName(value: string): string | null {
  const normalized = value.trim().replace(/^["']|["']$/gu, "");

  if (!/^[A-Za-z0-9_-]+$/u.test(normalized)) {
    return null;
  }

  return normalized;
}
