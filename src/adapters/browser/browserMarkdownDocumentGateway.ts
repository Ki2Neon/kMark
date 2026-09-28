import {
  type MarkdownDocumentGateway,
  type MarkdownDocumentSaveSource,
} from "../../application/editorSession/editorSessionPorts";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import {
  clearPendingTauriMarkdownOpenRequests,
  listenForTauriMarkdownOpenRequests,
  openMarkdownDocumentFolder,
  overwriteEditorSessionMarkdownDocumentAtPath,
  overwriteMarkdownDocument,
  overwriteMarkdownDocumentAtPath,
  pickMarkdownDocument,
  readMarkdownDocumentAtPath,
  readMarkdownFile,
  saveEditorSessionMarkdownDocumentAs,
  saveMarkdownDocumentAs,
  supportsNativeOpenPicker,
  takePendingTauriMarkdownOpenRequests,
  type MarkdownFileHandle,
} from "../../infra/fileTransfer";
import { isTauri } from "../../runtime/runtime";

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

function readPersistedContent(source: MarkdownDocumentSaveSource): string {
  const canonical = source.readCanonicalContent();
  return source.lineEnding === "crlf" ? canonical.replace(/\n/gu, "\r\n") : canonical;
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

    async openDocumentFromPath(filePath) {
      const result = await readMarkdownDocumentAtPath(filePath);
      saveTarget = {
        kind: "external-path",
        filePath: result.filePath,
      };

      return toLoadedMarkdownDocument(result.fileName, result.content, result.filePath);
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

    async saveDocument(fileName, source) {
      if (saveTarget.kind === "browser-file-handle") {
        await overwriteMarkdownDocument(saveTarget.fileHandle, readPersistedContent(source));

        return {
          fileName: saveTarget.fileHandle.name,
          filePath: null,
          sessionRevision: null,
        };
      }

      if (saveTarget.kind === "external-path") {
        if (isTauri()) {
          const result = await overwriteEditorSessionMarkdownDocumentAtPath(
            saveTarget.filePath,
            source.sessionId,
            source.revision,
          );
          return {
            fileName: result.fileName,
            filePath: result.filePath,
            sessionRevision: source.revision,
          };
        }

        await overwriteMarkdownDocumentAtPath(saveTarget.filePath, readPersistedContent(source));

        return {
          fileName,
          filePath: saveTarget.filePath,
          sessionRevision: null,
        };
      }

      if (isTauri()) {
        const result = await saveEditorSessionMarkdownDocumentAs(
          fileName,
          source.sessionId,
          source.revision,
        );
        if (result === null) {
          return null;
        }
        saveTarget = resolveSaveTargetFromLoadedDocument({
          fileHandle: null,
          filePath: result.filePath,
        });
        return {
          fileName: result.fileName,
          filePath: result.filePath,
          sessionRevision: source.revision,
        };
      }

      const result = await saveMarkdownDocumentAs(fileName, readPersistedContent(source));

      if (result === null) {
        return null;
      }

      saveTarget = resolveSaveTargetFromLoadedDocument(result);

      return {
        fileName: result.fileName,
        filePath: result.filePath,
        sessionRevision: null,
      };
    },

    async saveDocumentAs(fileName, source) {
      if (isTauri()) {
        const result = await saveEditorSessionMarkdownDocumentAs(
          fileName,
          source.sessionId,
          source.revision,
        );
        if (result === null) {
          return null;
        }
        saveTarget = resolveSaveTargetFromLoadedDocument({
          fileHandle: null,
          filePath: result.filePath,
        });
        return {
          fileName: result.fileName,
          filePath: result.filePath,
          sessionRevision: source.revision,
        };
      }

      const result = await saveMarkdownDocumentAs(fileName, readPersistedContent(source));

      if (result === null) {
        return null;
      }

      saveTarget = resolveSaveTargetFromLoadedDocument(result);

      return {
        fileName: result.fileName,
        filePath: result.filePath,
        sessionRevision: null,
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
