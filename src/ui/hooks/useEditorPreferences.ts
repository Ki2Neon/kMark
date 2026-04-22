import { useCallback, useEffect, useState } from "react";
import {
  type AppFontId,
  clampEditFontSizePx,
  type EditFontId,
  type EditFontSizePx,
  type EditorPreferences,
  type MultiCursorModifier,
  type StartupEditMode,
} from "../../domain/editorPreferences";
import { loadEditorPreferences, persistEditorPreferences } from "../../infra/editorPreferences";

export function useEditorPreferences() {
  const [editorPreferences, setEditorPreferences] = useState<EditorPreferences>(() => loadEditorPreferences());

  useEffect(() => {
    persistEditorPreferences(editorPreferences);
  }, [editorPreferences]);

  const handleMultiCursorModifierChange = useCallback((multiCursorModifier: MultiCursorModifier) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.multiCursorModifier === multiCursorModifier) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        multiCursorModifier,
      };
    });
  }, []);

  const handleAppFontChange = useCallback((appFontId: AppFontId) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.appFontId === appFontId) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        appFontId,
      };
    });
  }, []);

  const handleEditFontChange = useCallback((editFontId: EditFontId) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.editFontId === editFontId) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        editFontId,
      };
    });
  }, []);

  const handleEditFontSizeChange = useCallback((editFontSizePx: EditFontSizePx) => {
    const nextEditFontSizePx = clampEditFontSizePx(editFontSizePx);

    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.editFontSizePx === nextEditFontSizePx) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        editFontSizePx: nextEditFontSizePx,
      };
    });
  }, []);

  const handleShowLineNumbersChange = useCallback((showLineNumbers: boolean) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.showLineNumbers === showLineNumbers) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        showLineNumbers,
      };
    });
  }, []);

  const handleStartupEditModeChange = useCallback((startupEditMode: StartupEditMode) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.startupEditMode === startupEditMode) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        startupEditMode,
      };
    });
  }, []);

  return {
    appFontId: editorPreferences.appFontId,
    editFontId: editorPreferences.editFontId,
    editFontSizePx: editorPreferences.editFontSizePx,
    multiCursorModifier: editorPreferences.multiCursorModifier,
    showLineNumbers: editorPreferences.showLineNumbers,
    startupEditMode: editorPreferences.startupEditMode,
    onAppFontChange: handleAppFontChange,
    onEditFontChange: handleEditFontChange,
    onEditFontSizeChange: handleEditFontSizeChange,
    onMultiCursorModifierChange: handleMultiCursorModifierChange,
    onShowLineNumbersChange: handleShowLineNumbersChange,
    onStartupEditModeChange: handleStartupEditModeChange,
  };
}