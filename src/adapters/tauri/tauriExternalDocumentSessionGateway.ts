import {
  type ExternalDocumentSessionGateway,
} from "../../application/editorSession/editorSessionPorts";
import {
  attachDocumentSession,
  cancelStagedFileOperation,
  commitStagedFileOperation,
  getDocumentSession,
  listenForDocumentSessionChanged,
  registerDocumentSession,
  syncDocumentSession,
} from "../../infra/externalApi";
import { isTauri } from "../../runtime/runtime";

export function createTauriExternalDocumentSessionGateway(): ExternalDocumentSessionGateway {
  return {
    isSupported: isTauri,
    register: registerDocumentSession,
    attach: attachDocumentSession,
    sync: syncDocumentSession,
    get: getDocumentSession,
    listen: listenForDocumentSessionChanged,
    commitStagedOperation: commitStagedFileOperation,
    cancelStagedOperation: cancelStagedFileOperation,
  };
}
