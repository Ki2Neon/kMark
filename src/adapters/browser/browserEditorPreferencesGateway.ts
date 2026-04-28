import { type EditorPreferencesGateway } from "../../application/editorPreferences/editorPreferencesPorts";
import {
  loadEditorPreferences,
  persistEditorPreferences,
} from "../../infra/editorPreferences";

export function createBrowserEditorPreferencesGateway(): EditorPreferencesGateway {
  return {
    load() {
      return loadEditorPreferences();
    },
    persist(editorPreferences) {
      persistEditorPreferences(editorPreferences);
    },
  };
}
