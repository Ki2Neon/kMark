import {
  type PreviewWindowViewerGateway,
  type PreviewWindowViewerState,
} from "../../application/previewWindowViewer/previewWindowViewerPorts";
import {
  loadPreviewWindowState,
  listenForPreviewWindowStateUpdates,
  requestPreviewWindowEditJump,
} from "../../infra/previewWindow";

export function createBrowserPreviewWindowViewerGateway(): PreviewWindowViewerGateway {
  return {
    async loadState() {
      return loadPreviewWindowState();
    },

    async listenForStateUpdates(callback) {
      return listenForPreviewWindowStateUpdates((previewWindowState: PreviewWindowViewerState) => {
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
