import "./App.css";
import { useEditorPreferences } from "./ui/hooks/useEditorPreferences";
import { useAppTheme } from "./ui/hooks/useAppTheme";
import { useAppMode, useAppShell } from "./ui/hooks/useAppShell";
import { MarkdownEditorScreen } from "./ui/screens/MarkdownEditorScreen";
import { PreviewWindowScreen } from "./ui/screens/PreviewWindowScreen";

function App() {
  const { previewWindowMode } = useAppMode();
  const {
    appThemeId,
    isReady: isThemeReady,
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
    isReady: isEditorPreferencesReady,
    onAppFontChange,
    onEditFontChange,
    onEditFontSizeChange,
    onMultiCursorModifierChange,
    onShowLineNumbersChange,
    onStartupEditModeChange,
    onWindowsStartupTrayResidentChange,
  } = useEditorPreferences({ syncWindowsStartupTrayResident: !previewWindowMode });
  useAppShell({
    appFontId,
    appThemeId,
    editFontId,
    editFontSizePx,
    previewUsesAppThemeColors,
  });

  if (!isThemeReady || !isEditorPreferencesReady) {
    return null;
  }

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
