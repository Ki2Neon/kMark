import { isTauri } from "@tauri-apps/api/core";
import { createWebJsonStateStore } from "./webStateStore";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";
import {
  normalizeDesktopLayoutPreferencesState,
  type DesktopLayoutPreferences,
} from "./webStateNormalization";

const GET_DESKTOP_LAYOUT_PREFERENCES_COMMAND = "get_desktop_layout_preferences";
const SET_DESKTOP_LAYOUT_PREFERENCES_COMMAND = "set_desktop_layout_preferences";
const DESKTOP_LAYOUT_PREFERENCES_UPDATED_EVENT = "desktop-layout-preferences-updated";
const DESKTOP_LAYOUT_PREFERENCES_FILE_NAME = "desktop-layout-preferences.json";
const DESKTOP_LAYOUT_PREFERENCES_STORAGE_KEY = "kmark:state:desktop-layout-preferences:v2";

export const DEFAULT_DESKTOP_SPLIT_RATIO = 50;
export const MIN_DESKTOP_SPLIT_RATIO = 20;
export const MAX_DESKTOP_SPLIT_RATIO = 80;

const desktopLayoutPreferencesStore = createWebJsonStateStore<DesktopLayoutPreferences>({
  fileName: DESKTOP_LAYOUT_PREFERENCES_FILE_NAME,
  storageKey: DESKTOP_LAYOUT_PREFERENCES_STORAGE_KEY,
  normalize: normalizeDesktopLayoutPreferencesState,
});

function toDesktopLayoutPreferences(splitRatio: number): DesktopLayoutPreferences {
  return { desktopSplitRatio: splitRatio };
}

export async function loadDesktopSplitRatio(): Promise<number> {
  if (isTauri()) {
    const desktopLayoutPreferences = await invokeTauriCommand<DesktopLayoutPreferences>(
      GET_DESKTOP_LAYOUT_PREFERENCES_COMMAND,
      {},
      "レイアウト設定の読込に失敗しました。",
    );
    return desktopLayoutPreferences.desktopSplitRatio;
  }

  return (await desktopLayoutPreferencesStore.load()).desktopSplitRatio;
}

export async function persistDesktopSplitRatio(splitRatio: number): Promise<number> {
  if (isTauri()) {
    const desktopLayoutPreferences = await invokeTauriCommand<DesktopLayoutPreferences>(
      SET_DESKTOP_LAYOUT_PREFERENCES_COMMAND,
      { desktopLayoutPreferences: toDesktopLayoutPreferences(splitRatio) },
      "レイアウト設定の保存に失敗しました。",
    );
    return desktopLayoutPreferences.desktopSplitRatio;
  }

  return (await desktopLayoutPreferencesStore.persist(toDesktopLayoutPreferences(splitRatio))).desktopSplitRatio;
}

export async function listenForDesktopSplitRatioChanged(
  callback: (splitRatio: number) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<DesktopLayoutPreferences>(
      DESKTOP_LAYOUT_PREFERENCES_UPDATED_EVENT,
      (desktopLayoutPreferences) => {
        callback(desktopLayoutPreferences.desktopSplitRatio);
      },
    );
  }

  return desktopLayoutPreferencesStore.listen((desktopLayoutPreferences) => {
    callback(desktopLayoutPreferences.desktopSplitRatio);
  });
}
