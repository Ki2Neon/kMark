import {
  DEFAULT_THEME_PREFERENCES,
  isAppThemeId,
  type ThemePreferences,
} from "../domain/theme";

const THEME_PREFERENCES_STORAGE_KEY = "kmark:theme-preferences:v1";

export function loadThemePreferences(): ThemePreferences {
  try {
    const storedValue = window.localStorage.getItem(THEME_PREFERENCES_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_THEME_PREFERENCES;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<ThemePreferences>;

    return {
      appThemeId:
        typeof parsedValue.appThemeId === "string" && isAppThemeId(parsedValue.appThemeId)
          ? parsedValue.appThemeId
          : DEFAULT_THEME_PREFERENCES.appThemeId,
      previewThemeId: typeof parsedValue.previewThemeId === "string" ? parsedValue.previewThemeId : null,
    };
  } catch {
    return DEFAULT_THEME_PREFERENCES;
  }
}

export function persistThemePreferences(themePreferences: ThemePreferences): void {
  try {
    window.localStorage.setItem(THEME_PREFERENCES_STORAGE_KEY, JSON.stringify(themePreferences));
  } catch {
    // Ignore storage failures to keep theme switching responsive.
  }
}