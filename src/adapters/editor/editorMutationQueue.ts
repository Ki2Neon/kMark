import {
  type EditorDocumentGateway,
  type EditorMutationAck,
  type EditorMutationBatch,
  type EditorTransaction,
} from "../../application/editorSession/editorDocumentPort.ts";

type PendingBatch = {
  readonly payload: EditorMutationBatch;
  readonly resultingLengthUtf16: number;
};

type EditorMutationQueueOptions = {
  readonly clientId?: string;
  readonly onAcknowledged?: (ack: EditorMutationAck) => void;
  readonly onFailed?: (error: unknown) => void;
};

export class EditorMutationQueue {
  readonly #gateway: EditorDocumentGateway;
  readonly #sessionId: string;
  readonly #clientId: string;
  readonly #onAcknowledged: ((ack: EditorMutationAck) => void) | undefined;
  readonly #onFailed: ((error: unknown) => void) | undefined;
  #revision: number;
  #optimisticLengthUtf16: number;
  #nextBatchId = 1;
  #pendingTransactions: EditorTransaction[] = [];
  #pumpPromise: Promise<void> | null = null;
  #failedBatch: PendingBatch | null = null;
  #failure: unknown = null;

  constructor(
    gateway: EditorDocumentGateway,
    sessionId: string,
    revision: number,
    documentLengthUtf16: number,
    options: EditorMutationQueueOptions = {},
  ) {
    this.#gateway = gateway;
    this.#sessionId = sessionId;
    this.#revision = revision;
    this.#optimisticLengthUtf16 = documentLengthUtf16;
    this.#clientId = options.clientId ?? crypto.randomUUID();
    this.#onAcknowledged = options.onAcknowledged;
    this.#onFailed = options.onFailed;
  }

  get revision(): number {
    return this.#revision;
  }

  enqueue(transaction: EditorTransaction): void {
    if (transaction.changes.length === 0) {
      return;
    }
    if (transaction.beforeLengthUtf16 !== this.#optimisticLengthUtf16) {
      throw new Error(
        `Editor Mutation順序違反: expectedLength=${this.#optimisticLengthUtf16}, actualLength=${transaction.beforeLengthUtf16}`,
      );
    }

    let nextLength = transaction.beforeLengthUtf16;
    let previousTo = 0;
    for (const [index, change] of transaction.changes.entries()) {
      if (
        change.fromUtf16 < previousTo
        || change.fromUtf16 > change.toUtf16
        || change.toUtf16 > transaction.beforeLengthUtf16
      ) {
        throw new Error(`Editor Mutation範囲違反: changeIndex=${index}`);
      }
      if (change.insert.includes("\r")) {
        throw new Error(`Editor MutationはLF正準文字列のみ許可: changeIndex=${index}`);
      }
      nextLength += change.insert.length - (change.toUtf16 - change.fromUtf16);
      previousTo = change.toUtf16;
    }

    this.#optimisticLengthUtf16 = nextLength;
    this.#pendingTransactions.push(transaction);
    this.#ensurePump();
  }

  async flush(): Promise<void> {
    this.#ensurePump();
    while (this.#pumpPromise !== null) {
      await this.#pumpPromise;
      this.#ensurePump();
    }
    if (this.#failure !== null) {
      throw this.#failure;
    }
  }

  async retryFailed(): Promise<void> {
    if (this.#failedBatch === null) {
      return this.flush();
    }
    this.#failure = null;
    this.#ensurePump();
    return this.flush();
  }

  #ensurePump(): void {
    if (this.#pumpPromise !== null || this.#failure !== null) {
      return;
    }
    if (this.#failedBatch === null && this.#pendingTransactions.length === 0) {
      return;
    }

    const running = this.#pump();
    this.#pumpPromise = running;
    void running.catch(() => {});
  }

  async #pump(): Promise<void> {
    try {
      while (this.#failedBatch !== null || this.#pendingTransactions.length > 0) {
        const pending = this.#failedBatch ?? this.#takePendingBatch();
        try {
          const ack = await this.#gateway.applyMutation(this.#sessionId, pending.payload);
          this.#validateAck(pending, ack);
          this.#failedBatch = null;
          this.#failure = null;
          this.#revision = ack.revision;
          this.#nextBatchId += 1;
          this.#onAcknowledged?.(ack);
        } catch (error) {
          this.#failedBatch = pending;
          this.#failure = error;
          this.#onFailed?.(error);
          throw error;
        }
      }
    } finally {
      this.#pumpPromise = null;
    }
  }

  #takePendingBatch(): PendingBatch {
    const transactions = this.#pendingTransactions.splice(0);
    const resultingLengthUtf16 = this.#transactionResultLength(transactions);
    return {
      payload: {
        clientId: this.#clientId,
        batchId: this.#nextBatchId,
        expectedRevision: this.#revision,
        transactions,
      },
      resultingLengthUtf16,
    };
  }

  #transactionResultLength(transactions: readonly EditorTransaction[]): number {
    const last = transactions[transactions.length - 1];
    if (last === undefined) {
      return this.#optimisticLengthUtf16;
    }
    return last.changes.reduce(
      (length, change) => length + change.insert.length - (change.toUtf16 - change.fromUtf16),
      last.beforeLengthUtf16,
    );
  }

  #validateAck(pending: PendingBatch, ack: EditorMutationAck): void {
    if (
      ack.clientId !== pending.payload.clientId
      || ack.batchId !== pending.payload.batchId
      || ack.revision !== pending.payload.expectedRevision + 1
      || ack.documentLengthUtf16 !== pending.resultingLengthUtf16
    ) {
      throw new Error("Editor Mutation ACKが送信Batchと一致しません。Full resyncが必要です。");
    }
  }
}
