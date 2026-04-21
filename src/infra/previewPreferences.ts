import {
  DEFAULT_PREVIEW_PREFERENCES,
  isPreviewDisplayMode,
  type PreviewPreferences,
} from "../domain/preview";

export const PREVIEW_PREFERENCES_STORAGE_KEY = "kmark:preview-preferences:v1";

export function loadPreviewPreferences(): PreviewPreferences {
  try {
    const storedValue = window.localStorage.getItem(PREVIEW_PREFERENCES_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_PREVIEW_PREFERENCES;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<PreviewPreferences>;

    return {
      previewDisplayMode:
        typeof parsedValue.previewDisplayMode === "string" && isPreviewDisplayMode(parsedValue.previewDisplayMode)
          ? parsedValue.previewDisplayMode
          : DEFAULT_PREVIEW_PREFERENCES.previewDisplayMode,
    };
  } catch {
    return DEFAULT_PREVIEW_PREFERENCES;
  }
}

export function persistPreviewPreferences(previewPreferences: PreviewPreferences): void {
  try {
    window.localStorage.setItem(PREVIEW_PREFERENCES_STORAGE_KEY, JSON.stringify(previewPreferences));
  } catch {
    // Ignore storage failures to keep preview mode switching responsive.
  }
}