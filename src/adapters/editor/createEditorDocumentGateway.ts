import { type EditorDocumentGateway } from "../../application/editorSession/editorDocumentPort";
import { isTauri } from "../../runtime/runtime";
import { createWasmEditorDocumentGateway } from "../browser/wasmEditorDocumentGateway";
import { createTauriEditorDocumentGateway } from "../tauri/tauriEditorDocumentGateway";

export function createEditorDocumentGateway(): EditorDocumentGateway {
  return isTauri()
    ? createTauriEditorDocumentGateway()
    : createWasmEditorDocumentGateway();
}
