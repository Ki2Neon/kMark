import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createBrowserSubWindowGateway } from "../../adapters/browser/browserSubWindowGateway";
import { isSupportedExternalLink } from "../../adapters/browser/browserExternalLinkOpener";
import {
  beginSubWindowExternalBrowserClose,
  closeSubWindowExternalBrowser,
  openSubWindowExternalBrowser,
  resizeSubWindowExternalBrowser,
  showSubWindowExternalBrowser,
  supportsNativeSubWindowExternalBrowser,
  type SubWindowExternalBrowserBounds,
} from "../../adapters/browser/browserSubWindowExternalBrowser";
import { SubWindowController } from "../../application/subWindow/subWindowController";
import {
  DEFAULT_SUB_WINDOW_BROWSER_FADE_MS,
  type SubWindowResolvedSourceState,
  type SubWindowSelection,
  type SubWindowSourcesSnapshot,
} from "../../application/subWindow/subWindowPorts";
import { closeRuntimeWindow, isRuntimeFullscreen, listenRuntimeEvent, setRuntimeFullscreen } from "../../runtime/runtime";
import { MarkdownPreview, type PreviewNavigationRequest } from "../components/MarkdownPreview";
import { PreviewContextMenu, type PreviewContextMenuSourceOption } from "../components/PreviewContextMenu";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { useWindowTitle } from "../hooks/useWindowTitle";

const AUTO_SOURCE_OPTION_ID = "auto";
const FULLSCREEN_CURSOR_IDLE_HIDE_MS = 1200;
const SUB_WINDOW_BROWSER_IFRAME_SANDBOX = "allow-forms allow-scripts";
const SUB_WINDOW_BROWSER_RESIZE_SYNC_DELAY_MS = 80;
const SUB_WINDOW_BROWSER_HOST_EVENT = "subwindow-browser-host-event";
const SUB_WINDOW_BROWSER_CLOSE_REQUESTED_EVENT = "closeRequested";
const SUB_WINDOW_BROWSER_LOADED_EVENT = "loaded";
const SUB_WINDOW_BROWSER_REVEAL_STARTED_EVENT = "revealStarted";

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
  readonly fadeMs: number;
  readonly onCloseComplete: () => void;
  readonly url: string;
};

type SubWindowBrowserHostEvent = {
  readonly browserId: string;
  readonly event: string;
};

function resolveSubWindowExternalBrowserBounds(element: HTMLElement): SubWindowExternalBrowserBounds | null {
  const rect = element.getBoundingClientRect();

  if (rect.width < 1 || rect.height < 1) {
    return null;
  }

  return {
    height: rect.height,
    width: rect.width,
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
  };
}

