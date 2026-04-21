import { useCallback, useEffect, useState } from "react";
import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";
import {
  PREVIEW_PREFERENCES_STORAGE_KEY,
  loadPreviewPreferences,
  persistPreviewPreferences,
} from "../../infra/previewPreferences";

export function usePreviewPreferences() {
  const [previewPreferences, setPreviewPreferences] = useState<PreviewPreferences>(() => loadPreviewPreferences());

  useEffect(() => {
    persistPreviewPreferences(previewPreferences);
  }, [previewPreferences]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== PREVIEW_PREFERENCES_STORAGE_KEY) {
        return;
      }

      const nextPreviewPreferences = loadPreviewPreferences();

      setPreviewPreferences((currentPreviewPreferences) => (
        currentPreviewPreferences.previewDisplayMode === nextPreviewPreferences.previewDisplayMode
        && currentPreviewPreferences.isPreviewVisible === nextPreviewPreferences.isPreviewVisible
          ? currentPreviewPreferences
          : nextPreviewPreferences
      ));
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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