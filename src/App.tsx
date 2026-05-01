import "./App.css";
import { useEditorPreferences } from "./ui/hooks/useEditorPreferences";
import { useAppTheme } from "./ui/hooks/useAppTheme";
import { useAppShell } from "./ui/hooks/useAppShell";
import { MarkdownEditorScreen } from "./ui/screens/MarkdownEditorScreen";

function App() {
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
    systemFontSizePx,
    windowsStartupTrayResidentEnabled,
    isReady: isEditorPreferencesReady,
    onAppFontChange,
    onEditFontChange,
    onEditFontSizeChange,
    onMultiCursorModifierChange,
    onShowLineNumbersChange,
    onStartupEditModeChange,
    onSystemFontSizeChange,
    onWindowsStartupTrayResidentChange,
  } = useEditorPreferences();
  useAppShell({
    appFontId,
    appThemeId,
    editFontId,
    editFontSizePx,
    systemFontSizePx,
    previewUsesAppThemeColors,
  });

  if (!isThemeReady || !isEditorPreferencesReady) {
    return null;
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
      systemFontSizePx={systemFontSizePx}
      windowsStartupTrayResidentEnabled={windowsStartupTrayResidentEnabled}
      onAppFontChange={onAppFontChange}
      onAppThemeChange={onAppThemeChange}
      onEditFontChange={onEditFontChange}
      onEditFontSizeChange={onEditFontSizeChange}
      onMultiCursorModifierChange={onMultiCursorModifierChange}
      onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
      onShowLineNumbersChange={onShowLineNumbersChange}
      onStartupEditModeChange={onStartupEditModeChange}
      onSystemFontSizeChange={onSystemFontSizeChange}
      onWindowsStartupTrayResidentChange={onWindowsStartupTrayResidentChange}
      previewUsesAppThemeColors={previewUsesAppThemeColors}
    />
  );
}

export default App;
