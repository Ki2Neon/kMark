import { useLayoutEffect } from "react";
import "./App.css";
import { resolveAppFontFamily, resolveDraftFontFamily } from "./domain/editorPreferences";
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
    draftFontId,
    multiCursorModifier,
    onAppFontChange,
    onDraftFontChange,
    onMultiCursorModifierChange,
  } = useEditorPreferences();

  useLayoutEffect(() => {
    document.documentElement.dataset.appTheme = appThemeId;
    document.documentElement.dataset.previewColors = previewUsesAppThemeColors ? "app" : "fixed";
    document.documentElement.style.setProperty("--app-font-family", resolveAppFontFamily(appFontId));
    document.documentElement.style.setProperty("--draft-font-family", resolveDraftFontFamily(draftFontId));
  }, [appFontId, appThemeId, draftFontId, previewUsesAppThemeColors]);

  if (previewWindowMode) {
    return <PreviewWindowScreen />;
  }

  return (
    <MarkdownEditorScreen
      appFontId={appFontId}
      appThemeId={appThemeId}
      draftFontId={draftFontId}
      multiCursorModifier={multiCursorModifier}
      onAppFontChange={onAppFontChange}
      onAppThemeChange={onAppThemeChange}
      onDraftFontChange={onDraftFontChange}
      onMultiCursorModifierChange={onMultiCursorModifierChange}
      onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
      previewUsesAppThemeColors={previewUsesAppThemeColors}
    />
  );
}

export default App;
