export type PreviewWindowSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

export type PreviewWindowEditJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};

export type PreviewWindowSessionGateway = {
  resolveInstanceId(): Promise<string>;
  openWindow(instanceId: string): Promise<void>;
  persistSnapshot(instanceId: string, snapshot: PreviewWindowSnapshot): void;
  persistActiveSourceLine(instanceId: string, activeSourceLine: number | null): void;
  getEditJumpRequestStorageKey(instanceId: string): string | null;
  loadEditJumpRequest(instanceId: string): PreviewWindowEditJumpRequest | null;
};
