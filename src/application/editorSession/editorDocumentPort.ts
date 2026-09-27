export type EditorLineEnding = "lf" | "crlf";

export type EditorTextChange = {
  readonly fromUtf16: number;
  readonly toUtf16: number;
  readonly insert: string;
};

export type EditorTransaction = {
  readonly beforeLengthUtf16: number;
  readonly changes: readonly EditorTextChange[];
};

export type EditorMutationBatch = {
  readonly clientId: string;
  readonly batchId: number;
  readonly expectedRevision: number;
  readonly transactions: readonly EditorTransaction[];
};

export type EditorMutationAck = {
  readonly clientId: string;
  readonly batchId: number;
  readonly revision: number;
  readonly documentLengthUtf16: number;
  readonly replayed: boolean;
};

export type EditorDocumentSessionSnapshot = {
  readonly sessionId: string;
  readonly revision: number;
  readonly lineEnding: EditorLineEnding;
  readonly content: string;
  readonly documentLengthUtf16: number;
  readonly fileName: string;
  readonly filePath: string | null;
  readonly isDirty: boolean;
};

export type EditorDocumentBootstrapInput = {
  readonly fileName: string;
  readonly filePath: string | null;
  readonly content: string;
  readonly isDirty: boolean;
};

export type EditorDocumentGateway = {
  bootstrap(input: EditorDocumentBootstrapInput): Promise<EditorDocumentSessionSnapshot>;
  attach(sessionId: string): Promise<EditorDocumentSessionSnapshot>;
  applyMutation(
    sessionId: string,
    batch: EditorMutationBatch,
  ): Promise<EditorMutationAck>;
  getSnapshot(sessionId: string): Promise<EditorDocumentSessionSnapshot>;
  markSaved(
    sessionId: string,
    fileName: string,
    filePath: string | null,
  ): Promise<EditorDocumentSessionSnapshot>;
};
