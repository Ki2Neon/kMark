import { type PreviewPreferences } from "../domain/preview";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

const GET_PREVIEW_PREFERENCES_COMMAND = "get_preview_preferences";
const SET_PREVIEW_PREFERENCES_COMMAND = "set_preview_preferences";
const PREVIEW_PREFERENCES_UPDATED_EVENT = "preview-preferences-updated";

export async function loadPreviewPreferences(): Promise<PreviewPreferences> {
  return invokeTauriCommand<PreviewPreferences>(
    GET_PREVIEW_PREFERENCES_COMMAND,
    {},
    "プレビュー設定の読込に失敗しました。",
  );
}

export async function persistPreviewPreferences(
  previewPreferences: PreviewPreferences,
): Promise<PreviewPreferences> {
  return invokeTauriCommand<PreviewPreferences>(
    SET_PREVIEW_PREFERENCES_COMMAND,
    { previewPreferences },
    "プレビュー設定の保存に失敗しました。",
  );
}

export async function listenForPreviewPreferencesChanged(
  callback: (previewPreferences: PreviewPreferences) => void,
): Promise<() => void> {
  return listenTauriEvent<PreviewPreferences>(
    PREVIEW_PREFERENCES_UPDATED_EVENT,
    callback,
  );
}