function SubWindowBrowserOverlay({ fadeMs, onCloseComplete, url }: SubWindowBrowserOverlayProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const browserIdRef = useRef<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const isCompleteRef = useRef(false);
  const loadedBrowserIdsRef = useRef<Set<string>>(new Set());
  const revealedBrowserIdsRef = useRef<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const usesNativeBrowser = supportsNativeSubWindowExternalBrowser();

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [url]);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  }, []);

  const closeNativeBrowserNow = useCallback((browserId: string) => {
    void closeSubWindowExternalBrowser(browserId).catch(() => {});
  }, []);

  const completeClose = useCallback(() => {
    if (isCompleteRef.current) {
      return;
    }

    isCompleteRef.current = true;
    clearCloseTimeout();

    const browserId = browserIdRef.current;
    browserIdRef.current = null;

    if (browserId !== null) {
      closeNativeBrowserNow(browserId);
    }

    onCloseComplete();
  }, [clearCloseTimeout, closeNativeBrowserNow, onCloseComplete]);

  const revealLoadedBrowser = useCallback((browserId: string) => {
    if (isClosingRef.current || isCompleteRef.current) {
      return;
    }

    if (revealedBrowserIdsRef.current.has(browserId)) {
      return;
    }
    revealedBrowserIdsRef.current.add(browserId);

    void showSubWindowExternalBrowser(browserId)
      .catch(() => {
        if (!isClosingRef.current && !isCompleteRef.current && browserId === browserIdRef.current) {
          completeClose();
        }
      });
  }, [completeClose]);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    setIsClosing(true);

    const browserId = browserIdRef.current;

    if (browserId !== null) {
      void beginSubWindowExternalBrowserClose(browserId).catch(() => {});
    }

    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(completeClose, Math.max(0, fadeMs));
  }, [clearCloseTimeout, completeClose, fadeMs]);

  useEffect(() => {
    if (!usesNativeBrowser) {
      return;
    }

    let isDisposed = false;
    const syncBrowserBounds = () => {
      const dialog = dialogRef.current;
      const browserId = browserIdRef.current;

      if (dialog === null || browserId === null) {
        return;
      }

      const bounds = resolveSubWindowExternalBrowserBounds(dialog);

      if (bounds === null) {
        return;
      }

      void resizeSubWindowExternalBrowser(browserId, bounds).catch(() => {});
    };
    const cancelPendingResize = () => {
      if (resizeTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = null;
    };
    const scheduleBrowserBoundsSync = () => {
      cancelPendingResize();
      resizeTimeoutRef.current = window.setTimeout(() => {
        resizeTimeoutRef.current = null;
        syncBrowserBounds();
      }, SUB_WINDOW_BROWSER_RESIZE_SYNC_DELAY_MS);
    };

    void openSubWindowExternalBrowser(url, fadeMs)
      .then((browserId) => {
        if (isDisposed || isCompleteRef.current) {
          void closeSubWindowExternalBrowser(browserId).catch(() => {});
          return;
        }

        browserIdRef.current = browserId;
        scheduleBrowserBoundsSync();

        if (loadedBrowserIdsRef.current.delete(browserId)) {
          revealLoadedBrowser(browserId);
        }

        if (isClosingRef.current) {
          void beginSubWindowExternalBrowserClose(browserId).catch(() => {});
        }
      })
      .catch(() => {
        if (!isDisposed && !isCompleteRef.current) {
          completeClose();
        }
      });

    const resizeObserver = new ResizeObserver(scheduleBrowserBoundsSync);

    if (dialogRef.current !== null) {
      resizeObserver.observe(dialogRef.current);
    }
    window.addEventListener("resize", scheduleBrowserBoundsSync);

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleBrowserBoundsSync);
      cancelPendingResize();

      const browserId = browserIdRef.current;
      browserIdRef.current = null;

      if (browserId !== null) {
        void closeSubWindowExternalBrowser(browserId).catch(() => {});
      }
    };
  }, [completeClose, fadeMs, revealLoadedBrowser, url, usesNativeBrowser]);

  useEffect(() => {
    if (!usesNativeBrowser) {
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenRuntimeEvent<SubWindowBrowserHostEvent>(SUB_WINDOW_BROWSER_HOST_EVENT, (event) => {
      if (isDisposed) {
        return;
      }

      if (event.event === SUB_WINDOW_BROWSER_LOADED_EVENT) {
        if (event.browserId === browserIdRef.current) {
          revealLoadedBrowser(event.browserId);
          return;
        }

        loadedBrowserIdsRef.current.add(event.browserId);
        return;
      }

      if (event.event === SUB_WINDOW_BROWSER_REVEAL_STARTED_EVENT) {
        if (event.browserId === browserIdRef.current) {
          setIsLoaded(true);
        }
        return;
      }

      if (
        event.event === SUB_WINDOW_BROWSER_CLOSE_REQUESTED_EVENT
        && event.browserId === browserIdRef.current
      ) {
        requestClose();
      }
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
  }, [requestClose, revealLoadedBrowser, usesNativeBrowser]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestClose();
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [requestClose]);

  useEffect(() => () => {
    clearCloseTimeout();
  }, [clearCloseTimeout]);

  const handleOverlayMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    requestClose();
  }, [requestClose]);

  return (
    <div
      className="subwindow-browser-overlay"
      data-closing={isClosing ? "true" : "false"}
      data-loaded={isLoaded ? "true" : "false"}
      onMouseDown={handleOverlayMouseDown}
      style={{ "--subwindow-browser-fade-ms": `${Math.max(0, fadeMs)}ms` } as CSSProperties}
    >
      <div
        ref={dialogRef}
        aria-label="外部リンク"
        aria-modal="true"
        className="subwindow-browser-dialog"
        data-native-browser={usesNativeBrowser ? "true" : "false"}
        role="dialog"
        tabIndex={-1}
      >
        {usesNativeBrowser ? null : (
          <iframe
            allow="fullscreen"
            allowFullScreen
            className="subwindow-browser-frame"
            referrerPolicy="no-referrer"
            sandbox={SUB_WINDOW_BROWSER_IFRAME_SANDBOX}
            src={url}
            title="外部リンク"
            onLoad={() => setIsLoaded(true)}
          />
        )}
      </div>
      <div className="subwindow-browser-loading-layer" aria-hidden="true" />
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

  const handleBrowserCloseComplete = useCallback(() => {
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
    <SubWindowBrowserOverlay
      key={browserUrl}
      fadeMs={state?.browserFadeMs ?? DEFAULT_SUB_WINDOW_BROWSER_FADE_MS}
      url={browserUrl}
      onCloseComplete={handleBrowserCloseComplete}
    />
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
