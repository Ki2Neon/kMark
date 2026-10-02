import {
  type EditorDocumentGateway,
  type EditorDocumentSessionSnapshot,
} from "../../application/editorSession/editorDocumentPort";
import { type DocumentSessionPayload } from "../../contracts/generated";
import { applyEditorMutationBatch, markEditorSessionSaved } from "../../infra/editorSession";
import {
  attachDocumentSession,
  getDocumentSession,
  registerDocumentSession,
} from "../../infra/externalApi";

function toSnapshot(payload: DocumentSessionPayload): EditorDocumentSessionSnapshot {
  return {
    sessionId: payload.sessionId,
    revision: payload.revision,
    lineEnding: payload.lineEnding,
    content: payload.content,
    documentLengthUtf16: payload.content.length,
    fileName: payload.fileName,
    filePath: payload.filePath,
    isDirty: payload.isDirty,
  };
}

export function createTauriEditorDocumentGateway(): EditorDocumentGateway {
  return {
    async bootstrap(input) {
      return toSnapshot(await registerDocumentSession(input));
    },
    async attach(sessionId) {
      return toSnapshot(await attachDocumentSession(sessionId));
    },
    applyMutation: applyEditorMutationBatch,
    async getSnapshot(sessionId) {
      return toSnapshot(await getDocumentSession(sessionId));
    },
    async markSaved(sessionId, fileName, filePath) {
      return toSnapshot(await markEditorSessionSaved(sessionId, fileName, filePath));
    },
  };
}
