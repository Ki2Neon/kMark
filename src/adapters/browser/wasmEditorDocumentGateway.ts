import {
  type EditorDocumentBootstrapInput,
  type EditorDocumentGateway,
  type EditorDocumentSessionSnapshot,
} from "../../application/editorSession/editorDocumentPort";
import {
  applyWebEditorMutationBatch,
  createWebEditorDocument,
  markWebEditorDocumentSaved,
  snapshotWebEditorDocument,
  type WebEditorDocumentHandle,
} from "../../wasm/kmarkWeb";
import {
  applyBrowserPreviewMutation,
  bootstrapBrowserPreviewSession,
  registerBrowserPreviewSessionRecovery,
} from "./browserMarkdownPreviewRenderer";

type WebSession = {
  readonly document: WebEditorDocumentHandle;
  fileName: string;
  filePath: string | null;
};

function snapshot(sessionId: string, session: WebSession): EditorDocumentSessionSnapshot {
  const document = snapshotWebEditorDocument(session.document);
  return {
    sessionId,
    revision: document.revision,
    lineEnding: document.lineEnding,
    content: document.content,
    documentLengthUtf16: document.documentLengthUtf16,
    fileName: session.fileName,
    filePath: session.filePath,
    isDirty: document.isDirty,
  };
}

async function bootstrapPreviewMirror(
  sessionId: string,
  session: WebSession,
): Promise<EditorDocumentSessionSnapshot> {
  const current = snapshot(sessionId, session);
  await bootstrapBrowserPreviewSession({
    sessionId,
    content: current.content,
    revision: current.revision,
    isDirty: current.isDirty,
  });
  return current;
}

export function createWasmEditorDocumentGateway(): EditorDocumentGateway {
  const sessions = new Map<string, WebSession>();

  function requireSession(sessionId: string): WebSession {
    const session = sessions.get(sessionId);
    if (session === undefined) {
      throw new Error(`Editor Sessionが存在しません: ${sessionId}`);
    }
    return session;
  }

  return {
    async bootstrap(input: EditorDocumentBootstrapInput) {
      const sessionId = crypto.randomUUID();
      const session: WebSession = {
        document: await createWebEditorDocument({
          content: input.content,
          revision: 1,
          isDirty: input.isDirty,
        }),
        fileName: input.fileName,
        filePath: input.filePath,
      };
      sessions.set(sessionId, session);
      registerBrowserPreviewSessionRecovery(
        sessionId,
        async () => { await bootstrapPreviewMirror(sessionId, session); },
      );
      return bootstrapPreviewMirror(sessionId, session);
    },
    async attach(sessionId) {
      const session = requireSession(sessionId);
      registerBrowserPreviewSessionRecovery(
        sessionId,
        async () => { await bootstrapPreviewMirror(sessionId, session); },
      );
      return bootstrapPreviewMirror(sessionId, session);
    },
    async applyMutation(sessionId, batch) {
      const session = requireSession(sessionId);
      const payload = {
        ...batch,
        transactions: batch.transactions.map((transaction) => ({
          ...transaction,
          changes: transaction.changes.map((change) => ({ ...change })),
        })),
      };
      const ack = applyWebEditorMutationBatch(session.document, payload);
      try {
        const mirrorAck = await applyBrowserPreviewMutation(sessionId, payload);
        if (
          mirrorAck.batchId !== ack.batchId
          || mirrorAck.revision !== ack.revision
          || mirrorAck.documentLengthUtf16 !== ack.documentLengthUtf16
        ) {
          throw new Error("Preview Worker ACKがcanonical ACKと一致しません。");
        }
      } catch {
        await bootstrapPreviewMirror(sessionId, session);
      }
      return ack;
    },
    async getSnapshot(sessionId) {
      return snapshot(sessionId, requireSession(sessionId));
    },
    async markSaved(sessionId, fileName, filePath) {
      const session = requireSession(sessionId);
      session.fileName = fileName;
      session.filePath = filePath;
      markWebEditorDocumentSaved(session.document);
      return snapshot(sessionId, session);
    },
  };
}
