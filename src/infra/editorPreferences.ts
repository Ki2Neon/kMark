import { isTauri } from "@tauri-apps/api/core";
import { type EditorPreferences } from "../domain/editorPreferences";
import { createWebJsonStateStore } from "./webStateStore";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";
import { normalizeEditorPreferencesState } from "./webStateNormalization";

const GET_EDITOR_PREFERENCES_COMMAND = "get_editor_preferences";
const SET_EDITOR_PREFERENCES_COMMAND = "set_editor_preferences";
const EDITOR_PREFERENCES_UPDATED_EVENT = "editor-preferences-updated";
const EDITOR_PREFERENCES_FILE_NAME = "editor-preferences.json";
const EDITOR_PREFERENCES_STORAGE_KEY = "kmark:state:editor-preferences:v2";

const editorPreferencesStore = createWebJsonStateStore<EditorPreferences>({
  fileName: EDITOR_PREFERENCES_FILE_NAME,
  storageKey: EDITOR_PREFERENCES_STORAGE_KEY,
  normalize: normalizeEditorPreferencesState,
});

export async function loadEditorPreferences(): Promise<EditorPreferences> {
  if (isTauri()) {
    return invokeTauriCommand<EditorPreferences>(
      GET_EDITOR_PREFERENCES_COMMAND,
      {},
      "エディター設定の読込に失敗しました。",
    );
  }

  return editorPreferencesStore.load();
}

export async function persistEditorPreferences(
  editorPreferences: EditorPreferences,
): Promise<EditorPreferences> {
  if (isTauri()) {
    return invokeTauriCommand<EditorPreferences>(
      SET_EDITOR_PREFERENCES_COMMAND,
      { editorPreferences },
      "エディター設定の保存に失敗しました。",
    );
  }

  return editorPreferencesStore.persist(editorPreferences);
}

export async function listenForEditorPreferencesChanged(
  callback: (editorPreferences: EditorPreferences) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<EditorPreferences>(
      EDITOR_PREFERENCES_UPDATED_EVENT,
      callback,
    );
  }

  return editorPreferencesStore.listen(callback);
}
