import {
  type AppDocumentThemeGateway,
  type AppDocumentThemeResolver,
  type AppShellDocumentTheme,
} from "./appShellPorts";

type AppShellControllerDependencies = {
  readonly documentThemeGateway: AppDocumentThemeGateway;
  readonly documentThemeResolver: AppDocumentThemeResolver;
};

export class AppShellController {
  readonly #documentThemeGateway: AppDocumentThemeGateway;
  readonly #documentThemeResolver: AppDocumentThemeResolver;

  constructor(dependencies: AppShellControllerDependencies) {
    this.#documentThemeGateway = dependencies.documentThemeGateway;
    this.#documentThemeResolver = dependencies.documentThemeResolver;
  }

  applyDocumentTheme(documentTheme: AppShellDocumentTheme): void {
    this.#documentThemeGateway.applyDocumentTheme({
      appFontFamily: this.#documentThemeResolver.resolveAppFontFamily(documentTheme.appFontId),
      appThemeId: documentTheme.appThemeId,
      editFontFamily: this.#documentThemeResolver.resolveEditFontFamily(documentTheme.editFontId),
      editFontSizePx: documentTheme.editFontSizePx,
      systemFontSizePx: documentTheme.systemFontSizePx,
      previewUsesAppThemeColors: documentTheme.previewUsesAppThemeColors,
    });
  }
}
