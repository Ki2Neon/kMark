import { type MarkdownDocumentGateway } from "../../application/editorSession/editorSessionPorts";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import {
  clearPendingTauriMarkdownOpenRequests,
  listenForTauriMarkdownOpenRequests,
  overwriteMarkdownDocument,
  overwriteMarkdownDocumentAtPath,
  pickMarkdownDocument,
  readMarkdownFile,
  saveMarkdownDocumentAs,
  supportsNativeOpenPicker,
  takePendingTauriMarkdownOpenRequests,
  type MarkdownFileHandle,
} from "../../infra/fileTransfer";

type SaveTarget =
  | { readonly kind: "download" }
  | { readonly kind: "browser-file-handle"; readonly fileHandle: MarkdownFileHandle }
  | { readonly kind: "external-path"; readonly filePath: string };

function toLoadedMarkdownDocument(fileName: string, content: string, filePath: string | null) {
  return {
    fileName,
    filePath,
    content,
  };
}

function resolveNextSaveTarget(fileHandle: MarkdownFileHandle | null): SaveTarget {
  return fileHandle === null
    ? { kind: "download" }
    : { kind: "browser-file-handle", fileHandle };
}

export function createBrowserMarkdownDocumentGateway(): MarkdownDocumentGateway {
  let saveTarget: SaveTarget = { kind: "download" };

  return {
    supportsNativeOpenPicker,

    async openDocumentFromPicker() {
      const result = await pickMarkdownDocument();

      if (result === null) {
        return null;
      }

      saveTarget = resolveNextSaveTarget(result.fileHandle);

      return toLoadedMarkdownDocument(result.fileName, result.content, null);
    },

    async openDocumentFromFile(file) {
      const result = await readMarkdownFile(file);
      saveTarget = { kind: "download" };

      return toLoadedMarkdownDocument(result.fileName, result.content, null);
    },

    loadExternalDocument(document: ExternalMarkdownDocument) {
      saveTarget = {
        kind: "external-path",
        filePath: document.filePath,
      };

      return toLoadedMarkdownDocument(document.fileName, document.content, document.filePath);
    },

    async saveDocument(fileName, content) {
      if (saveTarget.kind === "browser-file-handle") {
        await overwriteMarkdownDocument(saveTarget.fileHandle, content);

        return {
          fileName: saveTarget.fileHandle.name,
          filePath: null,
        };
      }

      if (saveTarget.kind === "external-path") {
        await overwriteMarkdownDocumentAtPath(saveTarget.filePath, content);

        return {
          fileName,
          filePath: saveTarget.filePath,
        };
      }

      const result = await saveMarkdownDocumentAs(fileName, content);

      if (result === null) {
        return null;
      }

      saveTarget = resolveNextSaveTarget(result.fileHandle);

      return {
        fileName: result.fileName,
        filePath: null,
      };
    },

    async saveDocumentAs(fileName, content) {
      const result = await saveMarkdownDocumentAs(fileName, content);

      if (result === null) {
        return null;
      }

      saveTarget = resolveNextSaveTarget(result.fileHandle);

      return {
        fileName: result.fileName,
        filePath: null,
      };
    },

    async takePendingExternalDocuments() {
      return takePendingTauriMarkdownOpenRequests();
    },

    async clearPendingExternalDocuments() {
      await clearPendingTauriMarkdownOpenRequests();
    },

    async listenForExternalDocumentRequests(callback) {
      return listenForTauriMarkdownOpenRequests(callback);
    },

    reset() {
      saveTarget = { kind: "download" };
    },
  };
}
