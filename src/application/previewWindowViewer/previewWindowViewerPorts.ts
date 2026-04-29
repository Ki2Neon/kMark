export type PreviewWindowViewerSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

export type PreviewWindowViewerRenderedPreview = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

export type PreviewWindowViewerState = {
  readonly activeSourceLine: number | null;
  readonly snapshot: PreviewWindowViewerSnapshot;
};

export type PreviewWindowViewerRenderer = {
  render(content: string): Promise<PreviewWindowViewerRenderedPreview>;
};

export type PreviewWindowViewerGateway = {
  loadState(): Promise<PreviewWindowViewerState>;
  listenForStateUpdates(
    callback: (previewWindowViewerState: PreviewWindowViewerState) => void,
  ): Promise<() => void>;
  requestEditJump(lineNumber: number): Promise<void>;
};
