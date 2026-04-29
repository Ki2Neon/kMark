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

  createFallbackState(
    fallbackSnapshot: PreviewWindowViewerSnapshot,
  ): PreviewWindowViewerState {
    return {
      activeSourceLine: null,
      snapshot: fallbackSnapshot,
    };
  }

  async loadState(
    fallbackSnapshot: PreviewWindowViewerSnapshot,
  ): Promise<PreviewWindowViewerState> {
    const previewWindowViewerState = await this.#gateway.loadState();

    return {
      activeSourceLine: previewWindowViewerState.activeSourceLine,
      snapshot: {
        content: previewWindowViewerState.snapshot.content,
        fileName:
          previewWindowViewerState.snapshot.fileName.trim().length > 0
            ? previewWindowViewerState.snapshot.fileName
            : fallbackSnapshot.fileName,
      },
    };
  }

  subscribeToStateUpdates(
    callback: (previewWindowViewerState: PreviewWindowViewerState) => void,
  ): Promise<() => void> {
    return this.#gateway.listenForStateUpdates(callback);
  }

  requestEditJump(lineNumber: number): Promise<void> {
    return this.#gateway.requestEditJump(lineNumber);
  }

  async renderSnapshot(snapshot: PreviewWindowViewerSnapshot): Promise<PreviewWindowViewerRenderedPreview> {
    return this.#renderer.render(snapshot.content);
  }
}
