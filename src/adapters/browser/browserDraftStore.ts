import { type DraftStore } from "../../application/editorSession/editorSessionPorts";
import { loadLocalEdit, persistLocalEdit } from "../../infra/localEdit";

export function createBrowserDraftStore(): DraftStore {
  return {
    load() {
      return loadLocalEdit();
    },
    persist(edit) {
      persistLocalEdit(edit);
    },
  };
}
