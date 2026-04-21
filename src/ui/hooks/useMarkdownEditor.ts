import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from "react";
import { createInitialEditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type PreviewDisplayMode, type RenderedA4PreviewPage } from "../../domain/preview";
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
import { loadLocalDraft, persistLocalDraft } from "../../infra/localDraft";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";
import { printMarkdownDocument } from "../../infra/printDocument";
import { editorReducer } from "../../intent/editorIntent";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "処理に失敗しました。もう一度試してください。";
}

export function useMarkdownEditor() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialEditorState);
  const deferredContent = useDeferredValue(state.content);
  const currentFileHandleRef = useRef<MarkdownFileHandle | null>(null);
  const currentExternalFilePathRef = useRef<string | null>(null);

  useEffect(() => {
    const draft = loadLocalDraft();

    if (draft === null) {
      return;
    }

    dispatch({
      type: "editor/documentLoaded",
      fileName: draft.fileName,
      content: draft.content,
      loadedAt: draft.savedAt,
    });
  }, []);

  useEffect(() => {
    persistLocalDraft({
      fileName: state.fileName,
      content: state.content,
      savedAt: state.lastSavedAt,
    });
  }, [state.content, state.fileName, state.lastSavedAt]);

  const previewHtml = useMemo(() => renderMarkdown(deferredContent), [deferredContent]);
  const previewPageHtmls = useMemo(() => renderMarkdownPages(deferredContent), [deferredContent]);

  const handleContentChange = useCallback((content: string) => {
    dispatch({ type: "editor/contentChanged", content });
  }, []);

  const handleOpenDocumentFromPicker = useCallback(async () => {
    try {
      const result = await pickMarkdownDocument();

      if (result === null) {
        return;
      }

      currentFileHandleRef.current = result.fileHandle;
      currentExternalFilePathRef.current = null;
      dispatch({
        type: "editor/documentLoaded",
        fileName: result.fileName,
        content: result.content,
        loadedAt: null,
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, []);

  const handlePickedFile = useCallback(async (file: File | null) => {
    if (file === null) {
      return;
    }

    try {
      const result = await readMarkdownFile(file);
      currentFileHandleRef.current = null;
      currentExternalFilePathRef.current = null;

      dispatch({
        type: "editor/documentLoaded",
        fileName: result.fileName,
        content: result.content,
        loadedAt: null,
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, []);

  const handleOverwriteSaveDocument = useCallback(async () => {
    try {
      const currentFileHandle = currentFileHandleRef.current;

      if (currentFileHandle !== null) {
        await overwriteMarkdownDocument(currentFileHandle, state.content);
        dispatch({
          type: "editor/saveSucceeded",
          fileName: currentFileHandle.name,
          savedAt: Date.now(),
        });
        return;
      }

      const currentExternalFilePath = currentExternalFilePathRef.current;

      if (currentExternalFilePath !== null) {
        await overwriteMarkdownDocumentAtPath(currentExternalFilePath, state.content);
        dispatch({
          type: "editor/saveSucceeded",
          fileName: state.fileName,
          savedAt: Date.now(),
        });
        return;
      }

      const result = await saveMarkdownDocumentAs(state.fileName, state.content);

      if (result === null) {
        return;
      }

      currentFileHandleRef.current = result.fileHandle;
      currentExternalFilePathRef.current = null;
      dispatch({
        type: "editor/saveSucceeded",
        fileName: result.fileName,
        savedAt: Date.now(),
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handleSaveDocumentAs = useCallback(async () => {
    try {
      const result = await saveMarkdownDocumentAs(state.fileName, state.content);

      if (result === null) {
        return;
      }

      currentFileHandleRef.current = result.fileHandle;
      currentExternalFilePathRef.current = null;
      dispatch({
        type: "editor/saveSucceeded",
        fileName: result.fileName,
        savedAt: Date.now(),
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handleLoadExternalDocument = useCallback((document: ExternalMarkdownDocument) => {
    currentFileHandleRef.current = null;
    currentExternalFilePathRef.current = document.filePath;

    dispatch({
      type: "editor/documentLoaded",
      fileName: document.fileName,
      content: document.content,
      loadedAt: null,
    });
  }, []);

  const handleTakePendingExternalDocuments = useCallback(async () => {
    try {
      return await takePendingTauriMarkdownOpenRequests();
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
      return [];
    }
  }, []);

  const handleClearPendingExternalDocuments = useCallback(async () => {
    try {
      await clearPendingTauriMarkdownOpenRequests();
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, []);

  const subscribeToExternalDocumentRequests = useCallback((callback: () => void) => {
    return listenForTauriMarkdownOpenRequests(callback);
  }, []);

  const handlePrintDocument = useCallback(async (
    previewDisplayMode: PreviewDisplayMode,
    renderedA4PreviewPages?: readonly RenderedA4PreviewPage[],
  ) => {
    try {
      await printMarkdownDocument({
        displayMode: previewDisplayMode,
        title: state.fileName,
        html: renderMarkdown(state.content),
        pageHtmls: renderMarkdownPages(state.content),
        renderedA4PreviewPages,
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handleResetDocument = useCallback(() => {
    currentFileHandleRef.current = null;
    currentExternalFilePathRef.current = null;
    dispatch({ type: "editor/documentReset" });
  }, []);

  const handleErrorRaise = useCallback((message: string) => {
    dispatch({ type: "editor/errorRaised", message });
  }, []);

  const handleErrorClear = useCallback(() => {
    dispatch({ type: "editor/errorCleared" });
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!state.isDirty) {
      return true;
    }

    return window.confirm("未保存の変更を破棄しますか？");
  }, [state.isDirty]);

  return {
    canOpenDocumentWithNativePicker: supportsNativeOpenPicker(),
    content: state.content,
    errorMessage: state.errorMessage,
    fileName: state.fileName,
    isDirty: state.isDirty,
    previewHtml,
    previewPageHtmls,
    confirmDiscard,
    handleClearPendingExternalDocuments,
    handleContentChange,
    handleErrorClear,
    handleErrorRaise,
    handleLoadExternalDocument,
    handleOpenDocumentFromPicker,
    handlePickedFile,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
    handleTakePendingExternalDocuments,
    subscribeToExternalDocumentRequests,
  };
}