import {
  type AppDocumentThemeGateway,
  type AppDocumentThemeResolver,
  type AppRuntimeGateway,
  type AppShellDocumentTheme,
} from "./appShellPorts";

type AppShellControllerDependencies = {
  readonly documentThemeGateway: AppDocumentThemeGateway;
  readonly documentThemeResolver: AppDocumentThemeResolver;
  readonly runtimeGateway: AppRuntimeGateway;
};

export class AppShellController {
  readonly #documentThemeGateway: AppDocumentThemeGateway;
  readonly #documentThemeResolver: AppDocumentThemeResolver;
  readonly #runtimeGateway: AppRuntimeGateway;

  constructor(dependencies: AppShellControllerDependencies) {
    this.#documentThemeGateway = dependencies.documentThemeGateway;
    this.#documentThemeResolver = dependencies.documentThemeResolver;
    this.#runtimeGateway = dependencies.runtimeGateway;
  }

  isPreviewWindowMode(search?: string): boolean {
    return this.#runtimeGateway.isPreviewWindowMode(search);
  }

  applyDocumentTheme(documentTheme: AppShellDocumentTheme): void {
    this.#documentThemeGateway.applyDocumentTheme({
      appFontFamily: this.#documentThemeResolver.resolveAppFontFamily(documentTheme.appFontId),
      appThemeId: documentTheme.appThemeId,
      editFontFamily: this.#documentThemeResolver.resolveEditFontFamily(documentTheme.editFontId),
      editFontSizePx: documentTheme.editFontSizePx,
      previewUsesAppThemeColors: documentTheme.previewUsesAppThemeColors,
    });
  }
}
