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

  if (controllerRef.current === null) {
    controllerRef.current = new EditorPreferencesController({
      preferencesGateway: createBrowserEditorPreferencesGateway(),
      windowsStartupTrayResidentGateway: createBrowserWindowsStartupTrayResidentGateway(),
    });
  }

  const controller = controllerRef.current;
  const [editorPreferences, setEditorPreferences] = useState<EditorPreferences>(() => controller.createState());
  const canControlWindowsStartupTrayResident =
    controller.canControlWindowsStartupTrayResident(syncWindowsStartupTrayResident);

  useEffect(() => {
    controller.persist(editorPreferences);
  }, [controller, editorPreferences]);

  useEffect(() => {
    void controller.syncWindowsStartupTrayResidentPreference(
      editorPreferences.windowsStartupTrayResidentEnabled,
      canControlWindowsStartupTrayResident,
    );
  }, [canControlWindowsStartupTrayResident, controller, editorPreferences.windowsStartupTrayResidentEnabled]);

  const handleMultiCursorModifierChange = useCallback((multiCursorModifier: MultiCursorModifier) => {
    setEditorPreferences((currentPreferences) => (
      controller.changeMultiCursorModifier(currentPreferences, multiCursorModifier)
    ));
  }, [controller]);

  const handleAppFontChange = useCallback((appFontId: AppFontId) => {
    setEditorPreferences((currentPreferences) => controller.changeAppFont(currentPreferences, appFontId));
  }, [controller]);

  const handleEditFontChange = useCallback((editFontId: EditFontId) => {
    setEditorPreferences((currentPreferences) => controller.changeEditFont(currentPreferences, editFontId));
  }, [controller]);

  const handleEditFontSizeChange = useCallback((editFontSizePx: EditFontSizePx) => {
    setEditorPreferences((currentPreferences) => (
      controller.changeEditFontSize(currentPreferences, editFontSizePx)
    ));
  }, [controller]);

  const handleShowLineNumbersChange = useCallback((showLineNumbers: boolean) => {
    setEditorPreferences((currentPreferences) => (
      controller.changeShowLineNumbers(currentPreferences, showLineNumbers)
    ));
  }, [controller]);

  const handleStartupEditModeChange = useCallback((startupEditMode: StartupEditMode) => {
    setEditorPreferences((currentPreferences) => (
      controller.changeStartupEditMode(currentPreferences, startupEditMode)
    ));
  }, [controller]);

  const handleWindowsStartupTrayResidentChange = useCallback((windowsStartupTrayResidentEnabled: boolean) => {
    setEditorPreferences((currentPreferences) => (
      controller.changeWindowsStartupTrayResident(currentPreferences, windowsStartupTrayResidentEnabled)
    ));
  }, [controller]);

  return {
    appFontId: editorPreferences.appFontId,
    canControlWindowsStartupTrayResident,
    editFontId: editorPreferences.editFontId,
    editFontSizePx: editorPreferences.editFontSizePx,
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
