export type PlantUmlDiagramDescriptor = {
  readonly finalizeSignature: string;
  readonly order: number;
  readonly rawSignature: string;
  readonly source: string;
};

export type PlantUmlDiagramSnapshotDescriptor = PlantUmlDiagramDescriptor & {
  readonly failedSignature: string | null;
  readonly generation: number;
  readonly hasFinalizedSvg: boolean;
  readonly hasRawSvg: boolean;
  readonly inFlightSignature: string | null;
  readonly instanceId: string;
};

export type PlantUmlDiagramRenderAction =
  | "finalize"
  | "render"
  | "reuse-error"
  | "reuse-finalized"
  | "reuse-inflight";

export type PlannedPlantUmlDiagram = {
  readonly action: PlantUmlDiagramRenderAction;
  readonly descriptor: PlantUmlDiagramDescriptor;
  readonly generation: number;
  readonly instanceId: string;
  readonly previousIndex: number | null;
};

export type PlantUmlDiagramRenderPlan = {
  readonly diagrams: readonly PlannedPlantUmlDiagram[];
  readonly obsoletePreviousIndexes: readonly number[];
};

type Candidate = {
  readonly index: number;
  readonly outputRank: number;
  readonly positionDistance: number;
  readonly rawRank: number;
};

function compareCandidate(left: Candidate, right: Candidate): number {
  return left.outputRank - right.outputRank
    || left.rawRank - right.rawRank
    || left.positionDistance - right.positionDistance
    || left.index - right.index;
}

function resolveAction(
  next: PlantUmlDiagramDescriptor,
  previous: PlantUmlDiagramSnapshotDescriptor,
): PlantUmlDiagramRenderAction {
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

export function planPlantUmlDiagramUpdates(
  nextDiagrams: readonly PlantUmlDiagramDescriptor[],
  previousDiagrams: readonly PlantUmlDiagramSnapshotDescriptor[],
  createInstanceId: () => string,
): PlantUmlDiagramRenderPlan {
  const previousBySource = new Map<string, number[]>();
  const consumedPreviousIndexes = new Set<number>();

  previousDiagrams.forEach((diagram, index) => {
    const indexes = previousBySource.get(diagram.source) ?? [];
    indexes.push(index);
    previousBySource.set(diagram.source, indexes);
  });

  const diagrams = nextDiagrams.map<PlannedPlantUmlDiagram>((descriptor) => {
    const candidates = (previousBySource.get(descriptor.source) ?? [])
      .filter((index) => !consumedPreviousIndexes.has(index))
      .map<Candidate>((index) => {
        const previous = previousDiagrams[index];
        return {
          index,
          outputRank: Number(
            previous.finalizeSignature !== descriptor.finalizeSignature
            && previous.failedSignature !== descriptor.finalizeSignature
            && previous.inFlightSignature !== descriptor.finalizeSignature
          ),
          positionDistance: Math.abs(previous.order - descriptor.order),
          rawRank: Number(previous.rawSignature !== descriptor.rawSignature),
        };
      })
      .sort(compareCandidate);
    const candidate = candidates[0];

    if (candidate === undefined) {
      return {
        action: "render",
        descriptor,
        generation: 1,
        instanceId: createInstanceId(),
        previousIndex: null,
      };
    }

    consumedPreviousIndexes.add(candidate.index);
    const previous = previousDiagrams[candidate.index];
    const action = resolveAction(descriptor, previous);
    return {
      action,
      descriptor,
      generation: action === "reuse-error" || action === "reuse-finalized" || action === "reuse-inflight"
        ? previous.generation
        : previous.generation + 1,
      instanceId: previous.instanceId,
      previousIndex: candidate.index,
    };
  });

  return {
    diagrams,
    obsoletePreviousIndexes: previousDiagrams
      .map((_diagram, index) => index)
      .filter((index) => !consumedPreviousIndexes.has(index)),
  };
}
