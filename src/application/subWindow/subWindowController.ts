import {
  SUB_WINDOW_STATE_VERSION,
  type SubWindowGateway,
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

  constructor(dependencies: SubWindowControllerDependencies) {
    this.#clock = dependencies.clock;
    this.#gateway = dependencies.gateway;
  }

  async open(request: SubWindowStateRequest): Promise<void> {
    await this.#gateway.open(this.#createState(request));
  }

  load(stateKey: string | null): Promise<SubWindowState | null> {
    return this.#gateway.load(stateKey);
  }

  publish(request: SubWindowStateRequest): Promise<void> {
    return this.#gateway.publish(this.#createState(request));
  }

  subscribe(
    stateKey: string | null,
    callback: (state: SubWindowState) => void,
  ): Promise<() => void> {
    return this.#gateway.listen(stateKey, callback);
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
