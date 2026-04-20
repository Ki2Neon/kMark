import { useCallback, useEffect, useEffectEvent, useRef, type ChangeEvent } from "react";
import { EditorToolbar } from "../components/EditorToolbar";
import { MarkdownInput } from "../components/MarkdownInput";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { useMarkdownEditor } from "../hooks/useMarkdownEditor";

const ACCEPTED_MARKDOWN_FILES = ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain";

export function MarkdownEditorScreen() {
  const editor = useMarkdownEditor();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRequestOpen = useCallback(() => {
    if (!editor.confirmDiscard()) {
      return;
    }

    fileInputRef.current?.click();
  }, [editor]);

  const handleRequestSave = useCallback(() => {
    void editor.handleSaveDocument();
  }, [editor]);

  const handleRequestNew = useCallback(() => {
    if (!editor.confirmDiscard()) {
      return;
    }

    editor.handleResetDocument();
  }, [editor]);

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;

      void editor.handlePickedFile(file);
      event.currentTarget.value = "";
    },
    [editor],
  );

  const saveDocumentEvent = useEffectEvent(() => {
    void editor.handleSaveDocument();
  });

  const openDocumentEvent = useEffectEvent(() => {
    if (!editor.confirmDiscard()) {
      return;
    }

    fileInputRef.current?.click();
  });

  const newDocumentEvent = useEffectEvent(() => {
    if (!editor.confirmDiscard()) {
      return;
    }

    editor.handleResetDocument();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        saveDocumentEvent();
        return;
      }

      if (key === "o") {
        event.preventDefault();
        openDocumentEvent();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        newDocumentEvent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [newDocumentEvent, openDocumentEvent, saveDocumentEvent]);

  return (
    <main className="editor-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MARKDOWN_FILES}
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileSelection}
      />

      <EditorToolbar
        fileName={editor.fileName}
        isDirty={editor.isDirty}
        mode={editor.mode}
        statusLabel={editor.statusLabel}
        onFileNameChange={editor.handleFileNameChange}
        onModeChange={editor.handleModeChange}
        onNewDocument={handleRequestNew}
        onOpenDocument={handleRequestOpen}
        onSaveDocument={handleRequestSave}
      />

      {editor.errorMessage !== null ? (
        <section className="editor-shell__banner" role="alert">
          <span>{editor.errorMessage}</span>
          <button type="button" onClick={editor.handleErrorClear}>
            閉じる
          </button>
        </section>
      ) : null}

      <section className={`editor-shell__workspace editor-shell__workspace--${editor.mode}`}>
        {editor.mode !== "preview" ? (
          <MarkdownInput
            content={editor.content}
            stats={editor.stats}
            onContentChange={editor.handleContentChange}
          />
        ) : null}

        {editor.mode !== "write" ? <MarkdownPreview html={editor.previewHtml} /> : null}
      </section>
    </main>
  );
}