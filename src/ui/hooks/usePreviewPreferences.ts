import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserPreviewPreferencesGateway } from "../../adapters/browser/browserPreviewPreferencesGateway";
import { PreviewPreferencesController } from "../../application/previewPreferences/previewPreferencesController";
import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";

type UsePreviewPreferencesOptions = {
  readonly manageVisibilityByAppInstance?: boolean;
};

export function usePreviewPreferences(options: UsePreviewPreferencesOptions = {}) {
  const { manageVisibilityByAppInstance: _manageVisibilityByAppInstance = false } = options;
  const controllerRef = useRef<PreviewPreferencesController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewPreferencesController({
      preferencesGateway: createBrowserPreviewPreferencesGateway(),
    });
  }

  const controller = controllerRef.current;
  const [previewPreferences, setPreviewPreferences] = useState<PreviewPreferences>(() => controller.createInitialState());
  const isLoadedRef = useRef(false);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void controller.loadPreferences().then((nextPreviewPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setPreviewPreferences(nextPreviewPreferences);
    }).catch(() => {});

    void controller.subscribeToPreferences((nextPreviewPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setPreviewPreferences(nextPreviewPreferences);
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
  }, [controller]);

  const handlePreviewDisplayModeChange = useCallback((previewDisplayMode: PreviewDisplayMode) => {
    setPreviewPreferences((currentPreviewPreferences) => {
      const nextPreviewPreferences = controller.changePreviewDisplayMode(
        currentPreviewPreferences,
        previewDisplayMode,
      );

      if (nextPreviewPreferences !== currentPreviewPreferences && isLoadedRef.current) {
        void controller.persist(nextPreviewPreferences).catch(() => {
          void controller.loadPreferences().then(setPreviewPreferences).catch(() => {});
        });
      }

      return nextPreviewPreferences;
    });
  }, [controller]);

  const handlePreviewVisibilityChange = useCallback((isPreviewVisible: boolean) => {
    setPreviewPreferences((currentPreviewPreferences) => {
      const nextPreviewPreferences = controller.changePreviewVisibility(
        currentPreviewPreferences,
        isPreviewVisible,
      );

      if (nextPreviewPreferences !== currentPreviewPreferences && isLoadedRef.current) {
        void controller.persist(nextPreviewPreferences).catch(() => {
          void controller.loadPreferences().then(setPreviewPreferences).catch(() => {});
        });
      }

      return nextPreviewPreferences;
    });
  }, [controller]);

  const handlePlantUmlHttpsHostsChange = useCallback((plantumlHttpsHosts: readonly string[]) => {
    setPreviewPreferences((currentPreviewPreferences) => {
      const nextPreviewPreferences = controller.changePlantUmlHttpsHosts(
        currentPreviewPreferences,
        plantumlHttpsHosts,
      );
      if (nextPreviewPreferences !== currentPreviewPreferences && isLoadedRef.current) {
        void controller.persist(nextPreviewPreferences).catch(() => {
          void controller.loadPreferences().then(setPreviewPreferences).catch(() => {});
        });
      }
      return nextPreviewPreferences;
    });
  }, [controller]);

  return {
    isPreviewVisible: previewPreferences.isPreviewVisible,
    previewDisplayMode: previewPreferences.previewDisplayMode,
    plantumlHttpsHosts: previewPreferences.plantumlHttpsHosts,
    onPreviewDisplayModeChange: handlePreviewDisplayModeChange,
    onPreviewVisibilityChange: handlePreviewVisibilityChange,
    onPlantUmlHttpsHostsChange: handlePlantUmlHttpsHostsChange,
  };
}
