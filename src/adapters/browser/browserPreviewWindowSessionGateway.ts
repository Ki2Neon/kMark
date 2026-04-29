import { type PreviewWindowSessionGateway } from "../../application/previewWindowSession/previewWindowSessionPorts";
import {
  listenForPreviewWindowEditJumpRequests,
  openPreviewWindow,
  syncPreviewWindowState,
} from "../../infra/previewWindow";
import { type PreviewWindowEditJumpRequest } from "../../infra/previewWindow";

export function createBrowserPreviewWindowSessionGateway(): PreviewWindowSessionGateway {
  return {
    async openWindow(snapshot, activeSourceLine) {
      await openPreviewWindow(snapshot, activeSourceLine);
    },

    async syncState(snapshot, activeSourceLine) {
      await syncPreviewWindowState(snapshot, activeSourceLine);
    },

    async listenForEditJumpRequests(callback) {
      return listenForPreviewWindowEditJumpRequests(
        (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => {
          callback(previewWindowEditJumpRequest);
        },
      );
    },
  };
}
