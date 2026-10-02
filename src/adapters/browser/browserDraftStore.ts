import { type DraftStore } from "../../application/editorSession/editorSessionPorts";
import { flushEditorDraftSession, loadLocalEdit, persistLocalEdit } from "../../infra/localEdit";
import { isTauri } from "../../runtime/runtime";

export function createBrowserDraftStore(): DraftStore {
  return {
    async load() {
      return loadLocalEdit();
    },
    async persist(edit) {
      await persistLocalEdit(edit);
    },
    flushSession: isTauri()
      ? async (sessionId, revision, savedAt) => flushEditorDraftSession(sessionId, revision, savedAt)
      : undefined,
  };
}
