import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from "react";
import { createInitialEditorState } from "../../domain/editor";
import {
  overwriteMarkdownDocument,
  pickMarkdownDocument,
  readMarkdownFile,
  saveMarkdownDocumentAs,
  supportsNativeOpenPicker,
  type MarkdownFileHandle,
} from "../../infra/fileTransfer";
import { loadLocalDraft, persistLocalDraft } from "../../infra/localDraft";
import { renderMarkdown } from "../../infra/markdown";
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

      const result = await saveMarkdownDocumentAs(state.fileName, state.content);

      if (result === null) {
        return;
      }

      currentFileHandleRef.current = result.fileHandle;
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
      dispatch({
        type: "editor/saveSucceeded",
        fileName: result.fileName,
        savedAt: Date.now(),
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handlePrintDocument = useCallback(async () => {
    try {
      await printMarkdownDocument({
        title: state.fileName,
        html: renderMarkdown(state.content),
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handleResetDocument = useCallback(() => {
    currentFileHandleRef.current = null;
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
    confirmDiscard,
    handleContentChange,
    handleErrorClear,
    handleErrorRaise,
    handleOpenDocumentFromPicker,
    handlePickedFile,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
  };
}