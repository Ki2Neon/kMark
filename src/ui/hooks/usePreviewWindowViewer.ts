import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserPreviewWindowViewerRenderer } from "../../adapters/browser/browserPreviewWindowViewerRenderer";
import { createBrowserPreviewWindowViewerGateway } from "../../adapters/browser/browserPreviewWindowViewerGateway";
import { PreviewWindowViewerController } from "../../application/previewWindowViewer/previewWindowViewerController";
import { type PreviewWindowViewerSnapshot } from "../../application/previewWindowViewer/previewWindowViewerPorts";

type UsePreviewWindowViewerOptions = {
  readonly fallbackSnapshot: PreviewWindowViewerSnapshot;
};

export function usePreviewWindowViewer({ fallbackSnapshot }: UsePreviewWindowViewerOptions) {
  const controllerRef = useRef<PreviewWindowViewerController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewWindowViewerController({
      gateway: createBrowserPreviewWindowViewerGateway(),
      renderer: createBrowserPreviewWindowViewerRenderer(),
    });
  }

  const controller = controllerRef.current;
  const [viewerState] = useState(() => controller.createState(fallbackSnapshot));
  const [snapshot, setSnapshot] = useState(viewerState.snapshot);
  const [activeSourceLine, setActiveSourceLine] = useState(viewerState.activeSourceLine);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (viewerState.snapshotStorageKey !== null && event.key === viewerState.snapshotStorageKey) {
        setSnapshot(controller.loadSnapshot(viewerState.instanceId, fallbackSnapshot));
        return;
      }

      if (viewerState.cursorSyncStorageKey !== null && event.key === viewerState.cursorSyncStorageKey) {
        setActiveSourceLine(controller.loadActiveSourceLine(viewerState.instanceId));
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [controller, fallbackSnapshot, viewerState.cursorSyncStorageKey, viewerState.instanceId, viewerState.snapshotStorageKey]);

  const handleSourceLineDoubleClick = useCallback((lineNumber: number) => {
    controller.requestEditJump(viewerState.instanceId, lineNumber);
  }, [controller, viewerState.instanceId]);
  const renderedPreview = useMemo(() => controller.renderSnapshot(snapshot), [controller, snapshot]);

  return {
    activeSourceLine,
    onSourceLineDoubleClick: handleSourceLineDoubleClick,
    previewHtml: renderedPreview.html,
    previewPageHtmls: renderedPreview.pageHtmls,
    snapshot,
  };
}
