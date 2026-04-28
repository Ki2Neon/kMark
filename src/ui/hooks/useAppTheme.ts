import { useCallback, useEffect, useState } from "react";
import { createBrowserThemePreferencesGateway } from "../../adapters/browser/browserThemePreferencesGateway";
import { AppThemeController } from "../../application/appTheme/appThemeController";
import { type AppThemeId, type ThemePreferences } from "../../domain/theme";

const appThemeController = new AppThemeController({
  gateway: createBrowserThemePreferencesGateway(),
});

export function useAppTheme() {
  const [themePreferences, setThemePreferences] = useState<ThemePreferences>(() => appThemeController.createState());

  useEffect(() => {
    appThemeController.persist(themePreferences);
  }, [themePreferences]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !appThemeController.matchesStorageKey(event.key)) {
        return;
      }

      setThemePreferences((currentThemePreferences) => appThemeController.loadFromStorage(currentThemePreferences));
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleAppThemeChange = useCallback((appThemeId: AppThemeId) => {
    setThemePreferences((currentThemePreferences) => (
      appThemeController.changeAppTheme(currentThemePreferences, appThemeId)
    ));
  }, []);

  const handlePreviewUsesAppThemeColorsChange = useCallback((previewUsesAppThemeColors: boolean) => {
    setThemePreferences((currentThemePreferences) => (
      appThemeController.changePreviewUsesAppThemeColors(
        currentThemePreferences,
        previewUsesAppThemeColors,
      )
    ));
  }, []);

  return {
    appThemeId: themePreferences.appThemeId,
    previewUsesAppThemeColors: themePreferences.previewUsesAppThemeColors,
    onAppThemeChange: handleAppThemeChange,
    onPreviewUsesAppThemeColorsChange: handlePreviewUsesAppThemeColorsChange,
  };
}
