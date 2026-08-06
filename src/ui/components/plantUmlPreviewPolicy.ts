export type PlantUmlDiagramDomState = "error" | "loading" | "rendered" | "stale";

const PRESERVABLE_PLANTUML_DIAGRAM_STATES = new Set<PlantUmlDiagramDomState>([
  "error",
  "loading",
  "rendered",
  "stale",
]);

export function shouldPreservePlantUmlDiagramDom(
  currentState: string | undefined,
  nextState: string | undefined,
): boolean {
  return currentState !== undefined
    && currentState === nextState
    && PRESERVABLE_PLANTUML_DIAGRAM_STATES.has(currentState as PlantUmlDiagramDomState);
}
