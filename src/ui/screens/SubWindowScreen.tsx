import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSubWindowGateway } from "../../adapters/browser/browserSubWindowGateway";
import { openExternalLink } from "../../adapters/browser/browserExternalLinkOpener";
import { SubWindowController } from "../../application/subWindow/subWindowController";
import { type SubWindowState } from "../../application/subWindow/subWindowPorts";
import { isRuntimeFullscreen, setRuntimeFullscreen } from "../../runtime/runtime";
import { MarkdownPreview, type PreviewNavigationRequest } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { useWindowTitle } from "../hooks/useWindowTitle";

type SubWindowScreenProps = {
  readonly stateKey: string | null;
};

function createSubWindowController(): SubWindowController {
  return new SubWindowController({
    clock: {
      now: () => Date.now(),
    },
    gateway: createBrowserSubWindowGateway(),
  });
}

function isKeyboardEventFromEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;

  return target instanceof HTMLElement
    && target.closest("input, textarea, select, button, [contenteditable='true']") !== null;
}

export function SubWindowScreen({ stateKey }: SubWindowScreenProps) {
  const controllerRef = useRef<SubWindowController | null>(null);
  const navigationRequestIdRef = useRef(0);
  const [stateLoadState, setStateLoadState] = useState<{
    readonly isLoaded: boolean;
    readonly state: SubWindowState | null;
  }>({
    isLoaded: false,
    state: null,
  });
  const [previewNavigationRequest, setPreviewNavigationRequest] = useState<PreviewNavigationRequest | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (controllerRef.current === null) {
    controllerRef.current = createSubWindowController();
  }

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    setStateLoadState({
      isLoaded: false,
      state: null,
    });

    void controllerRef.current?.load(stateKey)
      .then((state) => {
        if (isDisposed) {
          return;
        }

        setStateLoadState({
          isLoaded: true,
          state,
        });
      })
      .catch(() => {
        if (isDisposed) {
          return;
        }

        setStateLoadState({
          isLoaded: true,
          state: null,
        });
      });

    void controllerRef.current?.subscribe(stateKey, (state) => {
      if (isDisposed) {
        return;
      }

      setStateLoadState({
        isLoaded: true,
        state,
      });
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
  }, [stateKey]);

  useEffect(() => {
    const refreshFullscreenState = () => {
      void isRuntimeFullscreen().then(setIsFullscreen).catch(() => {});
    };

    refreshFullscreenState();
    window.addEventListener("fullscreenchange", refreshFullscreenState);

    return () => {
      window.removeEventListener("fullscreenchange", refreshFullscreenState);
    };
  }, []);

  const state = stateLoadState.state;
  const {
    contextMenuRef: previewContextMenuRef,
    contextMenuState: previewContextMenuState,
    contextMenuStyle: previewContextMenuStyle,
    handlePreviewContextMenu,
    handleZoomFullFit: handlePreviewZoomFullFit,
    handleZoomFit: handlePreviewZoomFit,
    handleZoomScaleChange: handlePreviewZoomScaleChange,
    fitMode: previewFitMode,
    zoomScale: previewZoomScale,
  } = usePreviewInteraction({
    contextMenuExtraItemCount: 1 + (state?.displayMode === "a4" ? 1 : 0),
    displayMode: state?.displayMode ?? "standard",
    includeModelCameraMenuItem: false,
    isAvailable: state !== null,
  });
  const title = state === null ? "Subwindow - kMark" : `${state.title} - サブウィンドウ - kMark`;

  useWindowTitle(title);

  const handlePreviewExternalLinkOpen = useCallback((url: string) => {
    void openExternalLink(url);
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    const nextIsFullscreen = !isFullscreen;

    void setRuntimeFullscreen(nextIsFullscreen)
      .then(() => {
        setIsFullscreen(nextIsFullscreen);
      })
      .catch(() => {});
  }, [isFullscreen]);

  const requestPreviewNavigation = useCallback((direction: -1 | 1) => {
    navigationRequestIdRef.current += 1;
    setPreviewNavigationRequest({
      direction,
      requestId: navigationRequestIdRef.current,
    });
  }, []);

  useEffect(() => {
    if (state === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardEventFromEditableTarget(event)) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        requestPreviewNavigation(1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        requestPreviewNavigation(-1);
        return;
      }

      if (event.key.toLocaleLowerCase("en-US") === "f") {
        event.preventDefault();
        handleFullscreenToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleFullscreenToggle, requestPreviewNavigation, state]);

  if (!stateLoadState.isLoaded || state === null) {
    return (
      <main className="subwindow-shell subwindow-shell--empty">
        <p className="subwindow-shell__empty">
          {stateLoadState.isLoaded ? "サブウィンドウデータなし" : "読込中"}
        </p>
      </main>
    );
  }

  return (
    <main className="subwindow-shell">
      <MarkdownPreview
        activeSourceLine={state.activeSourceLine}
        displayMode={state.displayMode}
        enableInteractiveViewportNavigation
        html={state.html}
        maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
        minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
        onOpenExternalLink={handlePreviewExternalLinkOpen}
        onPreviewContextMenu={handlePreviewContextMenu}
        onZoomScaleChange={handlePreviewZoomScaleChange}
        defaultPageStyle={state.defaultPageStyle}
        defaultTextStyle={state.defaultTextStyle}
        followActiveSourceLine={false}
        pageHtmls={state.pageHtmls}
        pages={state.pages}
        previewFitMode={previewFitMode}
        previewNavigationRequest={previewNavigationRequest}
        zoomScale={previewZoomScale}
      />

      {previewContextMenuState !== null ? (
        <PreviewContextMenu
          ariaLabel="サブウィンドウプレビューのコンテキストメニュー"
          fullscreenLabel={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          hasModelCameraTarget={false}
          menuRef={previewContextMenuRef}
          onFit={handlePreviewZoomFit}
          onFullFit={state.displayMode === "a4" ? handlePreviewZoomFullFit : undefined}
          onFullscreenToggle={handleFullscreenToggle}
          style={previewContextMenuStyle}
        />
      ) : null}
    </main>
  );
}
