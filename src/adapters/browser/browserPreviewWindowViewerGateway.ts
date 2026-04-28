import { type PreviewWindowViewerGateway } from "../../application/previewWindowViewer/previewWindowViewerPorts";
import { resolvePreviewWindowInstanceId } from "../../infra/previewWindow";
import {
  getPreviewWindowCursorSyncStorageKey,
  getPreviewWindowSnapshotStorageKey,
  loadPreviewWindowActiveSourceLine,
  loadPreviewWindowSnapshot,
  requestPreviewWindowEditJump,
} from "../../infra/previewWindowSync";

export function createBrowserPreviewWindowViewerGateway(): PreviewWindowViewerGateway {
  return {
    getCursorSyncStorageKey(instanceId) {
      return getPreviewWindowCursorSyncStorageKey(instanceId);
    },

    getSnapshotStorageKey(instanceId) {
      return getPreviewWindowSnapshotStorageKey(instanceId);
    },

    loadActiveSourceLine(instanceId) {
      return loadPreviewWindowActiveSourceLine(instanceId);
    },

    loadSnapshot(instanceId) {
      const snapshot = loadPreviewWindowSnapshot(instanceId);

      if (snapshot === null) {
        return null;
      }

      return {
        content: snapshot.content,
        fileName: snapshot.fileName,
      };
    },

    requestEditJump(instanceId, lineNumber) {
      requestPreviewWindowEditJump(instanceId, lineNumber);
    },

    resolveInstanceId(search) {
      return resolvePreviewWindowInstanceId(search);
    },
  };
}
