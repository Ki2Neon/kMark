import { type AppFontId, type EditFontId, type EditFontSizePx } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

export type AppShellDocumentTheme = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly previewUsesAppThemeColors: boolean;
};

export type AppRuntimeGateway = {
  isPreviewWindowMode(search?: string): boolean;
};

export type AppDocumentThemeGateway = {
  applyDocumentTheme(theme: {
    readonly appFontFamily: string;
    readonly appThemeId: AppThemeId;
    readonly editFontFamily: string;
    readonly editFontSizePx: EditFontSizePx;
    readonly previewUsesAppThemeColors: boolean;
  }): void;
};
