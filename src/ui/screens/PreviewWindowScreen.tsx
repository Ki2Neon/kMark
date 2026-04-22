import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILE_NAME, DEFAULT_MARKDOWN } from "../../domain/editor";
import { LOCAL_DRAFT_STORAGE_KEY, loadLocalDraft } from "../../infra/localDraft";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";
import {
  PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY,
  loadPreviewWindowActiveSourceLine,
  requestPreviewWindowDraftJump,
} from "../../infra/previewWindowSync";
import { syncWindowTitle } from "../../infra/windowTitle";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
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
  const [activeSourceLine, setActiveSourceLine] = useState<number | null>(() => loadPreviewWindowActiveSourceLine());
  const {
    contextMenuRef,
    contextMenuState,
    contextMenuStyle,
    handlePreviewContextMenu,
    handleZoomFit,
    handleZoomScaleChange,
    zoomScale,
  } = usePreviewInteraction({ displayMode: previewDisplayMode });

  const previewHtml = useMemo(() => renderMarkdown(previewSnapshot.content), [previewSnapshot.content]);
  const previewPageHtmls = useMemo(() => renderMarkdownPages(previewSnapshot.content), [previewSnapshot.content]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === LOCAL_DRAFT_STORAGE_KEY) {
        setPreviewSnapshot(loadPreviewSnapshot());
        return;
      }

      if (event.key === PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY) {
        setActiveSourceLine(loadPreviewWindowActiveSourceLine());
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleSourceLineDoubleClick = useCallback((lineNumber: number) => {
    requestPreviewWindowDraftJump(lineNumber);
  }, []);

  useEffect(() => {
    const normalizedFileName = previewSnapshot.fileName.trim().length > 0 ? previewSnapshot.fileName.trim() : DEFAULT_FILE_NAME;

    syncWindowTitle(`${normalizedFileName} - Preview - kMark`);
  }, [previewSnapshot.fileName]);

  return (
    <main className="editor-shell preview-window">
      <MarkdownPreview
        activeSourceLine={activeSourceLine}
        displayMode={previewDisplayMode}
        enableInteractiveViewportNavigation
        html={previewHtml}
        maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
        minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
        onPreviewContextMenu={handlePreviewContextMenu}
        onSourceLineDoubleClick={handleSourceLineDoubleClick}
        onZoomScaleChange={handleZoomScaleChange}
        pageHtmls={previewPageHtmls}
        zoomScale={zoomScale}
      />

      {contextMenuState !== null ? (
        <PreviewContextMenu
          ariaLabel="別ウィンドウプレビューのコンテキストメニュー"
          menuRef={contextMenuRef}
          onFit={handleZoomFit}
          style={contextMenuStyle}
        />
      ) : null}
    </main>
  );
}