import { useCallback, useEffect, useRef, useState } from "react";
import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";
import {
  APP_INSTANCE_PRESENCE_HEARTBEAT_MS,
  PREVIEW_PREFERENCES_STORAGE_KEY,
  countActiveAppInstances,
  getInstancePreviewVisibilityStorageKey,
  isAppInstancePresenceStorageKey,
  loadInstancePreviewVisibility,
  loadPreviewPreferences,
  persistInstancePreviewVisibility,
  persistPreviewDisplayMode,
  persistPreviewPreferences,
  persistSingletonPreviewVisibility,
  removeAppInstancePresence,
  touchAppInstancePresence,
} from "../../infra/previewPreferences";
import { resolveAppInstanceId } from "../../infra/previewWindow";

type UsePreviewPreferencesOptions = {
  readonly manageVisibilityByAppInstance?: boolean;
};

export function usePreviewPreferences(options: UsePreviewPreferencesOptions = {}) {
  const { manageVisibilityByAppInstance = false } = options;
  const [previewPreferences, setPreviewPreferences] = useState<PreviewPreferences>(() => loadPreviewPreferences());
  const [appInstanceId, setAppInstanceId] = useState<string | null>(null);
  const previewVisibilityRef = useRef(previewPreferences.isPreviewVisible);

  useEffect(() => {
    previewVisibilityRef.current = previewPreferences.isPreviewVisible;
  }, [previewPreferences.isPreviewVisible]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance) {
      return;
    }

    let isDisposed = false;

    void resolveAppInstanceId().then((nextAppInstanceId) => {
      if (isDisposed) {
        return;
      }

      setAppInstanceId(nextAppInstanceId);
    });

    return () => {
      isDisposed = true;
    };
  }, [manageVisibilityByAppInstance]);

  useEffect(() => {
    if (manageVisibilityByAppInstance) {
      persistPreviewDisplayMode(previewPreferences.previewDisplayMode);
      return;
    }

    persistPreviewPreferences(previewPreferences);
  }, [manageVisibilityByAppInstance, previewPreferences]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    setPreviewPreferences((currentPreviewPreferences) => {
      const storedInstancePreviewVisibility = loadInstancePreviewVisibility(appInstanceId);

      if (storedInstancePreviewVisibility === null) {
        persistInstancePreviewVisibility(appInstanceId, currentPreviewPreferences.isPreviewVisible);
        return currentPreviewPreferences;
      }

      if (currentPreviewPreferences.isPreviewVisible === storedInstancePreviewVisibility) {
        return currentPreviewPreferences;
      }

      return {
        ...currentPreviewPreferences,
        isPreviewVisible: storedInstancePreviewVisibility,
      };
    });
  }, [appInstanceId, manageVisibilityByAppInstance]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    const syncPresence = () => {
      const activeAppInstanceCount = touchAppInstancePresence(appInstanceId);

      if (activeAppInstanceCount <= 1) {
        persistSingletonPreviewVisibility(previewVisibilityRef.current);
      }
    };

    syncPresence();

    const intervalId = window.setInterval(syncPresence, APP_INSTANCE_PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearInterval(intervalId);
      removeAppInstancePresence(appInstanceId);
    };
  }, [appInstanceId, manageVisibilityByAppInstance]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    persistInstancePreviewVisibility(appInstanceId, previewPreferences.isPreviewVisible);

    if (countActiveAppInstances() <= 1) {
      persistSingletonPreviewVisibility(previewPreferences.isPreviewVisible);
    }
  }, [appInstanceId, manageVisibilityByAppInstance, previewPreferences.isPreviewVisible]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === PREVIEW_PREFERENCES_STORAGE_KEY) {
        const nextPreviewPreferences = loadPreviewPreferences();

        setPreviewPreferences((currentPreviewPreferences) => {
          const nextIsPreviewVisible = manageVisibilityByAppInstance
            ? currentPreviewPreferences.isPreviewVisible
            : nextPreviewPreferences.isPreviewVisible;

          return currentPreviewPreferences.previewDisplayMode === nextPreviewPreferences.previewDisplayMode
            && currentPreviewPreferences.isPreviewVisible === nextIsPreviewVisible
            ? currentPreviewPreferences
            : {
              previewDisplayMode: nextPreviewPreferences.previewDisplayMode,
              isPreviewVisible: nextIsPreviewVisible,
            };
        });

        return;
      }

      if (manageVisibilityByAppInstance && appInstanceId !== null) {
        const instancePreviewVisibilityStorageKey = getInstancePreviewVisibilityStorageKey(appInstanceId);

        if (event.key === instancePreviewVisibilityStorageKey) {
          const nextInstancePreviewVisibility = loadInstancePreviewVisibility(appInstanceId);

          if (nextInstancePreviewVisibility !== null) {
            setPreviewPreferences((currentPreviewPreferences) => (
              currentPreviewPreferences.isPreviewVisible === nextInstancePreviewVisibility
                ? currentPreviewPreferences
                : {
                  ...currentPreviewPreferences,
                  isPreviewVisible: nextInstancePreviewVisibility,
                }
            ));
          }

          return;
        }

        if (event.key === null || isAppInstancePresenceStorageKey(event.key)) {
          if (countActiveAppInstances() <= 1) {
            persistSingletonPreviewVisibility(previewVisibilityRef.current);
          }
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [appInstanceId, manageVisibilityByAppInstance]);

  const handlePreviewDisplayModeChange = useCallback((previewDisplayMode: PreviewDisplayMode) => {
    setPreviewPreferences((currentPreviewPreferences) => {
      if (currentPreviewPreferences.previewDisplayMode === previewDisplayMode) {
        return currentPreviewPreferences;
      }

      return {
        ...currentPreviewPreferences,
        previewDisplayMode,
      };
    });
  }, []);

  const handlePreviewVisibilityChange = useCallback((isPreviewVisible: boolean) => {
    setPreviewPreferences((currentPreviewPreferences) => {
      if (currentPreviewPreferences.isPreviewVisible === isPreviewVisible) {
        return currentPreviewPreferences;
      }

      return {
        ...currentPreviewPreferences,
        isPreviewVisible,
      };
    });
  }, []);

  return {
    isPreviewVisible: previewPreferences.isPreviewVisible,
    previewDisplayMode: previewPreferences.previewDisplayMode,
    onPreviewDisplayModeChange: handlePreviewDisplayModeChange,
    onPreviewVisibilityChange: handlePreviewVisibilityChange,
  };
}