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
  const [confirmedPlantUmlHttpsHosts, setConfirmedPlantUmlHttpsHosts] = useState<readonly string[]>(
    () => controller.createInitialState().plantumlHttpsHosts,
  );
  const isLoadedRef = useRef(false);
  const plantUmlHostPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const plantUmlHostPersistSequenceRef = useRef(0);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void controller.loadPreferences().then((nextPreviewPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setPreviewPreferences(nextPreviewPreferences);
      setConfirmedPlantUmlHttpsHosts(nextPreviewPreferences.plantumlHttpsHosts);
    }).catch(() => {});

    void controller.subscribeToPreferences((nextPreviewPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setPreviewPreferences(nextPreviewPreferences);
      setConfirmedPlantUmlHttpsHosts(nextPreviewPreferences.plantumlHttpsHosts);
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
    const nextPreviewPreferences = controller.changePlantUmlHttpsHosts(
      previewPreferences,
      plantumlHttpsHosts,
    );
    if (nextPreviewPreferences === previewPreferences) {
      return;
    }
    setPreviewPreferences(nextPreviewPreferences);
    if (!isLoadedRef.current) {
      return;
    }

    const persistSequence = plantUmlHostPersistSequenceRef.current + 1;
    plantUmlHostPersistSequenceRef.current = persistSequence;
    const persistOperation = plantUmlHostPersistQueueRef.current.then(() => (
      controller.persist(nextPreviewPreferences)
    ));
    plantUmlHostPersistQueueRef.current = persistOperation.then(() => {}, () => {});
    void persistOperation.then((persistedPreviewPreferences) => {
      if (plantUmlHostPersistSequenceRef.current === persistSequence) {
        setPreviewPreferences((currentPreviewPreferences) => (
          controller.changePlantUmlHttpsHosts(
            currentPreviewPreferences,
            persistedPreviewPreferences.plantumlHttpsHosts,
          )
        ));
        setConfirmedPlantUmlHttpsHosts(persistedPreviewPreferences.plantumlHttpsHosts);
      }
    }).catch(() => {
      if (plantUmlHostPersistSequenceRef.current === persistSequence) {
        void controller.loadPreferences().then((loadedPreviewPreferences) => {
          setPreviewPreferences(loadedPreviewPreferences);
          setConfirmedPlantUmlHttpsHosts(loadedPreviewPreferences.plantumlHttpsHosts);
        }).catch(() => {});
      }
    });
  }, [controller, previewPreferences]);

  return {
    isPreviewVisible: previewPreferences.isPreviewVisible,
    previewDisplayMode: previewPreferences.previewDisplayMode,
    plantumlHttpsHosts: confirmedPlantUmlHttpsHosts,
    onPreviewDisplayModeChange: handlePreviewDisplayModeChange,
    onPreviewVisibilityChange: handlePreviewVisibilityChange,
    onPlantUmlHttpsHostsChange: handlePlantUmlHttpsHostsChange,
  };
}
