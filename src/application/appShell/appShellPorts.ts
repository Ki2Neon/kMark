import {
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type SystemFontSizePx,
} from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

export type AppShellDocumentTheme = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly systemFontSizePx: SystemFontSizePx;
  readonly previewUsesAppThemeColors: boolean;
};

export type AppDocumentThemeResolver = {
  resolveAppFontFamily(appFontId: AppFontId): string;
  resolveEditFontFamily(editFontId: EditFontId): string;
};

export type AppDocumentThemeGateway = {
  applyDocumentTheme(theme: {
    readonly appFontFamily: string;
    readonly appThemeId: AppThemeId;
    readonly editFontFamily: string;
    readonly editFontSizePx: EditFontSizePx;
    readonly systemFontSizePx: SystemFontSizePx;
    readonly previewUsesAppThemeColors: boolean;
  }): void;
};
