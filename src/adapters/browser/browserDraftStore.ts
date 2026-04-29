import { type DraftStore } from "../../application/editorSession/editorSessionPorts";
import { loadLocalEdit, persistLocalEdit } from "../../infra/localEdit";

export function createBrowserDraftStore(): DraftStore {
  return {
    async load() {
      return loadLocalEdit();
    },
    async persist(edit) {
      await persistLocalEdit(edit);
    },
  };
}
