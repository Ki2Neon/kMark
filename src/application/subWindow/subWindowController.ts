import {
  SUB_WINDOW_STATE_VERSION,
  type SubWindowGateway,
  type SubWindowResolvedSourceState,
  type SubWindowSelection,
  type SubWindowSourceStateChanged,
  type SubWindowSourcesSnapshot,
  type SubWindowSourceLineSelectionRequest,
  type SubWindowState,
  type SubWindowStateRequest,
} from "./subWindowPorts";

export type SubWindowClock = {
  now(): number;
};

type SubWindowControllerDependencies = {
  readonly clock: SubWindowClock;
  readonly gateway: SubWindowGateway;
};

export class SubWindowController {
  readonly #clock: SubWindowClock;
  readonly #gateway: SubWindowGateway;
  #nextRevision = 0;
  #nextSourceLineSelectionRequestId = 0;

  constructor(dependencies: SubWindowControllerDependencies) {
    this.#clock = dependencies.clock;
    this.#gateway = dependencies.gateway;
  }

  activateSource(sourceId: string): Promise<void> {
    return this.#gateway.activateSource(sourceId);
  }

  getSources(): Promise<SubWindowSourcesSnapshot> {
    return this.#gateway.getSources();
  }

  getSourceState(selection: SubWindowSelection): Promise<SubWindowResolvedSourceState> {
    return this.#gateway.getSourceState(selection);
  }

  listenSourceStateChanged(
    callback: (change: SubWindowSourceStateChanged) => void,
  ): Promise<() => void> {
    return this.#gateway.listenSourceStateChanged(callback);
  }

  listenSourcesChanged(
    callback: (snapshot: SubWindowSourcesSnapshot) => void,
  ): Promise<() => void> {
    return this.#gateway.listenSourcesChanged(callback);
  }

  async open(): Promise<void> {
    await this.#gateway.open();
  }

  publishSourceState(sourceId: string, request: SubWindowStateRequest): Promise<void> {
    return this.#gateway.publishSourceState(sourceId, this.#createState(request));
  }

  registerSource(request: SubWindowStateRequest): Promise<string> {
    return this.#gateway.registerSource(this.#createState(request));
  }

  requestSourceLineSelection(sourceId: string, lineNumber: number): Promise<void> {
    this.#nextSourceLineSelectionRequestId += 1;

    return this.#gateway.requestSourceLineSelection({
      lineNumber,
      requestId: this.#nextSourceLineSelectionRequestId,
      requestedAtEpochMs: this.#clock.now(),
      sourceId,
    });
  }

  subscribeSourceLineSelection(
    callback: (request: SubWindowSourceLineSelectionRequest) => void,
  ): Promise<() => void> {
    return this.#gateway.listenSourceLineSelection(callback);
  }

  unregisterSource(sourceId: string): Promise<void> {
    return this.#gateway.unregisterSource(sourceId);
  }

  #createState(request: SubWindowStateRequest): SubWindowState {
    this.#nextRevision += 1;

    return {
      ...request,
      version: SUB_WINDOW_STATE_VERSION,
      revision: this.#nextRevision,
      updatedAtEpochMs: this.#clock.now(),
    };
  }
}
