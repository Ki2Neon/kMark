import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserEditorPreferencesGateway } from "../../adapters/browser/browserEditorPreferencesGateway";
import { createBrowserWindowsStartupTrayResidentGateway } from "../../adapters/browser/browserWindowsStartupTrayResidentGateway";
import { EditorPreferencesController } from "../../application/editorPreferences/editorPreferencesController";
import {
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type EditorPreferences,
  type MultiCursorModifier,
  type StartupEditMode,
} from "../../domain/editorPreferences";

type UseEditorPreferencesOptions = {
  readonly syncWindowsStartupTrayResident?: boolean;
};

export function useEditorPreferences(options: UseEditorPreferencesOptions = {}) {
  const { syncWindowsStartupTrayResident = true } = options;
  const controllerRef = useRef<EditorPreferencesController | null>(null);
  const isLoadedRef = useRef(false);

  if (controllerRef.current === null) {
    controllerRef.current = new EditorPreferencesController({
      preferencesGateway: createBrowserEditorPreferencesGateway(),
      windowsStartupTrayResidentGateway: createBrowserWindowsStartupTrayResidentGateway(),
    });
  }

  const controller = controllerRef.current;
  const [editorPreferences, setEditorPreferences] = useState<EditorPreferences>(() => controller.createInitialState());
  const [isReady, setIsReady] = useState(false);
  const canControlWindowsStartupTrayResident =
    controller.canControlWindowsStartupTrayResident(syncWindowsStartupTrayResident);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void controller.load().then((nextEditorPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setEditorPreferences(nextEditorPreferences);
      setIsReady(true);
    }).catch(() => {
      if (isDisposed) {
        return;
      }

      setEditorPreferences(controller.createInitialState());
      setIsReady(true);
    });

    void controller.subscribeToPreferences((nextEditorPreferences) => {
      if (isDisposed) {
        return;
      }

      isLoadedRef.current = true;
      setEditorPreferences(nextEditorPreferences);
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

  const handleMultiCursorModifierChange = useCallback((multiCursorModifier: MultiCursorModifier) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeMultiCursorModifier(currentPreferences, multiCursorModifier);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleAppFontChange = useCallback((appFontId: AppFontId) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeAppFont(currentPreferences, appFontId);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleEditFontChange = useCallback((editFontId: EditFontId) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeEditFont(currentPreferences, editFontId);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleEditFontSizeChange = useCallback((editFontSizePx: EditFontSizePx) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeEditFontSize(currentPreferences, editFontSizePx);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleShowLineNumbersChange = useCallback((showLineNumbers: boolean) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeShowLineNumbers(currentPreferences, showLineNumbers);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleStartupEditModeChange = useCallback((startupEditMode: StartupEditMode) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeStartupEditMode(currentPreferences, startupEditMode);

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  const handleWindowsStartupTrayResidentChange = useCallback((windowsStartupTrayResidentEnabled: boolean) => {
    setEditorPreferences((currentPreferences) => {
      const nextPreferences = controller.changeWindowsStartupTrayResident(
        currentPreferences,
        windowsStartupTrayResidentEnabled,
      );

      if (nextPreferences !== currentPreferences && isLoadedRef.current) {
        void controller.persist(nextPreferences).catch(() => {
          void controller.load().then(setEditorPreferences).catch(() => {});
        });
      }

      return nextPreferences;
    });
  }, [controller]);

  return {
    appFontId: editorPreferences.appFontId,
    canControlWindowsStartupTrayResident,
    editFontId: editorPreferences.editFontId,
    editFontSizePx: editorPreferences.editFontSizePx,
    isReady,
    multiCursorModifier: editorPreferences.multiCursorModifier,
    showLineNumbers: editorPreferences.showLineNumbers,
    startupEditMode: editorPreferences.startupEditMode,
    windowsStartupTrayResidentEnabled: editorPreferences.windowsStartupTrayResidentEnabled,
    onAppFontChange: handleAppFontChange,
    onEditFontChange: handleEditFontChange,
    onEditFontSizeChange: handleEditFontSizeChange,
    onMultiCursorModifierChange: handleMultiCursorModifierChange,
    onShowLineNumbersChange: handleShowLineNumbersChange,
    onStartupEditModeChange: handleStartupEditModeChange,
    onWindowsStartupTrayResidentChange: handleWindowsStartupTrayResidentChange,
  };
}
