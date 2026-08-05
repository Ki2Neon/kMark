const MERMAID_LINE_BREAK_TAG_PATTERN = /<\s*\/?\s*br\s*\/?\s*>/giu;

export function normalizeMermaidLineBreakTags(source: string): string {
  return source.replace(MERMAID_LINE_BREAK_TAG_PATTERN, "<br/>");
}
