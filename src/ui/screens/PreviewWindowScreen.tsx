import { DEFAULT_FILE_NAME, DEFAULT_MARKDOWN } from "../../domain/editor";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";
import { usePreviewWindowViewer } from "../hooks/usePreviewWindowViewer";
import { useWindowTitle } from "../hooks/useWindowTitle";

const FALLBACK_PREVIEW_SNAPSHOT = {
  content: DEFAULT_MARKDOWN,
  fileName: DEFAULT_FILE_NAME,
};

export function PreviewWindowScreen() {
  const { previewDisplayMode } = usePreviewPreferences();
  const {
    activeSourceLine,
    onSourceLineDoubleClick,
    previewHtml,
    previewPageHtmls,
    snapshot: previewSnapshot,
  } = usePreviewWindowViewer({ fallbackSnapshot: FALLBACK_PREVIEW_SNAPSHOT });
  const {
    contextMenuRef,
    contextMenuState,
    contextMenuStyle,
    handlePreviewContextMenu,
    handleZoomFit,
    handleZoomScaleChange,
    zoomScale,
  } = usePreviewInteraction({ displayMode: previewDisplayMode });

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
