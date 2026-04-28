import { type ThemePreferencesGateway } from "../../application/appTheme/appThemePorts";
import {
  THEME_PREFERENCES_STORAGE_KEY,
  loadThemePreferences,
  persistThemePreferences,
} from "../../infra/themePreferences";

export function createBrowserThemePreferencesGateway(): ThemePreferencesGateway {
  return {
    storageKey: THEME_PREFERENCES_STORAGE_KEY,
    load() {
      return loadThemePreferences();
    },
    persist(themePreferences) {
      persistThemePreferences(themePreferences);
    },
  };
}
