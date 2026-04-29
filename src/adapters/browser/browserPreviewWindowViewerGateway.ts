import { type PreviewWindowViewerGateway } from "../../application/previewWindowViewer/previewWindowViewerPorts";
import {
  loadPreviewWindowState,
  listenForPreviewWindowStateUpdates,
  requestPreviewWindowEditJump,
  type PreviewWindowState,
} from "../../infra/previewWindow";

export function createBrowserPreviewWindowViewerGateway(): PreviewWindowViewerGateway {
  return {
    async loadState() {
      return loadPreviewWindowState();
    },

    async listenForStateUpdates(callback) {
      return listenForPreviewWindowStateUpdates((previewWindowState: PreviewWindowState) => {
        callback({
          activeSourceLine: previewWindowState.activeSourceLine,
          snapshot: previewWindowState.snapshot,
        });
      });
    },

    async requestEditJump(lineNumber) {
      await requestPreviewWindowEditJump(lineNumber);
    },
  };
}
