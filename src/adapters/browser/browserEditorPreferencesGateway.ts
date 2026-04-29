import { type EditorPreferencesGateway } from "../../application/editorPreferences/editorPreferencesPorts";
import {
  listenForEditorPreferencesChanged,
  loadEditorPreferences,
  persistEditorPreferences,
} from "../../infra/editorPreferences";
import {
  createDefaultEditorPreferences,
  normalizeEditorPreferences,
} from "./browserRustCore";

export function createBrowserEditorPreferencesGateway(): EditorPreferencesGateway {
  return {
    createDefault() {
      return createDefaultEditorPreferences();
    },
    async load() {
      return loadEditorPreferences();
    },
    normalize(editorPreferences) {
      return normalizeEditorPreferences(editorPreferences);
    },
    async persist(editorPreferences) {
      return persistEditorPreferences(editorPreferences);
    },
    async listen(callback) {
      return listenForEditorPreferencesChanged(callback);
    },
  };
}
