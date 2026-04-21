import { useCallback, useEffect, useState } from "react";
import { type EditorPreferences, type MultiCursorModifier } from "../../domain/editorPreferences";
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

  return {
    multiCursorModifier: editorPreferences.multiCursorModifier,
    onMultiCursorModifierChange: handleMultiCursorModifierChange,
  };
}