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
  readonly cursorSyncStorageKey: string | null;
  readonly instanceId: string | null;
  readonly snapshot: PreviewWindowViewerSnapshot;
  readonly snapshotStorageKey: string | null;
};

export type PreviewWindowViewerRenderer = {
  render(content: string): Promise<PreviewWindowViewerRenderedPreview>;
};

export type PreviewWindowViewerGateway = {
  getCursorSyncStorageKey(instanceId: string): string | null;
  getSnapshotStorageKey(instanceId: string): string | null;
  loadActiveSourceLine(instanceId: string): number | null;
  loadSnapshot(instanceId: string): PreviewWindowViewerSnapshot | null;
  requestEditJump(instanceId: string, lineNumber: number): void;
  resolveInstanceId(search?: string): string | null;
};
