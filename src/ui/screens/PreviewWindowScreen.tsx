import { useMemo } from "react";
import { DEFAULT_FILE_NAME, DEFAULT_MARKDOWN } from "../../domain/editor";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";
import { usePreviewWindowViewer } from "../hooks/usePreviewWindowViewer";
import { useWindowTitle } from "../hooks/useWindowTitle";

export function PreviewWindowScreen() {
  const { previewDisplayMode } = usePreviewPreferences();
  const fallbackSnapshot = useMemo(
    () => ({
      content: DEFAULT_MARKDOWN,
      fileName: DEFAULT_FILE_NAME,
    }),
    [],
  );
  const {
    activeSourceLine,
    onSourceLineDoubleClick,
    snapshot: previewSnapshot,
  } = usePreviewWindowViewer({ fallbackSnapshot });
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

  const normalizedFileName = previewSnapshot.fileName.trim().length > 0 ? previewSnapshot.fileName.trim() : DEFAULT_FILE_NAME;
  useWindowTitle(`${normalizedFileName} - Preview - kMark`);

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
        onSourceLineDoubleClick={onSourceLineDoubleClick}
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
