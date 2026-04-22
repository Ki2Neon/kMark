import {
  DEFAULT_EDITOR_PREFERENCES,
  deserializeAppFontId,
  deserializeEditFontId,
  deserializeEditFontSizePx,
  deserializeShowLineNumbers,
  isMultiCursorModifier,
  isStartupEditMode,
  type EditorPreferences,
} from "../domain/editorPreferences";

const EDITOR_PREFERENCES_STORAGE_KEY = "kmark:editor-preferences:v1";

export function loadEditorPreferences(): EditorPreferences {
  try {
    const storedValue = window.localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_EDITOR_PREFERENCES;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<EditorPreferences>;

    return {
      appFontId: deserializeAppFontId(parsedValue.appFontId),
      editFontId: deserializeEditFontId(parsedValue.editFontId),
      editFontSizePx: deserializeEditFontSizePx(parsedValue.editFontSizePx),
      multiCursorModifier:
        typeof parsedValue.multiCursorModifier === "string" && isMultiCursorModifier(parsedValue.multiCursorModifier)
          ? parsedValue.multiCursorModifier
          : DEFAULT_EDITOR_PREFERENCES.multiCursorModifier,
      showLineNumbers: deserializeShowLineNumbers(parsedValue.showLineNumbers),
      startupEditMode:
        typeof parsedValue.startupEditMode === "string" && isStartupEditMode(parsedValue.startupEditMode)
          ? parsedValue.startupEditMode
          : DEFAULT_EDITOR_PREFERENCES.startupEditMode,
    };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function persistEditorPreferences(editorPreferences: EditorPreferences): void {
  try {
    window.localStorage.setItem(EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(editorPreferences));
  } catch {
    // Ignore storage failures to keep editor interaction settings responsive.
  }
}