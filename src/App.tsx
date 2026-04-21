import { useLayoutEffect } from "react";
import "./App.css";
import { isPreviewWindowMode } from "./infra/previewWindow";
import { useEditorPreferences } from "./ui/hooks/useEditorPreferences";
import { useAppTheme } from "./ui/hooks/useAppTheme";
import { MarkdownEditorScreen } from "./ui/screens/MarkdownEditorScreen";
import { PreviewWindowScreen } from "./ui/screens/PreviewWindowScreen";

function App() {
  const previewWindowMode = isPreviewWindowMode();
  const { appThemeId, onAppThemeChange } = useAppTheme();
  const { multiCursorModifier, onMultiCursorModifierChange } = useEditorPreferences();

  useLayoutEffect(() => {
    document.documentElement.dataset.appTheme = appThemeId;
  }, [appThemeId]);

  if (previewWindowMode) {
    return <PreviewWindowScreen />;
  }

  return (
    <MarkdownEditorScreen
      appThemeId={appThemeId}
      multiCursorModifier={multiCursorModifier}
      onAppThemeChange={onAppThemeChange}
      onMultiCursorModifierChange={onMultiCursorModifierChange}
    />
  );
}

export default App;
