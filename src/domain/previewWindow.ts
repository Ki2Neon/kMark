export type PreviewWindowSnapshot = {
  readonly content: string;
  readonly fileName: string;
  readonly filePath: string | null;
};

export type PreviewWindowState = {
  readonly activeSourceLine: number | null;
  readonly snapshot: PreviewWindowSnapshot;
};

export type PreviewWindowEditJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};
