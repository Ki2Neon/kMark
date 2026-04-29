import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserThemePreferencesGateway } from "../../adapters/browser/browserThemePreferencesGateway";
import { AppThemeController } from "../../application/appTheme/appThemeController";
import { type AppThemeId, type ThemePreferences } from "../../domain/theme";

const appThemeController = new AppThemeController({
  gateway: createBrowserThemePreferencesGateway(),
});

export function useAppTheme() {
  const [themePreferences, setThemePreferences] = useState<ThemePreferences>(() => appThemeController.createInitialState());
  const [isReady, setIsReady] = useState(false);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void appThemeController.load().then((nextThemePreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setThemePreferences(appThemeController.createState(nextThemePreferences));
      setIsReady(true);
    }).catch(() => {
      if (isDisposed) {
        return;
      }

      setThemePreferences(appThemeController.createInitialState());
      setIsReady(true);
    });

    void appThemeController.subscribeToPreferences((nextThemePreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setThemePreferences(appThemeController.createState(nextThemePreferences));
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    }).catch(() => {});

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  const handleAppThemeChange = useCallback((appThemeId: AppThemeId) => {
    setThemePreferences((currentThemePreferences) => {
      const nextThemePreferences = appThemeController.changeAppTheme(currentThemePreferences, appThemeId);

      if (nextThemePreferences !== currentThemePreferences && isLoadedRef.current) {
        void appThemeController.persist(nextThemePreferences).catch(() => {
          void appThemeController.load().then((loadedThemePreferences) => {
            setThemePreferences(loadedThemePreferences);
          }).catch(() => {});
        });
      }

      return nextThemePreferences;
    });
  }, []);

  const handlePreviewUsesAppThemeColorsChange = useCallback((previewUsesAppThemeColors: boolean) => {
    setThemePreferences((currentThemePreferences) => {
      const nextThemePreferences = appThemeController.changePreviewUsesAppThemeColors(
        currentThemePreferences,
        previewUsesAppThemeColors,
      );

      if (nextThemePreferences !== currentThemePreferences && isLoadedRef.current) {
        void appThemeController.persist(nextThemePreferences).catch(() => {
          void appThemeController.load().then((loadedThemePreferences) => {
            setThemePreferences(loadedThemePreferences);
          }).catch(() => {});
        });
      }

      return nextThemePreferences;
    });
  }, []);

  return {
    appThemeId: themePreferences.appThemeId,
    isReady,
    previewUsesAppThemeColors: themePreferences.previewUsesAppThemeColors,
    onAppThemeChange: handleAppThemeChange,
    onPreviewUsesAppThemeColorsChange: handlePreviewUsesAppThemeColorsChange,
  };
}
