import { useCallback, useDeferredValue, useEffect, useMemo, useReducer } from "react";
import { createInitialEditorState, deriveEditorStats } from "../../domain/editor";
import { downloadMarkdownDocument, readMarkdownFile } from "../../infra/fileTransfer";
import { loadLocalDraft, persistLocalDraft } from "../../infra/localDraft";
import { renderMarkdown } from "../../infra/markdown";
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

  const stats = useMemo(() => deriveEditorStats(state.content), [state.content]);
  const previewHtml = useMemo(() => renderMarkdown(deferredContent), [deferredContent]);
  const statusLabel = useMemo(() => {
    if (state.isDirty) {
      return "未保存の変更があります";
    }

    if (state.lastSavedAt !== null) {
      const formatted = new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(state.lastSavedAt);

      return `${formatted} に書き出し済み`;
    }

    return "ローカル下書きを自動で保持しています";
  }, [state.isDirty, state.lastSavedAt]);

  const handleContentChange = useCallback((content: string) => {
    dispatch({ type: "editor/contentChanged", content });
  }, []);

  const handleFileNameChange = useCallback((fileName: string) => {
    dispatch({ type: "editor/fileNameChanged", fileName });
  }, []);

  const handlePickedFile = useCallback(async (file: File | null) => {
    if (file === null) {
      return;
    }

    try {
      const result = await readMarkdownFile(file);

      dispatch({
        type: "editor/documentLoaded",
        fileName: result.fileName,
        content: result.content,
        loadedAt: Date.now(),
      });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, []);

  const handleSaveDocument = useCallback(async () => {
    try {
      downloadMarkdownDocument(state.fileName, state.content);
      dispatch({ type: "editor/saveSucceeded", savedAt: Date.now() });
    } catch (error) {
      dispatch({ type: "editor/errorRaised", message: toErrorMessage(error) });
    }
  }, [state.content, state.fileName]);

  const handleResetDocument = useCallback(() => {
    dispatch({ type: "editor/documentReset" });
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
    content: state.content,
    errorMessage: state.errorMessage,
    fileName: state.fileName,
    isDirty: state.isDirty,
    previewHtml,
    stats,
    statusLabel,
    confirmDiscard,
    handleContentChange,
    handleErrorClear,
    handleFileNameChange,
    handlePickedFile,
    handleResetDocument,
    handleSaveDocument,
  };
}