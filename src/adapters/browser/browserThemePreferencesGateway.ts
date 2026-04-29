import { type ThemePreferencesGateway } from "../../application/appTheme/appThemePorts";
import {
  listenForThemePreferencesChanged,
  loadThemePreferences,
  persistThemePreferences,
} from "../../infra/themePreferences";
import {
  createDefaultThemePreferences,
  normalizeThemePreferences,
} from "./browserRustCore";

export function createBrowserThemePreferencesGateway(): ThemePreferencesGateway {
  return {
    createDefault() {
      return createDefaultThemePreferences();
    },
    async load() {
      return loadThemePreferences();
    },
    normalize(themePreferences) {
      return normalizeThemePreferences(themePreferences);
    },
    async persist(themePreferences) {
      return persistThemePreferences(themePreferences);
    },
    async listen(callback) {
      return listenForThemePreferencesChanged(callback);
    },
  };
}
