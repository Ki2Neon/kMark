import { type AppDocumentThemeResolver } from "../../application/appShell/appShellPorts";
import { resolveAppFontFamily, resolveEditFontFamily } from "./browserRustCore";

export function createBrowserDocumentThemeResolver(): AppDocumentThemeResolver {
  return {
    resolveAppFontFamily(appFontId) {
      return resolveAppFontFamily(appFontId);
    },
    resolveEditFontFamily(editFontId) {
      return resolveEditFontFamily(editFontId);
    },
  };
}
