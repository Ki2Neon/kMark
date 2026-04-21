import { useCallback, useEffect, useState } from "react";
import { type AppThemeId, type ThemePreferences } from "../../domain/theme";
import { loadThemePreferences, persistThemePreferences } from "../../infra/themePreferences";

export function useAppTheme() {
  const [themePreferences, setThemePreferences] = useState<ThemePreferences>(() => loadThemePreferences());

  useEffect(() => {
    persistThemePreferences(themePreferences);
  }, [themePreferences]);

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

  return {
    appThemeId: themePreferences.appThemeId,
    onAppThemeChange: handleAppThemeChange,
  };
}