import { isTauri } from "@tauri-apps/api/core";
import { type PreviewPreferences } from "../domain/preview";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";
import { createWebJsonStateStore } from "./webStateStore";
import { normalizePreviewPreferencesState } from "./webStateNormalization";

const GET_PREVIEW_PREFERENCES_COMMAND = "get_preview_preferences";
const SET_PREVIEW_PREFERENCES_COMMAND = "set_preview_preferences";
const PREVIEW_PREFERENCES_UPDATED_EVENT = "preview-preferences-updated";
const PREVIEW_PREFERENCES_FILE_NAME = "preview-preferences.json";
const PREVIEW_PREFERENCES_STORAGE_KEY = "kmark:state:preview-preferences:v2";

const previewPreferencesStore = createWebJsonStateStore<PreviewPreferences>({
  fileName: PREVIEW_PREFERENCES_FILE_NAME,
  storageKey: PREVIEW_PREFERENCES_STORAGE_KEY,
  normalize: normalizePreviewPreferencesState,
});

export async function loadPreviewPreferences(): Promise<PreviewPreferences> {
  if (!isTauri()) {
    return previewPreferencesStore.load();
  }

  return invokeTauriCommand<PreviewPreferences>(
    GET_PREVIEW_PREFERENCES_COMMAND,
    {},
    "プレビュー設定の読込に失敗しました。",
  );
}

export async function persistPreviewPreferences(
  previewPreferences: PreviewPreferences,
): Promise<PreviewPreferences> {
  if (!isTauri()) {
    return previewPreferencesStore.persist(previewPreferences);
  }

  return invokeTauriCommand<PreviewPreferences>(
    SET_PREVIEW_PREFERENCES_COMMAND,
    { previewPreferences },
    "プレビュー設定の保存に失敗しました。",
  );
}

export async function listenForPreviewPreferencesChanged(
  callback: (previewPreferences: PreviewPreferences) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return previewPreferencesStore.listen(callback);
  }

  return listenTauriEvent<PreviewPreferences>(
    PREVIEW_PREFERENCES_UPDATED_EVENT,
    callback,
  );
}
