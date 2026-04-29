export type PreviewWindowSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

export type PreviewWindowEditJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};

export type PreviewWindowSessionGateway = {
  openWindow(snapshot: PreviewWindowSnapshot, activeSourceLine: number | null): Promise<void>;
  syncState(snapshot: PreviewWindowSnapshot, activeSourceLine: number | null): Promise<void>;
  listenForEditJumpRequests(
    callback: (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => void,
  ): Promise<() => void>;
};
