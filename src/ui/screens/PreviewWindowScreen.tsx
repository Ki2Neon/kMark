import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FILE_NAME, DEFAULT_MARKDOWN } from "../../domain/editor";
import { LOCAL_DRAFT_STORAGE_KEY, loadLocalDraft } from "../../infra/localDraft";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";

type PreviewSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

function loadPreviewSnapshot(): PreviewSnapshot {
  const draft = loadLocalDraft();

  if (draft === null) {
    return {
      content: DEFAULT_MARKDOWN,
      fileName: DEFAULT_FILE_NAME,
    };
  }

  return {
    content: draft.content,
    fileName: draft.fileName,
  };
}

export function PreviewWindowScreen() {
  const { previewDisplayMode } = usePreviewPreferences();
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot>(() => loadPreviewSnapshot());

  const previewHtml = useMemo(() => renderMarkdown(previewSnapshot.content), [previewSnapshot.content]);
  const previewPageHtmls = useMemo(() => renderMarkdownPages(previewSnapshot.content), [previewSnapshot.content]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== LOCAL_DRAFT_STORAGE_KEY) {
        return;
      }

      setPreviewSnapshot(loadPreviewSnapshot());
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const normalizedFileName = previewSnapshot.fileName.trim().length > 0 ? previewSnapshot.fileName.trim() : DEFAULT_FILE_NAME;

    document.title = `${normalizedFileName} - Preview - kMark`;
  }, [previewSnapshot.fileName]);

  return (
    <main className="editor-shell preview-window">
      <MarkdownPreview displayMode={previewDisplayMode} html={previewHtml} pageHtmls={previewPageHtmls} />
    </main>
  );
}