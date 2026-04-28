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

  resolveInstanceId(): Promise<string> {
    return this.#gateway.resolveInstanceId();
  }

  openPreviewWindow(
    currentInstanceId: string | null,
    snapshot: PreviewWindowSnapshot,
  ): Promise<string> {
    return this.#openPreviewWindow(currentInstanceId, snapshot);
  }

  getEditJumpRequestStorageKey(instanceId: string | null): string | null {
    if (instanceId === null) {
      return null;
    }

    return this.#gateway.getEditJumpRequestStorageKey(instanceId);
  }

  syncPreviewState(
    instanceId: string | null,
    snapshot: PreviewWindowSnapshot,
    activeSourceLine: number | null,
  ): void {
    if (instanceId === null) {
      return;
    }

    this.#gateway.persistSnapshot(instanceId, snapshot);
    this.#gateway.persistActiveSourceLine(instanceId, activeSourceLine);
  }

  readNextEditJumpRequest(
    instanceId: string | null,
    lastHandledRequestId: number | null,
  ): PreviewWindowEditJumpRequest | null {
    if (instanceId === null) {
      return null;
    }

    const nextEditJumpRequest = this.#gateway.loadEditJumpRequest(instanceId);

    if (nextEditJumpRequest === null || nextEditJumpRequest.requestId === lastHandledRequestId) {
      return null;
    }

    return nextEditJumpRequest;
  }

  async #openPreviewWindow(
    currentInstanceId: string | null,
    snapshot: PreviewWindowSnapshot,
  ): Promise<string> {
    const instanceId = currentInstanceId ?? await this.#gateway.resolveInstanceId();

    this.#gateway.persistSnapshot(instanceId, snapshot);
    await this.#gateway.openWindow(instanceId);

    return instanceId;
  }
}
