import type {
  RenderedPagePayload,
  SessionPreviewPayload,
} from "../../contracts/generated";

/** Presentation-only cache. Markdown semantics and invalidation remain in Rust. */
export type SessionPreviewState = {
  readonly revision: number;
  readonly sections: readonly (readonly RenderedPagePayload[])[];
  readonly defaultPageStyle: Extract<SessionPreviewPayload, { kind: "full" }>["defaultPageStyle"];
  readonly defaultTextStyle: Extract<SessionPreviewPayload, { kind: "full" }>["defaultTextStyle"];
};

export function applySessionPreviewResponse(
  current: SessionPreviewState | null,
  response: SessionPreviewPayload,
): SessionPreviewState | null {
  if (response.kind === "full") {
    return {
      revision: response.revision,
      sections: response.sections,
      defaultPageStyle: response.defaultPageStyle,
      defaultTextStyle: response.defaultTextStyle,
    };
  }
  if (
    current === null
    || current.revision !== response.baseRevision
    || response.revision <= response.baseRevision
    || response.sectionIndex < 0
    || response.sectionIndex >= current.sections.length
  ) {
    return null;
  }
  const sections = [...current.sections];
  sections[response.sectionIndex] = response.pages;
  return { ...current, revision: response.revision, sections };
}

/** Full responses may still contain unchanged sections; avoid reprocessing their diagrams. */
export function changedSessionPreviewSectionIndices(
  previous: SessionPreviewState | null,
  next: SessionPreviewState,
): number[] {
  if (previous === null || previous.sections.length !== next.sections.length) {
    return next.sections.map((_, index) => index);
  }
  const changed: number[] = [];
  for (const [index, section] of next.sections.entries()) {
    const old = previous.sections[index];
    if (old !== section && JSON.stringify(old) !== JSON.stringify(section)) {
      changed.push(index);
    }
  }
  return changed;
}
