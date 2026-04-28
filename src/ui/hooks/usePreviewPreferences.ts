import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserAppInstanceGateway } from "../../adapters/browser/browserAppInstanceGateway";
import { createBrowserPreviewPreferencesGateway } from "../../adapters/browser/browserPreviewPreferencesGateway";
import { PreviewPreferencesController } from "../../application/previewPreferences/previewPreferencesController";
import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";

type UsePreviewPreferencesOptions = {
  readonly manageVisibilityByAppInstance?: boolean;
};

export function usePreviewPreferences(options: UsePreviewPreferencesOptions = {}) {
  const { manageVisibilityByAppInstance = false } = options;
  const controllerRef = useRef<PreviewPreferencesController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewPreferencesController({
      appInstanceGateway: createBrowserAppInstanceGateway(),
      preferencesGateway: createBrowserPreviewPreferencesGateway(),
    });
  }

  const controller = controllerRef.current;
  const [previewPreferences, setPreviewPreferences] = useState<PreviewPreferences>(() => controller.createState());
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

    void controller.resolveAppInstanceId(manageVisibilityByAppInstance).then((nextAppInstanceId) => {
      if (isDisposed) {
        return;
      }

      setAppInstanceId(nextAppInstanceId);
    });

    return () => {
      isDisposed = true;
    };
  }, [controller, manageVisibilityByAppInstance]);

  useEffect(() => {
    controller.persist(previewPreferences, manageVisibilityByAppInstance);
  }, [controller, manageVisibilityByAppInstance, previewPreferences]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    setPreviewPreferences((currentPreviewPreferences) => (
      controller.syncManagedPreviewVisibility(currentPreviewPreferences, appInstanceId)
    ));
  }, [appInstanceId, controller, manageVisibilityByAppInstance]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    const syncPresence = () => {
      controller.syncPresence(appInstanceId, previewVisibilityRef.current);
    };

    syncPresence();

    const intervalId = window.setInterval(syncPresence, controller.getAppInstancePresenceHeartbeatMs());

    return () => {
      window.clearInterval(intervalId);
      controller.cleanupPresence(appInstanceId);
    };
  }, [appInstanceId, controller, manageVisibilityByAppInstance]);

  useEffect(() => {
    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return;
    }

    controller.persistManagedVisibility(appInstanceId, previewPreferences.isPreviewVisible);
  }, [appInstanceId, controller, manageVisibilityByAppInstance, previewPreferences.isPreviewVisible]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      setPreviewPreferences((currentPreviewPreferences) => (
        controller.handleStorageChange({
          appInstanceId,
          currentPreviewPreferences,
          key: event.key,
          manageVisibilityByAppInstance,
        }) ?? currentPreviewPreferences
      ));
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [appInstanceId, controller, manageVisibilityByAppInstance]);

  const handlePreviewDisplayModeChange = useCallback((previewDisplayMode: PreviewDisplayMode) => {
    setPreviewPreferences((currentPreviewPreferences) => (
      controller.changePreviewDisplayMode(currentPreviewPreferences, previewDisplayMode)
    ));
  }, [controller]);

  const handlePreviewVisibilityChange = useCallback((isPreviewVisible: boolean) => {
    setPreviewPreferences((currentPreviewPreferences) => (
      controller.changePreviewVisibility(currentPreviewPreferences, isPreviewVisible)
    ));
  }, [controller]);

  return {
    isPreviewVisible: previewPreferences.isPreviewVisible,
    previewDisplayMode: previewPreferences.previewDisplayMode,
    onPreviewDisplayModeChange: handlePreviewDisplayModeChange,
    onPreviewVisibilityChange: handlePreviewVisibilityChange,
  };
}
