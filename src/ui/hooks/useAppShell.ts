import { useLayoutEffect, useRef } from "react";
import { createBrowserDocumentThemeGateway } from "../../adapters/browser/browserDocumentThemeGateway";
import { createBrowserDocumentThemeResolver } from "../../adapters/browser/browserDocumentThemeResolver";
import { AppShellController } from "../../application/appShell/appShellController";
import { type AppFontId, type EditFontId, type EditFontSizePx } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

type UseAppShellThemeOptions = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly previewUsesAppThemeColors: boolean;
};

function useAppShellController() {
  const controllerRef = useRef<AppShellController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new AppShellController({
      documentThemeGateway: createBrowserDocumentThemeGateway(),
      documentThemeResolver: createBrowserDocumentThemeResolver(),
    });
  }

  return controllerRef.current;
}

export function useAppShell({
  appFontId,
  appThemeId,
  editFontId,
  editFontSizePx,
  previewUsesAppThemeColors,
}: UseAppShellThemeOptions) {
  const controller = useAppShellController();

  useLayoutEffect(() => {
    controller.applyDocumentTheme({
      appFontId,
      appThemeId,
      editFontId,
      editFontSizePx,
      previewUsesAppThemeColors,
    });
  }, [appFontId, appThemeId, controller, editFontId, editFontSizePx, previewUsesAppThemeColors]);
}
