import {
  PRESENTATION_WINDOW_SNAPSHOT_VERSION,
  type PresentationWindowGateway,
  type PresentationWindowSnapshot,
} from "./presentationWindowPorts";

export type PresentationWindowClock = {
  now(): number;
};

export type OpenPresentationWindowRequest = Omit<
  PresentationWindowSnapshot,
  "createdAtEpochMs" | "version"
>;

type PresentationWindowControllerDependencies = {
  readonly clock: PresentationWindowClock;
  readonly gateway: PresentationWindowGateway;
};

export class PresentationWindowController {
  readonly #clock: PresentationWindowClock;
  readonly #gateway: PresentationWindowGateway;

  constructor(dependencies: PresentationWindowControllerDependencies) {
    this.#clock = dependencies.clock;
    this.#gateway = dependencies.gateway;
  }

  async open(request: OpenPresentationWindowRequest): Promise<void> {
    await this.#gateway.open({
      ...request,
      version: PRESENTATION_WINDOW_SNAPSHOT_VERSION,
      createdAtEpochMs: this.#clock.now(),
    });
  }

  load(snapshotKey: string): PresentationWindowSnapshot | null {
    return this.#gateway.load(snapshotKey);
  }
}
