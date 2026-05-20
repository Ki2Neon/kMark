import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createBrowserSubWindowGateway } from "../../adapters/browser/browserSubWindowGateway";
import { isSupportedExternalLink } from "../../adapters/browser/browserExternalLinkOpener";
import {
  closeSubWindowExternalBrowser,
  openSubWindowExternalBrowser,
  supportsNativeSubWindowExternalBrowser,
} from "../../adapters/browser/browserSubWindowExternalBrowser";
import { SubWindowController } from "../../application/subWindow/subWindowController";
import {
  type SubWindowResolvedSourceState,
  type SubWindowSelection,
  type SubWindowSourcesSnapshot,
} from "../../application/subWindow/subWindowPorts";
import { closeRuntimeWindow, isRuntimeFullscreen, setRuntimeFullscreen } from "../../runtime/runtime";
import { MarkdownPreview, type PreviewNavigationRequest } from "../components/MarkdownPreview";
import { PreviewContextMenu, type PreviewContextMenuSourceOption } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { useWindowTitle } from "../hooks/useWindowTitle";

const AUTO_SOURCE_OPTION_ID = "auto";
const FULLSCREEN_CURSOR_IDLE_HIDE_MS = 1200;
const SUB_WINDOW_BROWSER_IFRAME_SANDBOX = "allow-forms allow-scripts";

type SubWindowScreenProps = {
  readonly stateKey: string | null;
};

type SubWindowSourceLoadState = SubWindowResolvedSourceState & {
  readonly isLoaded: boolean;
};

const EMPTY_SOURCE_SNAPSHOT: SubWindowSourcesSnapshot = {
  activeSourceId: null,
  sources: [],
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

function isFixedSourceMissing(selection: SubWindowSelection, sourcesSnapshot: SubWindowSourcesSnapshot): boolean {
  return selection.mode === "source"
    && !sourcesSnapshot.sources.some((source) => source.id === selection.sourceId);
}

function resolveSourceMenuLabel(
  sourceId: string,
  sourceTitle: string,
  isActive: boolean,
  titleCounts: ReadonlyMap<string, number>,
): string {
  const title = sourceTitle.trim().length > 0 ? sourceTitle.trim() : "untitled.md";
  const disambiguatedTitle = (titleCounts.get(title) ?? 0) > 1
    ? `${title} (${sourceId})`
    : title;

  return isActive ? `${disambiguatedTitle} [Active]` : disambiguatedTitle;
}

type SubWindowBrowserOverlayProps = {
  readonly onClose: () => void;
  readonly url: string;
};

function SubWindowBrowserOverlay({ onClose, url }: SubWindowBrowserOverlayProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const browserIdRef = useRef<string | null>(null);
  const usesNativeBrowser = supportsNativeSubWindowExternalBrowser();

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [url]);

  useEffect(() => {
    if (!usesNativeBrowser) {
      return;
    }

    let isDisposed = false;

    void openSubWindowExternalBrowser(url)
      .then((browserId) => {
        if (isDisposed) {
          void closeSubWindowExternalBrowser(browserId).catch(() => {});
          return;
        }

        browserIdRef.current = browserId;
      })
      .catch(() => {
        if (!isDisposed) {
          onClose();
        }
      });

    return () => {
      isDisposed = true;

      const browserId = browserIdRef.current;
      browserIdRef.current = null;

      if (browserId !== null) {
        void closeSubWindowExternalBrowser(browserId).catch(() => {});
      }
    };
  }, [onClose, url, usesNativeBrowser]);

  return (
    <div className="subwindow-browser-overlay">
      <div
        ref={dialogRef}
        aria-label="外部リンク"
        aria-modal="true"
        className="subwindow-browser-dialog"
        role="dialog"
        tabIndex={-1}
      >
        {usesNativeBrowser ? null : (
          <iframe
            className="subwindow-browser-frame"
            referrerPolicy="no-referrer"
            sandbox={SUB_WINDOW_BROWSER_IFRAME_SANDBOX}
            src={url}
            title="外部リンク"
          />
        )}
      </div>
    </div>
  );
}

