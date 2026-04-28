import { type AppRuntimeGateway } from "../../application/appShell/appShellPorts";
import { isPreviewWindowMode } from "../../infra/previewWindow";

export function createBrowserAppRuntimeGateway(): AppRuntimeGateway {
  return {
    isPreviewWindowMode(search) {
      return isPreviewWindowMode(search);
    },
  };
}
