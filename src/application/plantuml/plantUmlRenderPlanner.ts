export type GeneratedSvgDiagramDescriptor = {
  readonly engine: "dot" | "plantuml";
  readonly finalizeSignature: string;
  readonly rawSignature: string;
  readonly source: string;
};

export type GeneratedSvgDiagramSnapshotDescriptor = {
  readonly failedSignature: string | null;
  readonly finalizeSignature: string;
  readonly generation: number;
  readonly hasFinalizedSvg: boolean;
  readonly hasRawSvg: boolean;
  readonly inFlightSignature: string | null;
  readonly instanceId: string;
  readonly rawSignature: string;
};

export type GeneratedSvgDiagramRenderAction =
  | "finalize"
  | "render"
  | "reuse-error"
  | "reuse-finalized"
  | "reuse-inflight";

export type PlannedGeneratedSvgDiagram = {
  readonly action: GeneratedSvgDiagramRenderAction;
  readonly descriptor: GeneratedSvgDiagramDescriptor;
  readonly generation: number;
  readonly instanceId: string;
};

function resolveAction(
  next: GeneratedSvgDiagramDescriptor,
  previous: GeneratedSvgDiagramSnapshotDescriptor,
): GeneratedSvgDiagramRenderAction {
  if (previous.failedSignature === next.finalizeSignature) {
    return "reuse-error";
  }
  if (previous.inFlightSignature === next.finalizeSignature) {
    return "reuse-inflight";
  }
  if (previous.finalizeSignature === next.finalizeSignature && previous.hasFinalizedSvg) {
    return "reuse-finalized";
  }
  if (previous.rawSignature === next.rawSignature && previous.hasRawSvg) {
    return "finalize";
  }
  return "render";
}

export function planGeneratedSvgDiagramUpdates(
  nextDiagrams: readonly GeneratedSvgDiagramDescriptor[],
  previousDiagrams: readonly GeneratedSvgDiagramSnapshotDescriptor[],
  createInstanceId: () => string,
): readonly PlannedGeneratedSvgDiagram[] {
  return nextDiagrams.map<PlannedGeneratedSvgDiagram>((descriptor, index) => {
    const previous = previousDiagrams[index];
    if (previous === undefined) {
      return {
        action: "render",
        descriptor,
        generation: 1,
        instanceId: createInstanceId(),
      };
    }

    const action = resolveAction(descriptor, previous);
    return {
      action,
      descriptor,
      generation: action === "reuse-error" || action === "reuse-finalized" || action === "reuse-inflight"
        ? previous.generation
        : previous.generation + 1,
      instanceId: previous.instanceId,
    };
  });
}
