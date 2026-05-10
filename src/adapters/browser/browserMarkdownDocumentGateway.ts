import { type MarkdownDocumentGateway } from "../../application/editorSession/editorSessionPorts";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import {
  clearPendingTauriMarkdownOpenRequests,
  listenForTauriMarkdownOpenRequests,
  openMarkdownDocumentFolder,
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

function resolveSaveTargetFromLoadedDocument(result: {
  readonly fileHandle: MarkdownFileHandle | null;
  readonly filePath: string | null;
}): SaveTarget {
  if (result.filePath !== null) {
    return {
      kind: "external-path",
      filePath: result.filePath,
    };
  }

  return resolveNextSaveTarget(result.fileHandle);
}

function resolveSaveTargetFromFilePath(filePath: string | null): SaveTarget {
  return filePath === null
    ? { kind: "download" }
    : { kind: "external-path", filePath };
}

export function createBrowserMarkdownDocumentGateway(): MarkdownDocumentGateway {
  let saveTarget: SaveTarget = { kind: "download" };

  return {
    supportsNativeOpenPicker,

    restoreDocumentReference(filePath) {
      saveTarget = resolveSaveTargetFromFilePath(filePath);
    },

    async openDocumentFromPicker() {
      const result = await pickMarkdownDocument();

      if (result === null) {
        return null;
      }

      saveTarget = resolveSaveTargetFromLoadedDocument(result);

      return toLoadedMarkdownDocument(result.fileName, result.content, result.filePath);
    },

    async openDocumentFromFile(file) {
      const result = await readMarkdownFile(file);
      saveTarget = { kind: "download" };

      return toLoadedMarkdownDocument(result.fileName, result.content, null);
    },

    async openDocumentFolder(filePath) {
      await openMarkdownDocumentFolder(filePath);
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

      saveTarget = resolveSaveTargetFromLoadedDocument(result);

      return {
        fileName: result.fileName,
        filePath: result.filePath,
      };
    },

    async saveDocumentAs(fileName, content) {
      const result = await saveMarkdownDocumentAs(fileName, content);

      if (result === null) {
        return null;
      }

      saveTarget = resolveSaveTargetFromLoadedDocument(result);

      return {
        fileName: result.fileName,
        filePath: result.filePath,
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
