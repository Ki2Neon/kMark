import { type AppDocumentThemeGateway } from "../../application/appShell/appShellPorts";

export function createBrowserDocumentThemeGateway(): AppDocumentThemeGateway {
  return {
    applyDocumentTheme(theme) {
      document.documentElement.dataset.appTheme = theme.appThemeId;
      document.documentElement.dataset.previewColors = theme.previewUsesAppThemeColors ? "app" : "fixed";
      document.documentElement.style.setProperty("--app-font-family", theme.appFontFamily);
      document.documentElement.style.setProperty("--app-font-size", `${theme.systemFontSizePx}px`);
      document.documentElement.style.setProperty("--edit-font-family", theme.editFontFamily);
      document.documentElement.style.setProperty("--edit-font-size", `${theme.editFontSizePx}px`);
    },
  };
}
