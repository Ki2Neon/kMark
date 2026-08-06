export type GeneratedSvgDiagramDomState = "error" | "loading" | "rendered" | "stale";

const PRESERVABLE_GENERATED_SVG_DIAGRAM_STATES = new Set<GeneratedSvgDiagramDomState>([
  "error",
  "loading",
  "rendered",
  "stale",
]);

export function shouldPreserveGeneratedSvgDiagramDom(
  currentState: string | undefined,
  nextState: string | undefined,
): boolean {
  return currentState !== undefined
    && currentState === nextState
    && PRESERVABLE_GENERATED_SVG_DIAGRAM_STATES.has(currentState as GeneratedSvgDiagramDomState);
}
