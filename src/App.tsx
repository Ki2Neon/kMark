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
    editFontId,
    editFontSizePx,
    multiCursorModifier,
    showLineNumbers,
    startupEditMode,
    onAppFontChange,
    onEditFontChange,
    onEditFontSizeChange,
    onMultiCursorModifierChange,
    onShowLineNumbersChange,
    onStartupEditModeChange,
  } = useEditorPreferences();

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
      editFontId={editFontId}
      editFontSizePx={editFontSizePx}
      multiCursorModifier={multiCursorModifier}
      showLineNumbers={showLineNumbers}
      startupEditMode={startupEditMode}
      onAppFontChange={onAppFontChange}
      onAppThemeChange={onAppThemeChange}
      onEditFontChange={onEditFontChange}
      onEditFontSizeChange={onEditFontSizeChange}
      onMultiCursorModifierChange={onMultiCursorModifierChange}
      onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
      onShowLineNumbersChange={onShowLineNumbersChange}
      onStartupEditModeChange={onStartupEditModeChange}
      previewUsesAppThemeColors={previewUsesAppThemeColors}
    />
  );
}

export default App;
