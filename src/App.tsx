import "./App.css";
import { useEditorPreferences } from "./ui/hooks/useEditorPreferences";
import { useAppTheme } from "./ui/hooks/useAppTheme";
import { useAppShell } from "./ui/hooks/useAppShell";
import { useBrowserShortcutGuard } from "./ui/hooks/useBrowserShortcutGuard";
import { MarkdownEditorScreen } from "./ui/screens/MarkdownEditorScreen";
import { SubWindowScreen } from "./ui/screens/SubWindowScreen";
import { type InitialEditorDocumentMode } from "./ui/hooks/useMarkdownEditor";
import { resolveBrowserSubWindowTarget } from "./adapters/browser/browserSubWindowGateway";
import { useStateStorageIssues } from "./ui/hooks/useStateStorageIssues";

function detectInitialEditorDocumentMode(): InitialEditorDocumentMode {
  if (typeof window === "undefined") {
    return "stored";
  }

  return new URLSearchParams(window.location.search).get("kmarkInitialDocument") === "new-untitled"
    ? "new-untitled"
    : "stored";
}

function detectInitialExternalSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("kmarkSessionId");
}

function detectSubWindowTarget(): { readonly stateKey: string | null } | null {
  return resolveBrowserSubWindowTarget();
}

function App() {
  const fatalStateStorageError = useStateStorageIssues();

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
    lineWrappingEnabled,
    multiCursorModifier,
    showLineNumbers,
    startupEditMode,
    systemFontSizePx,
    windowsStartupTrayResidentEnabled,
    isReady: isEditorPreferencesReady,
    onAppFontChange,
    onEditFontChange,
    onEditFontSizeChange,
    onLineWrappingEnabledChange,
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
  useBrowserShortcutGuard();

  if (fatalStateStorageError !== null) {
    return (
      <main className="state-storage-fatal" role="alert">
        <h1>保存データ互換性エラー</h1>
        <p>{fatalStateStorageError}</p>
      </main>
    );
  }

  if (!isThemeReady || !isEditorPreferencesReady) {
    return null;
  }

  const subWindowTarget = detectSubWindowTarget();

  if (subWindowTarget !== null) {
    return <SubWindowScreen stateKey={subWindowTarget.stateKey} />;
  }

  return (
    <MarkdownEditorScreen
      appFontId={appFontId}
      appThemeId={appThemeId}
      canControlWindowsStartupTrayResident={canControlWindowsStartupTrayResident}
      editFontId={editFontId}
      editFontSizePx={editFontSizePx}
      initialDocumentMode={detectInitialEditorDocumentMode()}
      initialExternalSessionId={detectInitialExternalSessionId()}
      lineWrappingEnabled={lineWrappingEnabled}
      multiCursorModifier={multiCursorModifier}
      showLineNumbers={showLineNumbers}
      startupEditMode={startupEditMode}
      systemFontSizePx={systemFontSizePx}
      windowsStartupTrayResidentEnabled={windowsStartupTrayResidentEnabled}
      onAppFontChange={onAppFontChange}
      onAppThemeChange={onAppThemeChange}
      onEditFontChange={onEditFontChange}
      onEditFontSizeChange={onEditFontSizeChange}
      onLineWrappingEnabledChange={onLineWrappingEnabledChange}
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
