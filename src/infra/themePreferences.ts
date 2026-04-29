import { isTauri } from "@tauri-apps/api/core";
import { type ThemePreferences } from "../domain/theme";
import { createWebJsonStateStore } from "./webStateStore";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";
import { normalizeThemePreferencesState } from "./webStateNormalization";

const GET_THEME_PREFERENCES_COMMAND = "get_theme_preferences";
const SET_THEME_PREFERENCES_COMMAND = "set_theme_preferences";
const THEME_PREFERENCES_UPDATED_EVENT = "theme-preferences-updated";
const THEME_PREFERENCES_FILE_NAME = "theme-preferences.json";
const THEME_PREFERENCES_STORAGE_KEY = "kmark:state:theme-preferences:v2";

const themePreferencesStore = createWebJsonStateStore<ThemePreferences>({
  fileName: THEME_PREFERENCES_FILE_NAME,
  storageKey: THEME_PREFERENCES_STORAGE_KEY,
  normalize: normalizeThemePreferencesState,
});

export async function loadThemePreferences(): Promise<ThemePreferences> {
  if (isTauri()) {
    return invokeTauriCommand<ThemePreferences>(
      GET_THEME_PREFERENCES_COMMAND,
      {},
      "テーマ設定の読込に失敗しました。",
    );
  }

  return themePreferencesStore.load();
}

export async function persistThemePreferences(themePreferences: ThemePreferences): Promise<ThemePreferences> {
  if (isTauri()) {
    return invokeTauriCommand<ThemePreferences>(
      SET_THEME_PREFERENCES_COMMAND,
      { themePreferences },
      "テーマ設定の保存に失敗しました。",
    );
  }

  return themePreferencesStore.persist(themePreferences);
}

export async function listenForThemePreferencesChanged(
  callback: (themePreferences: ThemePreferences) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<ThemePreferences>(
      THEME_PREFERENCES_UPDATED_EVENT,
      callback,
    );
  }

  return themePreferencesStore.listen(callback);
}
