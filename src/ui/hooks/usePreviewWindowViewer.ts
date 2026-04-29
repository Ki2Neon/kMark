import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createBrowserPreviewWindowViewerRenderer } from "../../adapters/browser/browserPreviewWindowViewerRenderer";
import { createBrowserPreviewWindowViewerGateway } from "../../adapters/browser/browserPreviewWindowViewerGateway";
import { PreviewWindowViewerController } from "../../application/previewWindowViewer/previewWindowViewerController";
import { type PreviewWindowViewerRenderedPreview } from "../../application/previewWindowViewer/previewWindowViewerPorts";
import {
  type PreviewWindowViewerSnapshot,
  type PreviewWindowViewerState,
} from "../../application/previewWindowViewer/previewWindowViewerPorts";

type UsePreviewWindowViewerOptions = {
  readonly fallbackSnapshot: PreviewWindowViewerSnapshot;
};

export function usePreviewWindowViewer({ fallbackSnapshot }: UsePreviewWindowViewerOptions) {
  const renderRequestIdRef = useRef(0);
  const controllerRef = useRef<PreviewWindowViewerController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewWindowViewerController({
      gateway: createBrowserPreviewWindowViewerGateway(),
      renderer: createBrowserPreviewWindowViewerRenderer(),
    });
  }

  const controller = controllerRef.current;
  const [viewerState, setViewerState] = useState<PreviewWindowViewerState>(() => controller.createFallbackState(fallbackSnapshot));
  const [renderedPreview, setRenderedPreview] = useState<PreviewWindowViewerRenderedPreview>({
    html: "",
    pageHtmls: [],
  });

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void controller.loadState(fallbackSnapshot).then((nextViewerState) => {
      if (isDisposed) {
        return;
      }

      setViewerState(nextViewerState);
    }).catch(() => {});

    void controller.subscribeToStateUpdates((nextViewerState) => {
      if (isDisposed) {
        return;
      }

      setViewerState(nextViewerState);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    }).catch(() => {});

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [controller, fallbackSnapshot]);

  const handleSourceLineDoubleClick = useCallback((lineNumber: number) => {
    void controller.requestEditJump(lineNumber);
  }, [controller]);

  useEffect(() => {
    const requestId = renderRequestIdRef.current + 1;
    renderRequestIdRef.current = requestId;
    let disposed = false;

    void controller.renderSnapshot(viewerState.snapshot)
      .then((nextRenderedPreview) => {
        if (disposed || renderRequestIdRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setRenderedPreview(nextRenderedPreview);
        });
      })
      .catch(() => {
        if (disposed || renderRequestIdRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setRenderedPreview({
            html: "",
            pageHtmls: [],
          });
        });
      });

    return () => {
      disposed = true;
    };
  }, [controller, viewerState.snapshot]);

  return {
    activeSourceLine: viewerState.activeSourceLine,
    onSourceLineDoubleClick: handleSourceLineDoubleClick,
    previewHtml: renderedPreview.html,
    previewPageHtmls: renderedPreview.pageHtmls,
    snapshot: viewerState.snapshot,
  };
}
