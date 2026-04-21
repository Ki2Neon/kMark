import { useCallback, useEffect, useState } from "react";
import {
  type AppFontId,
  type DraftFontId,
  type EditorPreferences,
  type MultiCursorModifier,
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

  return {
    appFontId: editorPreferences.appFontId,
    draftFontId: editorPreferences.draftFontId,
    multiCursorModifier: editorPreferences.multiCursorModifier,
    onAppFontChange: handleAppFontChange,
    onDraftFontChange: handleDraftFontChange,
    onMultiCursorModifierChange: handleMultiCursorModifierChange,
  };
}