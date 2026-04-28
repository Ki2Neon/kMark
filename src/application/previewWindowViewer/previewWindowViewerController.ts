import {
  type PreviewWindowViewerGateway,
  type PreviewWindowViewerRenderedPreview,
  type PreviewWindowViewerRenderer,
  type PreviewWindowViewerSnapshot,
  type PreviewWindowViewerState,
} from "./previewWindowViewerPorts";

type PreviewWindowViewerControllerDependencies = {
  readonly gateway: PreviewWindowViewerGateway;
  readonly renderer: PreviewWindowViewerRenderer;
};

export class PreviewWindowViewerController {
  readonly #gateway: PreviewWindowViewerGateway;
  readonly #renderer: PreviewWindowViewerRenderer;

  constructor(dependencies: PreviewWindowViewerControllerDependencies) {
    this.#gateway = dependencies.gateway;
    this.#renderer = dependencies.renderer;
  }

  createState(
    fallbackSnapshot: PreviewWindowViewerSnapshot,
    search = typeof window === "undefined" ? "" : window.location.search,
  ): PreviewWindowViewerState {
    const instanceId = this.#gateway.resolveInstanceId(search);

    if (instanceId === null) {
      return {
        activeSourceLine: null,
        cursorSyncStorageKey: null,
        instanceId,
        snapshot: fallbackSnapshot,
        snapshotStorageKey: null,
      };
    }

    return {
      activeSourceLine: this.#gateway.loadActiveSourceLine(instanceId),
      cursorSyncStorageKey: this.#gateway.getCursorSyncStorageKey(instanceId),
      instanceId,
      snapshot: this.#gateway.loadSnapshot(instanceId) ?? fallbackSnapshot,
      snapshotStorageKey: this.#gateway.getSnapshotStorageKey(instanceId),
    };
  }

  loadSnapshot(instanceId: string | null, fallbackSnapshot: PreviewWindowViewerSnapshot): PreviewWindowViewerSnapshot {
    if (instanceId === null) {
      return fallbackSnapshot;
    }

    return this.#gateway.loadSnapshot(instanceId) ?? fallbackSnapshot;
  }

  loadActiveSourceLine(instanceId: string | null): number | null {
    if (instanceId === null) {
      return null;
    }

    return this.#gateway.loadActiveSourceLine(instanceId);
  }

  requestEditJump(instanceId: string | null, lineNumber: number): void {
    if (instanceId === null) {
      return;
    }

    this.#gateway.requestEditJump(instanceId, lineNumber);
  }

  renderSnapshot(snapshot: PreviewWindowViewerSnapshot): PreviewWindowViewerRenderedPreview {
    return {
      html: this.#renderer.render(snapshot.content),
      pageHtmls: this.#renderer.renderPages(snapshot.content),
    };
  }
}
