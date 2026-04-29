import {
  type PreviewWindowEditJumpRequest,
  type PreviewWindowSessionGateway,
  type PreviewWindowSnapshot,
} from "./previewWindowSessionPorts";

type PreviewWindowSessionControllerDependencies = {
  readonly gateway: PreviewWindowSessionGateway;
};

export class PreviewWindowSessionController {
  readonly #gateway: PreviewWindowSessionGateway;

  constructor(dependencies: PreviewWindowSessionControllerDependencies) {
    this.#gateway = dependencies.gateway;
  }

  openPreviewWindow(
    snapshot: PreviewWindowSnapshot,
    activeSourceLine: number | null,
  ): Promise<void> {
    return this.#gateway.openWindow(snapshot, activeSourceLine);
  }

  syncPreviewState(
    snapshot: PreviewWindowSnapshot,
    activeSourceLine: number | null,
  ): Promise<void> {
    return this.#gateway.syncState(snapshot, activeSourceLine);
  }

  subscribeToEditJumpRequests(
    callback: (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => void,
  ): Promise<() => void> {
    return this.#gateway.listenForEditJumpRequests(callback);
  }
}
