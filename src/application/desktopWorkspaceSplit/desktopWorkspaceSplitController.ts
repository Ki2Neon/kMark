import { type DesktopWorkspaceSplitGateway } from "./desktopWorkspaceSplitPorts";

const DESKTOP_DIVIDER_WIDTH = 8;
const DESKTOP_MIN_PANEL_WIDTH = 180;
const DESKTOP_SPLIT_KEYBOARD_STEP = 5;

type DesktopWorkspaceSplitControllerDependencies = {
  readonly gateway: DesktopWorkspaceSplitGateway;
};

export class DesktopWorkspaceSplitController {
  readonly #gateway: DesktopWorkspaceSplitGateway;

  constructor(dependencies: DesktopWorkspaceSplitControllerDependencies) {
    this.#gateway = dependencies.gateway;
  }

  createState(): number {
    return this.#gateway.defaultRatio;
  }

  getMaximumRatio(): number {
    return this.#gateway.maximumRatio;
  }

  getMinimumRatio(): number {
    return this.#gateway.minimumRatio;
  }

  async loadRatio(): Promise<number> {
    return this.#gateway.loadRatio();
  }

  async subscribeToRatio(callback: (splitRatio: number) => void): Promise<() => void> {
    return this.#gateway.listenRatio(callback);
  }

  async persistRatio(splitRatio: number): Promise<number> {
    return this.#gateway.persistRatio(splitRatio);
  }

  resetRatio(): number {
    return this.#gateway.defaultRatio;
  }

  resolvePointerRatio(clientX: number, workspaceLeft: number, workspaceWidth: number): number | null {
    const availableWidth = workspaceWidth - DESKTOP_DIVIDER_WIDTH;

    if (availableWidth <= 0) {
      return null;
    }

    return this.#clampRatio(
      ((clientX - workspaceLeft - DESKTOP_DIVIDER_WIDTH / 2) / availableWidth) * 100,
      availableWidth,
    );
  }

  resolveKeyboardRatio(key: string, currentRatio: number, workspaceWidth: number): number | null {
    const availableWidth = workspaceWidth - DESKTOP_DIVIDER_WIDTH;

    if (availableWidth <= 0) {
      return null;
    }

    if (key === "Home") {
      return this.#clampRatio(this.#gateway.minimumRatio, availableWidth);
    }

    if (key === "End") {
      return this.#clampRatio(this.#gateway.maximumRatio, availableWidth);
    }

    if (key !== "ArrowLeft" && key !== "ArrowRight") {
      return null;
    }

    const delta = key === "ArrowLeft" ? -DESKTOP_SPLIT_KEYBOARD_STEP : DESKTOP_SPLIT_KEYBOARD_STEP;

    return this.#clampRatio(currentRatio + delta, availableWidth);
  }

  #clampRatio(splitRatio: number, containerWidth: number): number {
    if (containerWidth <= DESKTOP_MIN_PANEL_WIDTH * 2) {
      return this.#gateway.defaultRatio;
    }

    const minRatio = Math.max(
      this.#gateway.minimumRatio,
      (DESKTOP_MIN_PANEL_WIDTH / containerWidth) * 100,
    );
    const maxRatio = Math.min(this.#gateway.maximumRatio, 100 - minRatio);

    return Math.min(maxRatio, Math.max(minRatio, splitRatio));
  }
}
