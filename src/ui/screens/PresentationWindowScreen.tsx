import { useCallback, useRef, useState } from "react";
import { createBrowserPresentationWindowGateway } from "../../adapters/browser/browserPresentationWindowGateway";
import { openExternalLink } from "../../adapters/browser/browserExternalLinkOpener";
import { PresentationWindowController } from "../../application/presentationWindow/presentationWindowController";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { useWindowTitle } from "../hooks/useWindowTitle";

type PresentationWindowScreenProps = {
  readonly snapshotKey: string;
};

function createPresentationWindowController(): PresentationWindowController {
  return new PresentationWindowController({
    clock: {
      now: () => Date.now(),
    },
    gateway: createBrowserPresentationWindowGateway(),
  });
}

export function PresentationWindowScreen({ snapshotKey }: PresentationWindowScreenProps) {
  const controllerRef = useRef<PresentationWindowController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createPresentationWindowController();
  }

  const [snapshot] = useState(() => controllerRef.current?.load(snapshotKey) ?? null);
  const {
    contextMenuRef: previewContextMenuRef,
    contextMenuState: previewContextMenuState,
    contextMenuStyle: previewContextMenuStyle,
    handleModelCameraReset: handlePreviewModelCameraReset,
    handlePreviewContextMenu,
    handleZoomFit: handlePreviewZoomFit,
    handleZoomScaleChange: handlePreviewZoomScaleChange,
    hasModelCameraTarget: previewContextMenuHasModelCameraTarget,
    zoomScale: previewZoomScale,
  } = usePreviewInteraction({
    displayMode: snapshot?.displayMode ?? "standard",
    isAvailable: snapshot !== null,
  });
  const title = snapshot === null ? "Presentation - kMark" : `${snapshot.title} - プレゼン - kMark`;

  useWindowTitle(title);

  const handlePreviewExternalLinkOpen = useCallback((url: string) => {
    void openExternalLink(url);
  }, []);

  if (snapshot === null) {
    return (
      <main className="presentation-shell presentation-shell--empty">
        <p className="presentation-shell__empty">プレゼンデータなし</p>
      </main>
    );
  }

  return (
    <main className="presentation-shell">
      <MarkdownPreview
        displayMode={snapshot.displayMode}
        enableInteractiveViewportNavigation
        html={snapshot.html}
        maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
        minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
        onOpenExternalLink={handlePreviewExternalLinkOpen}
        onPreviewContextMenu={handlePreviewContextMenu}
        onZoomScaleChange={handlePreviewZoomScaleChange}
        defaultPageStyle={snapshot.defaultPageStyle}
        defaultTextStyle={snapshot.defaultTextStyle}
        pageHtmls={snapshot.pageHtmls}
        pages={snapshot.pages}
        zoomScale={previewZoomScale}
      />

      {previewContextMenuState !== null ? (
        <PreviewContextMenu
          ariaLabel="プレゼンプレビューのコンテキストメニュー"
          hasModelCameraTarget={previewContextMenuHasModelCameraTarget}
          menuRef={previewContextMenuRef}
          onFit={handlePreviewZoomFit}
          onModelCameraReset={handlePreviewModelCameraReset}
          style={previewContextMenuStyle}
        />
      ) : null}
    </main>
  );
}
