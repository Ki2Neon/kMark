import { useCallback, useEffect, useState } from "react";
import {
  type AppFontId,
  clampDraftFontSizePx,
  type DraftFontId,
  type DraftFontSizePx,
  type EditorPreferences,
  type MultiCursorModifier,
  type StartupDraftMode,
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

  const handleDraftFontChange = useCallback((draftFontId: DraftFontId) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.draftFontId === draftFontId) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        draftFontId,
      };
    });
  }, []);

  const handleDraftFontSizeChange = useCallback((draftFontSizePx: DraftFontSizePx) => {
    const nextDraftFontSizePx = clampDraftFontSizePx(draftFontSizePx);

    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.draftFontSizePx === nextDraftFontSizePx) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        draftFontSizePx: nextDraftFontSizePx,
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

  const handleStartupDraftModeChange = useCallback((startupDraftMode: StartupDraftMode) => {
    setEditorPreferences((currentPreferences) => {
      if (currentPreferences.startupDraftMode === startupDraftMode) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        startupDraftMode,
      };
    });
  }, []);

  return {
    appFontId: editorPreferences.appFontId,
    draftFontId: editorPreferences.draftFontId,
    draftFontSizePx: editorPreferences.draftFontSizePx,
    multiCursorModifier: editorPreferences.multiCursorModifier,
    showLineNumbers: editorPreferences.showLineNumbers,
    startupDraftMode: editorPreferences.startupDraftMode,
    onAppFontChange: handleAppFontChange,
    onDraftFontChange: handleDraftFontChange,
    onDraftFontSizeChange: handleDraftFontSizeChange,
    onMultiCursorModifierChange: handleMultiCursorModifierChange,
    onShowLineNumbersChange: handleShowLineNumbersChange,
    onStartupDraftModeChange: handleStartupDraftModeChange,
  };
}