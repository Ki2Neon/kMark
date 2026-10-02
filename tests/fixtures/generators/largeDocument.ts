/** Deterministic source shared by browser and performance tests. */
export function largeDocument(pageCount: number, diagramCount = 0): string {
  if (!Number.isInteger(pageCount) || pageCount < 0 || !Number.isInteger(diagramCount) || diagramCount < 0) {
    throw new RangeError("pageCount and diagramCount must be non-negative integers");
  }

  const pages = Array.from({ length: pageCount }, (_, index) =>
    `# Page ${index + 1}\n\n${`Paragraph ${index + 1}. `.repeat(24)}\n`,
  );
  const diagrams = Array.from({ length: diagramCount }, (_, index) =>
    `\n\x60\x60\x60plantuml\n@startuml\nA -> B: diagram ${index + 1}\n@enduml\n\x60\x60\x60\n`,
  );
  return [...pages, ...diagrams].join("\n");
}
