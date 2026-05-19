import {
  type PageStyle,
  type PreviewDisplayMode,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";

export const SUB_WINDOW_STATE_VERSION = 2;

export type SubWindowState = {
  readonly version: typeof SUB_WINDOW_STATE_VERSION;
  readonly revision: number;
  readonly updatedAtEpochMs: number;
  readonly title: string;
  readonly displayMode: PreviewDisplayMode;
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
  readonly activeSourceLine: number | null;
};

export type SubWindowStateRequest = Omit<
  SubWindowState,
  "revision" | "updatedAtEpochMs" | "version"
>;

export type SubWindowSourceLineSelectionRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
  readonly requestedAtEpochMs: number;
};

export type SubWindowGateway = {
  open(state: SubWindowState): Promise<void>;
  load(stateKey: string | null): Promise<SubWindowState | null>;
  listen(
    stateKey: string | null,
    callback: (state: SubWindowState) => void,
  ): Promise<() => void>;
  publish(state: SubWindowState): Promise<void>;
  requestSourceLineSelection(request: SubWindowSourceLineSelectionRequest): Promise<void>;
  listenSourceLineSelection(
    callback: (request: SubWindowSourceLineSelectionRequest) => void,
  ): Promise<() => void>;
};
