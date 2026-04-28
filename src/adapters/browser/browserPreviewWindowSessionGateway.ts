import { type PreviewWindowSessionGateway } from "../../application/previewWindowSession/previewWindowSessionPorts";
import {
  getPreviewWindowEditJumpRequestStorageKey,
  loadPreviewWindowEditJumpRequest,
  persistPreviewWindowActiveSourceLine,
  persistPreviewWindowSnapshot,
} from "../../infra/previewWindowSync";
import { openPreviewWindow, resolveAppInstanceId } from "../../infra/previewWindow";

export function createBrowserPreviewWindowSessionGateway(): PreviewWindowSessionGateway {
  return {
    resolveInstanceId() {
      return resolveAppInstanceId();
    },

    async openWindow(instanceId) {
      await openPreviewWindow(instanceId);
    },

    persistSnapshot(instanceId, snapshot) {
      persistPreviewWindowSnapshot(instanceId, snapshot);
    },

    persistActiveSourceLine(instanceId, activeSourceLine) {
      persistPreviewWindowActiveSourceLine(instanceId, activeSourceLine);
    },

    getEditJumpRequestStorageKey(instanceId) {
      return getPreviewWindowEditJumpRequestStorageKey(instanceId);
    },

    loadEditJumpRequest(instanceId) {
      return loadPreviewWindowEditJumpRequest(instanceId);
    },
  };
}
