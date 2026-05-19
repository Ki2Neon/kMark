import {
  type PageStyle,
  type PreviewDisplayMode,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";

export const SUB_WINDOW_STATE_VERSION = 3;
export const DEFAULT_SUB_WINDOW_PAGE_TRANSITION_FADE_MS = 80;
export const MAX_SUB_WINDOW_PAGE_TRANSITION_FADE_MS = 5000;
export const MIN_SUB_WINDOW_PAGE_TRANSITION_FADE_MS = 0;

export type SubWindowState = {
  readonly version: typeof SUB_WINDOW_STATE_VERSION;
  readonly revision: number;
  readonly updatedAtEpochMs: number;
  readonly title: string;
  readonly displayMode: PreviewDisplayMode;
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pageTransitionFadeMs: number;
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
  readonly activeSourceLine: number | null;
};

export type SubWindowStateRequest = Omit<
  SubWindowState,
  "revision" | "updatedAtEpochMs" | "version"
>;

export type SubWindowSelection =
  | {
    readonly mode: "auto";
  }
  | {
    readonly mode: "source";
    readonly sourceId: string;
  };

export type SubWindowSourceSummary = {
  readonly id: string;
  readonly isActive: boolean;
  readonly title: string;
  readonly updatedAtEpochMs: number;
};

export type SubWindowSourcesSnapshot = {
  readonly activeSourceId: string | null;
  readonly sources: readonly SubWindowSourceSummary[];
};

export type SubWindowResolvedSourceState = {
  readonly sourceId: string | null;
  readonly state: SubWindowState | null;
};

export type SubWindowSourceStateChanged = {
  readonly sourceId: string;
  readonly state: SubWindowState;
};

export type SubWindowSourceLineSelectionRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
  readonly requestedAtEpochMs: number;
  readonly sourceId: string;
};

export type SubWindowGateway = {
  activateSource(sourceId: string): Promise<void>;
  getSources(): Promise<SubWindowSourcesSnapshot>;
  getSourceState(selection: SubWindowSelection): Promise<SubWindowResolvedSourceState>;
  listenSourceStateChanged(
    callback: (change: SubWindowSourceStateChanged) => void,
  ): Promise<() => void>;
  listenSourcesChanged(
    callback: (snapshot: SubWindowSourcesSnapshot) => void,
  ): Promise<() => void>;
  open(): Promise<void>;
  publishSourceState(sourceId: string, state: SubWindowState): Promise<void>;
  registerSource(state: SubWindowState): Promise<string>;
  requestSourceLineSelection(request: SubWindowSourceLineSelectionRequest): Promise<void>;
  listenSourceLineSelection(
    callback: (request: SubWindowSourceLineSelectionRequest) => void,
  ): Promise<() => void>;
  unregisterSource(sourceId: string): Promise<void>;
};
