import { type EditorMutationAckPayload, type EditorMutationBatchPayload } from "../../contracts/generated";
import { type PreviewDisplayMode } from "../../domain/preview";
import {
  applyWebEditorMutationBatch,
  createWebEditorDocument,
  renderMarkdownPreviewWithWasm,
  snapshotWebEditorDocument,
  type RenderedMarkdownPreviewPayload,
  type WebEditorDocumentHandle,
} from "../../wasm/kmarkWeb";

export type BrowserMarkdownPreviewWorkerRequest =
  | {
    readonly content: string;
    readonly id: number;
    readonly isDirty: boolean;
    readonly revision: number;
    readonly sessionId: string;
    readonly type: "bootstrap";
  }
  | {
    readonly batch: EditorMutationBatchPayload;
    readonly id: number;
    readonly sessionId: string;
    readonly type: "mutation";
  }
  | {
    readonly displayMode: PreviewDisplayMode;
    readonly filePath: string | null;
    readonly id: number;
    readonly revision: number;
    readonly sessionId: string;
    readonly type: "render";
  };

export type BrowserMarkdownPreviewWorkerResponse =
  | { readonly id: number; readonly type: "ready" }
  | { readonly ack: EditorMutationAckPayload; readonly id: number; readonly type: "acknowledged" }
  | {
    readonly id: number;
    readonly renderedPreview: RenderedMarkdownPreviewPayload;
    readonly type: "rendered";
  }
  | {
    readonly id: number;
    readonly message: string;
    readonly type: "failed";
  };

type WorkerScope = {
  onmessage: ((event: MessageEvent<BrowserMarkdownPreviewWorkerRequest>) => void) | null;
  postMessage(message: BrowserMarkdownPreviewWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;
const sessions = new Map<string, WebEditorDocumentHandle>();
let requestQueue = Promise.resolve();

workerScope.onmessage = (event) => {
  requestQueue = requestQueue.then(() => handleRequest(event.data));
};

async function handleRequest(request: BrowserMarkdownPreviewWorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case "bootstrap": {
        sessions.set(request.sessionId, await createWebEditorDocument({
          content: request.content,
          revision: request.revision,
          isDirty: request.isDirty,
        }));
        workerScope.postMessage({ id: request.id, type: "ready" });
        return;
      }
      case "mutation": {
        const document = requireSession(request.sessionId);
        const ack = applyWebEditorMutationBatch(document, request.batch);
        workerScope.postMessage({ ack, id: request.id, type: "acknowledged" });
        return;
      }
      case "render": {
        const document = requireSession(request.sessionId);
        const snapshot = snapshotWebEditorDocument(document);
        if (snapshot.revision !== request.revision) {
          throw new Error(
            `preview_revision_gap:expected=${request.revision},actual=${snapshot.revision}`,
          );
        }
        const renderedPreview = await renderMarkdownPreviewWithWasm(
          snapshot.content,
          request.filePath,
          request.displayMode,
        );
        workerScope.postMessage({
          id: request.id,
          renderedPreview,
          type: "rendered",
        });
        return;
      }
    }
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      message: error instanceof Error ? error.message : "プレビュー描画に失敗しました。",
      type: "failed",
    });
  }
}

function requireSession(sessionId: string): WebEditorDocumentHandle {
  const document = sessions.get(sessionId);
  if (document === undefined) {
    throw new Error(`preview_session_not_found:${sessionId}`);
  }
  return document;
}
