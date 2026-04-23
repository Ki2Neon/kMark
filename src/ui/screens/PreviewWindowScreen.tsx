import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILE_NAME, DEFAULT_MARKDOWN } from "../../domain/editor";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";
import {
  getPreviewWindowCursorSyncStorageKey,
  getPreviewWindowSnapshotStorageKey,
  loadPreviewWindowSnapshot,
  loadPreviewWindowActiveSourceLine,
  requestPreviewWindowEditJump,
} from "../../infra/previewWindowSync";
import { resolvePreviewWindowInstanceId } from "../../infra/previewWindow";
import { syncWindowTitle } from "../../infra/windowTitle";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";

type PreviewSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

function loadPreviewSnapshot(instanceId: string | null): PreviewSnapshot {
  if (instanceId !== null) {
    const snapshot = loadPreviewWindowSnapshot(instanceId);

    if (snapshot !== null) {
      return {
        content: snapshot.content,
        fileName: snapshot.fileName,
      };
    }
  }

  return {
    content: DEFAULT_MARKDOWN,
    fileName: DEFAULT_FILE_NAME,
  };
}

export function PreviewWindowScreen() {
  const previewWindowInstanceId = useMemo(() => resolvePreviewWindowInstanceId(), []);
  const previewWindowSnapshotStorageKey = useMemo(
    () => (previewWindowInstanceId === null ? null : getPreviewWindowSnapshotStorageKey(previewWindowInstanceId)),
    [previewWindowInstanceId],
  );
  const previewWindowCursorSyncStorageKey = useMemo(
    () => (previewWindowInstanceId === null ? null : getPreviewWindowCursorSyncStorageKey(previewWindowInstanceId)),
    [previewWindowInstanceId],
  );
  const { previewDisplayMode } = usePreviewPreferences();
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot>(() => loadPreviewSnapshot(previewWindowInstanceId));
  const [activeSourceLine, setActiveSourceLine] = useState<number | null>(() => (
    previewWindowInstanceId === null ? null : loadPreviewWindowActiveSourceLine(previewWindowInstanceId)
  ));
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

      if (previewWindowSnapshotStorageKey !== null && event.key === previewWindowSnapshotStorageKey) {
        setPreviewSnapshot(loadPreviewSnapshot(previewWindowInstanceId));
        return;
      }

      if (previewWindowCursorSyncStorageKey !== null && event.key === previewWindowCursorSyncStorageKey) {
        setActiveSourceLine(
          previewWindowInstanceId === null ? null : loadPreviewWindowActiveSourceLine(previewWindowInstanceId),
        );
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [previewWindowCursorSyncStorageKey, previewWindowInstanceId, previewWindowSnapshotStorageKey]);

  const handleSourceLineDoubleClick = useCallback((lineNumber: number) => {
    if (previewWindowInstanceId === null) {
      return;
    }

    requestPreviewWindowEditJump(previewWindowInstanceId, lineNumber);
  }, [previewWindowInstanceId]);

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