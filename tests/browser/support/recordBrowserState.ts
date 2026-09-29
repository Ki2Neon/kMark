export type BrowserTestState = {
  readonly sessionId?: string;
  readonly documentRevision?: number;
  readonly previewRevision?: number;
  readonly dirty?: boolean;
  readonly pendingJobs?: number | null;
  readonly lastOperationId?: number;
  readonly lastIpcCommand?: string;
};

/** Test observation only. The browser reporter uses the latest snapshot on failure. */
export function recordBrowserState(state: BrowserTestState): void {
  console.info(`KMARK_TEST_STATE ${JSON.stringify(state)}`);
}
