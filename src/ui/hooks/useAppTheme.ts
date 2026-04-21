import { useCallback, useEffect, useState } from "react";
import { type AppThemeId, type ThemePreferences } from "../../domain/theme";
import {
  THEME_PREFERENCES_STORAGE_KEY,
  loadThemePreferences,
  persistThemePreferences,
} from "../../infra/themePreferences";

export function useAppTheme() {
  const [themePreferences, setThemePreferences] = useState<ThemePreferences>(() => loadThemePreferences());

  useEffect(() => {
    persistThemePreferences(themePreferences);
  }, [themePreferences]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== THEME_PREFERENCES_STORAGE_KEY) {
        return;
      }

      const nextThemePreferences = loadThemePreferences();

      setThemePreferences((currentThemePreferences) => (
        currentThemePreferences.appThemeId === nextThemePreferences.appThemeId
          && currentThemePreferences.previewThemeId === nextThemePreferences.previewThemeId
          && currentThemePreferences.previewUsesAppThemeColors === nextThemePreferences.previewUsesAppThemeColors
          ? currentThemePreferences
          : nextThemePreferences
      ));
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleAppThemeChange = useCallback((appThemeId: AppThemeId) => {
    setThemePreferences((currentPreferences) => {
      if (currentPreferences.appThemeId === appThemeId) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        appThemeId,
      };
    });
  }, []);

  const handlePreviewUsesAppThemeColorsChange = useCallback((previewUsesAppThemeColors: boolean) => {
    setThemePreferences((currentPreferences) => {
      if (currentPreferences.previewUsesAppThemeColors === previewUsesAppThemeColors) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        previewUsesAppThemeColors,
      };
    });
  }, []);

  return {
    appThemeId: themePreferences.appThemeId,
    previewUsesAppThemeColors: themePreferences.previewUsesAppThemeColors,
    onAppThemeChange: handleAppThemeChange,
    onPreviewUsesAppThemeColorsChange: handlePreviewUsesAppThemeColorsChange,
  };
}