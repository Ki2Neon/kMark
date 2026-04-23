import { useLayoutEffect } from "react";
import "./App.css";
import { resolveAppFontFamily, resolveEditFontFamily } from "./domain/editorPreferences";
import { isPreviewWindowMode } from "./infra/previewWindow";
import { useEditorPreferences } from "./ui/hooks/useEditorPreferences";
import { useAppTheme } from "./ui/hooks/useAppTheme";
import { MarkdownEditorScreen } from "./ui/screens/MarkdownEditorScreen";
import { PreviewWindowScreen } from "./ui/screens/PreviewWindowScreen";

function App() {
  const previewWindowMode = isPreviewWindowMode();
  const {
    appThemeId,
    previewUsesAppThemeColors,
    onAppThemeChange,
    onPreviewUsesAppThemeColorsChange,
  } = useAppTheme();
  const {
    appFontId,
    canControlWindowsStartupTrayResident,
    editFontId,
    editFontSizePx,
    multiCursorModifier,
    showLineNumbers,
    startupEditMode,
    windowsStartupTrayResidentEnabled,
    onAppFontChange,
    onEditFontChange,
    onEditFontSizeChange,
    onMultiCursorModifierChange,
    onShowLineNumbersChange,
    onStartupEditModeChange,
    onWindowsStartupTrayResidentChange,
  } = useEditorPreferences({ syncWindowsStartupTrayResident: !previewWindowMode });

  useLayoutEffect(() => {
    document.documentElement.dataset.appTheme = appThemeId;
    document.documentElement.dataset.previewColors = previewUsesAppThemeColors ? "app" : "fixed";
    document.documentElement.style.setProperty("--app-font-family", resolveAppFontFamily(appFontId));
    document.documentElement.style.setProperty("--edit-font-family", resolveEditFontFamily(editFontId));
    document.documentElement.style.setProperty("--edit-font-size", `${editFontSizePx}px`);
  }, [appFontId, appThemeId, editFontId, editFontSizePx, previewUsesAppThemeColors]);

  if (previewWindowMode) {
    return <PreviewWindowScreen />;
  }

  return (
    <MarkdownEditorScreen
      appFontId={appFontId}
      appThemeId={appThemeId}
      canControlWindowsStartupTrayResident={canControlWindowsStartupTrayResident}
      editFontId={editFontId}
      editFontSizePx={editFontSizePx}
      multiCursorModifier={multiCursorModifier}
      showLineNumbers={showLineNumbers}
      startupEditMode={startupEditMode}
      windowsStartupTrayResidentEnabled={windowsStartupTrayResidentEnabled}
      onAppFontChange={onAppFontChange}
      onAppThemeChange={onAppThemeChange}
      onEditFontChange={onEditFontChange}
      onEditFontSizeChange={onEditFontSizeChange}
      onMultiCursorModifierChange={onMultiCursorModifierChange}
      onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
      onShowLineNumbersChange={onShowLineNumbersChange}
      onStartupEditModeChange={onStartupEditModeChange}
      onWindowsStartupTrayResidentChange={onWindowsStartupTrayResidentChange}
      previewUsesAppThemeColors={previewUsesAppThemeColors}
    />
  );
}

export default App;
