import {
  resolveAppFontFamily,
  resolveEditFontFamily,
} from "../../domain/editorPreferences";
import {
  type AppDocumentThemeGateway,
  type AppRuntimeGateway,
  type AppShellDocumentTheme,
} from "./appShellPorts";

type AppShellControllerDependencies = {
  readonly documentThemeGateway: AppDocumentThemeGateway;
  readonly runtimeGateway: AppRuntimeGateway;
};

export class AppShellController {
  readonly #documentThemeGateway: AppDocumentThemeGateway;
  readonly #runtimeGateway: AppRuntimeGateway;

  constructor(dependencies: AppShellControllerDependencies) {
    this.#documentThemeGateway = dependencies.documentThemeGateway;
    this.#runtimeGateway = dependencies.runtimeGateway;
  }

  isPreviewWindowMode(search?: string): boolean {
    return this.#runtimeGateway.isPreviewWindowMode(search);
  }

  applyDocumentTheme(documentTheme: AppShellDocumentTheme): void {
    this.#documentThemeGateway.applyDocumentTheme({
      appFontFamily: resolveAppFontFamily(documentTheme.appFontId),
      appThemeId: documentTheme.appThemeId,
      editFontFamily: resolveEditFontFamily(documentTheme.editFontId),
      editFontSizePx: documentTheme.editFontSizePx,
      previewUsesAppThemeColors: documentTheme.previewUsesAppThemeColors,
    });
  }
}
