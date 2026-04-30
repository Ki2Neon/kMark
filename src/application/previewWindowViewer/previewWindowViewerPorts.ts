import type {
  PreviewWindowSnapshot,
  PreviewWindowState,
} from "../../domain/previewWindow";

export type PreviewWindowViewerSnapshot = PreviewWindowSnapshot;

export type PreviewWindowViewerRenderedPreview = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

export type PreviewWindowViewerState = PreviewWindowState;

export type PreviewWindowViewerRenderer = {
  render(content: string, filePath?: string | null): Promise<PreviewWindowViewerRenderedPreview>;
};

export type PreviewWindowViewerGateway = {
  loadState(): Promise<PreviewWindowViewerState>;
  listenForStateUpdates(
    callback: (previewWindowViewerState: PreviewWindowViewerState) => void,
  ): Promise<() => void>;
  requestEditJump(lineNumber: number): Promise<void>;
};