export function SubWindowScreen({ stateKey: _stateKey }: SubWindowScreenProps) {
  const controllerRef = useRef<SubWindowController | null>(null);
  const fullscreenCursorHideTimeoutRef = useRef<number | null>(null);
  const navigationRequestIdRef = useRef(0);
  const [selection, setSelection] = useState<SubWindowSelection>({ mode: "auto" });
  const [sourcesSnapshot, setSourcesSnapshot] = useState<SubWindowSourcesSnapshot>(EMPTY_SOURCE_SNAPSHOT);
  const [sourceLoadState, setSourceLoadState] = useState<SubWindowSourceLoadState>({
    isLoaded: false,
    sourceId: null,
    state: null,
  });
  const [previewNavigationRequest, setPreviewNavigationRequest] = useState<PreviewNavigationRequest | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [isFullscreenCursorVisible, setIsFullscreenCursorVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (controllerRef.current === null) {
    controllerRef.current = createSubWindowController();
  }

  const state = sourceLoadState.state;
  const displayedSourceId = sourceLoadState.sourceId;
  const sourceOptions = useMemo<PreviewContextMenuSourceOption[]>(() => {
    const titleCounts = new Map<string, number>();

    for (const source of sourcesSnapshot.sources) {
      const title = source.title.trim().length > 0 ? source.title.trim() : "untitled.md";
      titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    }

    return [
      {
        id: AUTO_SOURCE_OPTION_ID,
        isSelected: selection.mode === "auto",
        label: "AUTO",
      },
      ...sourcesSnapshot.sources.map((source) => ({
        id: source.id,
        isSelected: selection.mode === "source" && selection.sourceId === source.id,
        label: resolveSourceMenuLabel(source.id, source.title, source.isActive, titleCounts),
      })),
    ];
  }, [selection, sourcesSnapshot]);

  const {
    closeContextMenu,
    contextMenuRef: previewContextMenuRef,
    contextMenuState: previewContextMenuState,
    contextMenuStyle: previewContextMenuStyle,
    handleAllModelCamerasReset,
    handleModelCameraReset,
    handlePreviewContextMenu,
    handleZoomFullFit: handlePreviewZoomFullFit,
    handleZoomFit: handlePreviewZoomFit,
    handleZoomScaleChange: handlePreviewZoomScaleChange,
    hasModelCameraTarget,
    hasModelCameraTargets,
    fitMode: previewFitMode,
    zoomScale: previewZoomScale,
  } = usePreviewInteraction({
    contextMenuExtraItemCount: 1 + (state?.displayMode === "a4" ? 1 : 0) + sourceOptions.length,
    displayMode: state?.displayMode ?? "standard",
    initialFitMode: "page",
    isAvailable: true,
  });
  const title = state === null ? "Subwindow - kMark" : `${state.title} - サブウィンドウ - kMark`;
  const isFullscreenCursorHidden = isFullscreen
    && !isFullscreenCursorVisible
    && previewContextMenuState === null
    && browserUrl === null;

  useWindowTitle(title);

  const refreshSourceState = useCallback(() => {
    void controllerRef.current?.getSourceState(selection)
      .then((resolvedState) => {
        setSourceLoadState({
          isLoaded: true,
          sourceId: resolvedState.sourceId,
          state: resolvedState.state,
        });
      })
      .catch(() => {
        setSourceLoadState({
          isLoaded: true,
          sourceId: null,
          state: null,
        });
      });
  }, [selection]);

  useEffect(() => {
    setSourceLoadState({
      isLoaded: false,
      sourceId: null,
      state: null,
    });
    refreshSourceState();
  }, [refreshSourceState]);

  useEffect(() => {
    let isDisposed = false;
    let unlistenSources: (() => void) | null = null;
    let unlistenState: (() => void) | null = null;

    void controllerRef.current?.getSources()
      .then((snapshot) => {
        if (isDisposed) {
          return;
        }

        setSourcesSnapshot(snapshot);

        if (isFixedSourceMissing(selection, snapshot)) {
          void closeRuntimeWindow().catch(() => {});
        }
      })
      .catch(() => {});

    void controllerRef.current?.listenSourcesChanged((snapshot) => {
      if (isDisposed) {
        return;
      }

      setSourcesSnapshot(snapshot);

      if (isFixedSourceMissing(selection, snapshot)) {
        void closeRuntimeWindow().catch(() => {});
        return;
      }

      refreshSourceState();
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlistenSources = nextUnlisten;
    }).catch(() => {});

    void controllerRef.current?.listenSourceStateChanged((change) => {
      if (isDisposed) {
        return;
      }

      const selectedSourceId = selection.mode === "source"
        ? selection.sourceId
        : sourcesSnapshot.activeSourceId;

      if (change.sourceId === selectedSourceId) {
        setSourceLoadState({
          isLoaded: true,
          sourceId: change.sourceId,
          state: change.state,
        });
        return;
      }

      if (selection.mode === "auto") {
        refreshSourceState();
      }
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlistenState = nextUnlisten;
    }).catch(() => {});

    return () => {
      isDisposed = true;
      unlistenSources?.();
      unlistenState?.();
    };
  }, [refreshSourceState, selection, sourcesSnapshot.activeSourceId]);

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

  useEffect(() => {
    const clearCursorHideTimeout = () => {
      if (fullscreenCursorHideTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(fullscreenCursorHideTimeoutRef.current);
      fullscreenCursorHideTimeoutRef.current = null;
    };

    if (!isFullscreen || previewContextMenuState !== null || browserUrl !== null) {
      clearCursorHideTimeout();
      setIsFullscreenCursorVisible(true);
      return clearCursorHideTimeout;
    }

    const scheduleCursorHide = () => {
      clearCursorHideTimeout();
      fullscreenCursorHideTimeoutRef.current = window.setTimeout(() => {
        setIsFullscreenCursorVisible(false);
        fullscreenCursorHideTimeoutRef.current = null;
      }, FULLSCREEN_CURSOR_IDLE_HIDE_MS);
    };
    const showCursor = () => {
      setIsFullscreenCursorVisible(true);
      scheduleCursorHide();
    };

    showCursor();
    window.addEventListener("mousemove", showCursor);
    window.addEventListener("pointermove", showCursor);
    window.addEventListener("mousedown", showCursor);

    return () => {
      clearCursorHideTimeout();
      window.removeEventListener("mousemove", showCursor);
      window.removeEventListener("pointermove", showCursor);
      window.removeEventListener("mousedown", showCursor);
    };
  }, [browserUrl, isFullscreen, previewContextMenuState]);

  const handlePreviewExternalLinkOpen = useCallback((url: string) => {
    const normalizedUrl = url.trim();

    if (!isSupportedExternalLink(normalizedUrl)) {
      return;
    }

    closeContextMenu();
    setBrowserUrl(normalizedUrl);
  }, [closeContextMenu]);

  const handleBrowserClose = useCallback(() => {
    setBrowserUrl(null);
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

  const handlePreviewSourceLineDoubleClick = useCallback((lineNumber: number) => {
    if (displayedSourceId === null) {
      return;
    }

    void controllerRef.current?.requestSourceLineSelection(displayedSourceId, lineNumber).catch(() => {});
  }, [displayedSourceId]);

  const handleSourceSelect = useCallback((sourceOptionId: string) => {
    setSelection(sourceOptionId === AUTO_SOURCE_OPTION_ID
      ? { mode: "auto" }
      : { mode: "source", sourceId: sourceOptionId });
    closeContextMenu();
  }, [closeContextMenu]);

  const handleShellContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    handlePreviewContextMenu(event.clientX, event.clientY, null);
  }, [handlePreviewContextMenu]);

  useEffect(() => {
    if (state === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (browserUrl !== null) {
        return;
      }

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
  }, [browserUrl, handleFullscreenToggle, requestPreviewNavigation, state]);

  useEffect(() => {
    if (browserUrl === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setBrowserUrl(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [browserUrl]);

  const previewContextMenu = previewContextMenuState === null ? null : (
    <PreviewContextMenu
      ariaLabel="サブウィンドウプレビューのコンテキストメニュー"
      fullscreenLabel={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      hasModelCameraTarget={hasModelCameraTarget}
      hasModelCameraTargets={hasModelCameraTargets}
      menuRef={previewContextMenuRef}
      onAllModelCamerasReset={handleAllModelCamerasReset}
      onFit={handlePreviewZoomFit}
      onFullFit={state?.displayMode === "a4" ? handlePreviewZoomFullFit : undefined}
      onFullscreenToggle={handleFullscreenToggle}
      onModelCameraReset={handleModelCameraReset}
      onSourceSelect={handleSourceSelect}
      sourceOptions={sourceOptions}
      style={previewContextMenuStyle}
    />
  );
  const browserOverlay = browserUrl === null ? null : (
    <SubWindowBrowserOverlay key={browserUrl} url={browserUrl} onClose={handleBrowserClose} />
  );

  if (!sourceLoadState.isLoaded || state === null) {
    return (
      <main
        className="subwindow-shell subwindow-shell--empty"
        data-cursor-hidden={isFullscreenCursorHidden ? "true" : "false"}
        data-fullscreen={isFullscreen ? "true" : "false"}
        onContextMenu={handleShellContextMenu}
      >
        <p className="subwindow-shell__empty">
          {sourceLoadState.isLoaded ? "サブウィンドウデータなし" : "読込中"}
        </p>
        {previewContextMenu}
        {browserOverlay}
      </main>
    );
  }

  return (
    <main
      className="subwindow-shell"
      data-cursor-hidden={isFullscreenCursorHidden ? "true" : "false"}
      data-fullscreen={isFullscreen ? "true" : "false"}
    >
      <MarkdownPreview
        activeSourceLine={state.activeSourceLine}
        activeSourceLineScrollMode="page"
        displayMode={state.displayMode}
        enableInteractiveViewportNavigation
        html={state.html}
        maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
        minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
        onOpenExternalLink={handlePreviewExternalLinkOpen}
        onPreviewContextMenu={handlePreviewContextMenu}
        onSourceLineDoubleClick={handlePreviewSourceLineDoubleClick}
        onZoomScaleChange={handlePreviewZoomScaleChange}
        defaultPageStyle={state.defaultPageStyle}
        defaultTextStyle={state.defaultTextStyle}
        pageHtmls={state.pageHtmls}
        pages={state.pages}
        pageTransitionFadeMs={state.pageTransitionFadeMs}
        previewFitMode={previewFitMode}
        previewNavigationRequest={previewNavigationRequest}
        suppressTextSelectionOnDoubleClick
        zoomScale={previewZoomScale}
      />

      {previewContextMenu}
      {browserOverlay}
    </main>
  );
}
