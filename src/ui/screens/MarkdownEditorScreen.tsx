import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { selectStartupLayoutMode, type LayoutMode } from "../../domain/editor";
import {
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type MultiCursorModifier,
  type StartupEditMode,
  type SystemFontSizePx,
} from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";
import { MenuSection } from "../components/MenuSection";
import { MarkdownInput } from "../components/MarkdownInput";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PreviewContextMenu } from "../components/PreviewContextMenu";
import { UnsavedExitDialog } from "../components/UnsavedExitDialog";
import { useConfirmSaveOnExit } from "../hooks/useConfirmSaveOnExit";
import { useDesktopMenuVisibility } from "../hooks/useDesktopMenuVisibility";
import { useDesktopWorkspaceSplit } from "../hooks/useDesktopWorkspaceSplit";
import { useExternalMarkdownRequests } from "../hooks/useExternalMarkdownRequests";
import { type InitialEditorDocumentMode, useMarkdownEditor } from "../hooks/useMarkdownEditor";
import { useMarkdownEditorShortcuts } from "../hooks/useMarkdownEditorShortcuts";
import { type MobileSectionId, useMobileSectionNavigation } from "../hooks/useMobileSectionNavigation";
import { MAX_PREVIEW_ZOOM_SCALE, MIN_PREVIEW_ZOOM_SCALE, usePreviewInteraction } from "../hooks/usePreviewInteraction";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { openExternalLink } from "../../adapters/browser/browserExternalLinkOpener";
import { createBrowserSubWindowGateway } from "../../adapters/browser/browserSubWindowGateway";
import { SubWindowController } from "../../application/subWindow/subWindowController";
import { type RecentFile } from "../../domain/recentFiles";

const ACCEPTED_MARKDOWN_FILES = ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain";
const DESKTOP_MENU_TRANSITION_MS = 60;
const ERROR_TOAST_DURATION_MS = 2400;
const PREVIEW_CURSOR_FOLLOW_THROTTLE_MS = 80;

function createSubWindowController(): SubWindowController {
  return new SubWindowController({
    clock: {
      now: () => Date.now(),
    },
    gateway: createBrowserSubWindowGateway(),
  });
}

type MarkdownEditorScreenProps = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly canControlWindowsStartupTrayResident: boolean;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly initialDocumentMode: InitialEditorDocumentMode;
  readonly systemFontSizePx: SystemFontSizePx;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly startupEditMode: StartupEditMode;
  readonly windowsStartupTrayResidentEnabled: boolean;
  readonly onAppFontChange: (appFontId: AppFontId) => void;
  readonly onAppThemeChange: (appThemeId: AppThemeId) => void;
  readonly onEditFontChange: (editFontId: EditFontId) => void;
  readonly onEditFontSizeChange: (editFontSizePx: EditFontSizePx) => void;
  readonly onSystemFontSizeChange: (systemFontSizePx: SystemFontSizePx) => void;
  readonly onMultiCursorModifierChange: (multiCursorModifier: MultiCursorModifier) => void;
  readonly onPreviewUsesAppThemeColorsChange: (previewUsesAppThemeColors: boolean) => void;
  readonly onShowLineNumbersChange: (showLineNumbers: boolean) => void;
  readonly onStartupEditModeChange: (startupEditMode: StartupEditMode) => void;
  readonly onWindowsStartupTrayResidentChange: (windowsStartupTrayResidentEnabled: boolean) => void;
  readonly previewUsesAppThemeColors: boolean;
};

function getMobileSectionLabel(section: MobileSectionId): string {
  return section;
}

function detectLayoutMode(): LayoutMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const navigatorWithUAData = navigator as Navigator & {
    readonly userAgentData?: {
      readonly mobile?: boolean;
    };
  };

  return selectStartupLayoutMode({
    isMobileDevice:
      navigatorWithUAData.userAgentData?.mobile === true ||
      /android|iphone|ipad|ipod/iu.test(navigator.userAgent),
  });
}

export function MarkdownEditorScreen({
  appFontId,
  appThemeId,
  canControlWindowsStartupTrayResident,
  editFontId,
  editFontSizePx,
  initialDocumentMode,
  systemFontSizePx,
  multiCursorModifier,
  showLineNumbers,
  startupEditMode,
  windowsStartupTrayResidentEnabled,
  onAppFontChange,
  onAppThemeChange,
  onEditFontChange,
  onEditFontSizeChange,
  onSystemFontSizeChange,
  onMultiCursorModifierChange,
  onPreviewUsesAppThemeColorsChange,
  onShowLineNumbersChange,
  onStartupEditModeChange,
  onWindowsStartupTrayResidentChange,
  previewUsesAppThemeColors,
}: MarkdownEditorScreenProps) {
  const {
    isPreviewVisible,
    previewDisplayMode,
    onPreviewDisplayModeChange,
    onPreviewVisibilityChange: onStoredPreviewVisibilityChange,
  } = usePreviewPreferences({ manageVisibilityByAppInstance: true });
  const {
    canOpenDocumentWithNativePicker,
    content,
    currentDocumentFilePath,
    errorMessage,
    fileName,
    isDirty,
    isReady: isEditorReady,
    previewHtml,
    recentFiles,
    handleClearPendingExternalDocuments,
    previewPageHtmls,
    previewPages,
    defaultPreviewPageStyle,
    defaultPreviewTextStyle,
    confirmDiscard,
    handleContentChange,
    handleLoadExternalDocument,
    handleOpenCurrentDocumentFolder,
    handleOpenDocumentFromPicker,
    handleOpenRecentFile,
    handlePickedFile,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
    handleTakePendingExternalDocuments,
    subscribeToExternalDocumentRequests,
    handleErrorClear,
    handleErrorRaise,
    handleImportDroppedAssets,
  } = useMarkdownEditor(startupEditMode, { initialDocumentMode });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editSelectionRequestIdRef = useRef(0);
  const lastPreviewCursorFollowAtRef = useRef(0);
  const pendingPreviewCursorLineRef = useRef<number | null>(null);
  const previewCursorFollowTimeoutRef = useRef<number | null>(null);
  const subWindowControllerRef = useRef<SubWindowController | null>(null);
  const hasOpenedSubWindowRef = useRef(false);

  if (subWindowControllerRef.current === null) {
    subWindowControllerRef.current = createSubWindowController();
  }

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => detectLayoutMode());
  const [isEditFocused, setIsEditFocused] = useState(false);
  const [activeEditCursorLine, setActiveEditCursorLine] = useState<number | null>(1);
  const [editSelectionRequest, setEditSelectionRequest] = useState<{ readonly lineNumber: number; readonly requestId: number } | null>(null);
  const previewHighlightSourceLine = isEditFocused ? activeEditCursorLine : null;
  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);
  const {
    closeDesktopMenu,
    closeDesktopMenuImmediately,
    handleOverlayClick,
    isDesktopMenuMounted,
    isDesktopMenuVisible,
    toggleDesktopMenu,
  } = useDesktopMenuVisibility({ transitionMs: DESKTOP_MENU_TRANSITION_MS });
  const {
    desktopLayoutStyle,
    desktopSplitRatio,
    desktopWorkspaceRef,
    handleDividerDoubleClick,
    handleDividerKeyDown,
    handleDividerPointerDown,
    handleDividerPointerEnd,
    handleDividerPointerMove,
    isDesktopResizing,
    maximumDesktopSplitRatio,
    minimumDesktopSplitRatio,
  } = useDesktopWorkspaceSplit({ layoutMode });
  const {
    dismissMobileMenu,
    handleMobileTrackPointerDown,
    handleMobileTrackPointerEnd,
    handleMobileTrackPointerMove,
    isMobileDragging,
    mobileNavStyle,
    mobileSection,
    mobileSectionOrder,
    mobileTrackInnerStyle,
    mobileTrackRef,
    prepareForLayoutModeChange,
    requestMobileSection,
    resetMobileDrag,
  } = useMobileSectionNavigation({
    blurActiveElement,
    isEditFocused,
    isPreviewVisible,
    layoutMode,
  });
  const isPreviewInteractionAvailable = isPreviewVisible && (layoutMode === "desktop" || mobileSection === "preview");
  const {
    contextMenuRef: previewContextMenuRef,
    contextMenuState: previewContextMenuState,
    contextMenuStyle: previewContextMenuStyle,
    handleModelCameraReset: handlePreviewModelCameraReset,
    handlePreviewContextMenu,
    handleZoomFullFit: handlePreviewZoomFullFit,
    handleZoomFit: handlePreviewZoomFit,
    handleZoomScaleChange: handlePreviewZoomScaleChange,
    hasModelCameraTarget: previewContextMenuHasModelCameraTarget,
    fitMode: previewFitMode,
    zoomScale: previewZoomScale,
  } = usePreviewInteraction({
    contextMenuExtraItemCount: previewDisplayMode === "a4" ? 1 : 0,
    displayMode: previewDisplayMode,
    isAvailable: isPreviewInteractionAvailable,
  });

  useEffect(() => {
    if (layoutMode !== "mobile") {
      setIsEditFocused(false);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (errorMessage === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      handleErrorClear();
    }, ERROR_TOAST_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [errorMessage, handleErrorClear]);

  const normalizedFileName = fileName.trim().length > 0 ? fileName.trim() : "untitled.md";
  const subWindowStateRequest = useMemo(() => ({
    activeSourceLine: previewHighlightSourceLine,
    defaultPageStyle: defaultPreviewPageStyle,
    defaultTextStyle: defaultPreviewTextStyle,
    displayMode: previewDisplayMode,
    html: previewHtml,
    pageHtmls: previewPageHtmls,
    pages: previewPages,
    title: normalizedFileName,
  }), [
    defaultPreviewPageStyle,
    defaultPreviewTextStyle,
    normalizedFileName,
    previewDisplayMode,
    previewHighlightSourceLine,
    previewHtml,
    previewPageHtmls,
    previewPages,
  ]);
  useWindowTitle(`${isDirty ? "* " : ""}${normalizedFileName} - kMark`);
  const confirmSaveOnExit = useConfirmSaveOnExit({
    enabled: isEditorReady,
    isDirty,
    onDiscardConfirmed: (request) => {
      if (request === "window-close") {
        handleResetDocument();
      }
    },
    onErrorRaise: handleErrorRaise,
    onSaveDocument: handleOverwriteSaveDocument,
  });

  const handleRequestOpen = useCallback(async () => {
    if (!confirmDiscard()) {
      return;
    }

    closeDesktopMenu();

    if (canOpenDocumentWithNativePicker) {
      await handleOpenDocumentFromPicker();
      return;
    }

    fileInputRef.current?.click();
  }, [canOpenDocumentWithNativePicker, closeDesktopMenu, confirmDiscard, handleOpenDocumentFromPicker]);

  const handleRequestOpenCurrentDocumentFolder = useCallback(() => {
    closeDesktopMenu();
    void handleOpenCurrentDocumentFolder();
  }, [closeDesktopMenu, handleOpenCurrentDocumentFolder]);

  const handleRequestOpenRecentFile = useCallback((recentFile: RecentFile) => {
    if (!confirmDiscard()) {
      return;
    }

    closeDesktopMenu();
    void handleOpenRecentFile(recentFile);

    if (layoutMode === "mobile") {
      requestMobileSection("edit");
    }
  }, [closeDesktopMenu, confirmDiscard, handleOpenRecentFile, layoutMode, requestMobileSection]);

  const handleRequestOverwriteSave = useCallback(() => {
    closeDesktopMenu();
    void handleOverwriteSaveDocument();
  }, [closeDesktopMenu, handleOverwriteSaveDocument]);

  const handleRequestSaveAs = useCallback(() => {
    closeDesktopMenu();
    void handleSaveDocumentAs();
  }, [closeDesktopMenu, handleSaveDocumentAs]);

  const handleRequestPrint = useCallback(() => {
    closeDesktopMenu();
    void handlePrintDocument(previewDisplayMode);
  }, [closeDesktopMenu, handlePrintDocument, previewDisplayMode]);

  useEffect(() => {
    if (!isEditorReady || !hasOpenedSubWindowRef.current) {
      return;
    }

    void subWindowControllerRef.current?.publish(subWindowStateRequest).catch(() => {});
  }, [isEditorReady, subWindowStateRequest]);

  const handleRequestOpenSubWindow = useCallback(() => {
    closeDesktopMenu();
    hasOpenedSubWindowRef.current = true;

    void subWindowControllerRef.current?.open(subWindowStateRequest).catch((error) => {
      handleErrorRaise(error instanceof Error ? error.message : "サブウィンドウを開けませんでした。");
    });
  }, [
    closeDesktopMenu,
    handleErrorRaise,
    subWindowStateRequest,
  ]);

  const handleRequestNew = useCallback(() => {
    if (!confirmDiscard()) {
      return;
    }

    closeDesktopMenu();
    handleResetDocument();
  }, [closeDesktopMenu, confirmDiscard, handleResetDocument]);

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;

      void handlePickedFile(file);
      event.currentTarget.value = "";
    },
    [handlePickedFile],
  );

  const handlePreviewVisibilityChange = useCallback((nextIsPreviewVisible: boolean) => {
    onStoredPreviewVisibilityChange(nextIsPreviewVisible);

    if (!nextIsPreviewVisible) {
      resetMobileDrag();
    }
  }, [onStoredPreviewVisibilityChange, resetMobileDrag]);

  const handleLayoutModeChange = useCallback((nextLayoutMode: LayoutMode) => {
    closeDesktopMenuImmediately();
    blurActiveElement();
    setIsEditFocused(false);
    prepareForLayoutModeChange(nextLayoutMode);
    setLayoutMode(nextLayoutMode);
  }, [blurActiveElement, closeDesktopMenuImmediately, prepareForLayoutModeChange]);

  const handleEditFocusChange = useCallback((nextIsFocused: boolean) => {
    setIsEditFocused(nextIsFocused);
  }, []);

  const clearPendingPreviewCursorFollow = useCallback(() => {
    if (previewCursorFollowTimeoutRef.current !== null) {
      window.clearTimeout(previewCursorFollowTimeoutRef.current);
      previewCursorFollowTimeoutRef.current = null;
    }

    pendingPreviewCursorLineRef.current = null;
  }, []);

  const commitPreviewCursorLine = useCallback((nextCursorLine: number) => {
    lastPreviewCursorFollowAtRef.current = window.performance.now();
    pendingPreviewCursorLineRef.current = null;

    startTransition(() => {
      setActiveEditCursorLine((currentCursorLine) => (
        currentCursorLine === nextCursorLine ? currentCursorLine : nextCursorLine
      ));
    });
  }, []);

  const flushPendingPreviewCursorLine = useCallback(() => {
    previewCursorFollowTimeoutRef.current = null;

    if (pendingPreviewCursorLineRef.current === null) {
      return;
    }

    commitPreviewCursorLine(pendingPreviewCursorLineRef.current);
  }, [commitPreviewCursorLine]);

  const handleEditCursorLineChange = useCallback((nextCursorLine: number) => {
    const elapsedMs = window.performance.now() - lastPreviewCursorFollowAtRef.current;

    if (elapsedMs >= PREVIEW_CURSOR_FOLLOW_THROTTLE_MS && previewCursorFollowTimeoutRef.current === null) {
      commitPreviewCursorLine(nextCursorLine);
      return;
    }

    pendingPreviewCursorLineRef.current = nextCursorLine;

    if (previewCursorFollowTimeoutRef.current !== null) {
      return;
    }

    previewCursorFollowTimeoutRef.current = window.setTimeout(
      flushPendingPreviewCursorLine,
      Math.max(0, PREVIEW_CURSOR_FOLLOW_THROTTLE_MS - elapsedMs),
    );
  }, [commitPreviewCursorLine, flushPendingPreviewCursorLine]);

  const handlePreviewSourceLineDoubleClick = useCallback((lineNumber: number) => {
    const nextRequestId = editSelectionRequestIdRef.current + 1;
    editSelectionRequestIdRef.current = nextRequestId;

    clearPendingPreviewCursorFollow();
    setActiveEditCursorLine(lineNumber);
    setEditSelectionRequest({ lineNumber, requestId: nextRequestId });

    if (layoutMode === "mobile") {
      requestMobileSection("edit");
    }
  }, [clearPendingPreviewCursorFollow, layoutMode, requestMobileSection]);

  useEffect(() => {
    if (!isEditorReady) {
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void subWindowControllerRef.current?.subscribeSourceLineSelection((request) => {
      if (isDisposed) {
        return;
      }

      handlePreviewSourceLineDoubleClick(request.lineNumber);
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
  }, [handlePreviewSourceLineDoubleClick, isEditorReady]);

  useEffect(() => (
    () => {
      clearPendingPreviewCursorFollow();
    }
  ), [clearPendingPreviewCursorFollow]);

  const handlePreviewExternalLinkOpen = useCallback((url: string) => {
    void openExternalLink(url).catch((error) => {
      handleErrorRaise(error instanceof Error ? error.message : "外部リンクを開けませんでした。");
    });
  }, [handleErrorRaise]);

  const focusExternalDocument = useCallback(() => {
    if (layoutMode === "desktop") {
      closeDesktopMenu();
      return;
    }

    requestMobileSection("edit");
  }, [closeDesktopMenu, layoutMode, requestMobileSection]);

  useExternalMarkdownRequests({
    clearPendingExternalDocuments: handleClearPendingExternalDocuments,
    confirmDiscard,
    enabled: isEditorReady,
    onBeforeLoadExternalDocument: focusExternalDocument,
    onLoadExternalDocument: handleLoadExternalDocument,
    subscribeToExternalDocumentRequests,
    takePendingExternalDocuments: handleTakePendingExternalDocuments,
  });

  const handleShortcutOpenDocument = useCallback(() => {
    if (!confirmDiscard()) {
      return;
    }

    if (layoutMode === "desktop") {
      closeDesktopMenu();
    }

    if (canOpenDocumentWithNativePicker) {
      void handleOpenDocumentFromPicker();
      return;
    }

    fileInputRef.current?.click();
  }, [canOpenDocumentWithNativePicker, closeDesktopMenu, confirmDiscard, handleOpenDocumentFromPicker, layoutMode]);

  const handleShortcutNewDocument = useCallback(() => {
    if (!confirmDiscard()) {
      return;
    }

    if (layoutMode === "desktop") {
      closeDesktopMenu();
    }

    handleResetDocument();
  }, [closeDesktopMenu, confirmDiscard, handleResetDocument, layoutMode]);

  const handleShortcutMenuToggle = useCallback(() => {
    if (layoutMode === "desktop") {
      toggleDesktopMenu();
      return;
    }

    requestMobileSection("menu");
  }, [layoutMode, requestMobileSection, toggleDesktopMenu]);

  const handleShortcutDismissMenu = useCallback(() => {
    if (layoutMode === "desktop") {
      closeDesktopMenu();
      return;
    }

    dismissMobileMenu();
  }, [closeDesktopMenu, dismissMobileMenu, layoutMode]);

  useMarkdownEditorShortcuts({
    enabled: isEditorReady && !confirmSaveOnExit.isOpen,
    onDismissMenu: handleShortcutDismissMenu,
    onMenuToggle: handleShortcutMenuToggle,
    onNewDocument: handleShortcutNewDocument,
    onOpenDocument: handleShortcutOpenDocument,
    onPrintDocument: () => {
      closeDesktopMenu();
      void handlePrintDocument(previewDisplayMode);
    },
    onSaveDocument: () => {
      void handleOverwriteSaveDocument();
    },
  });

  if (!isEditorReady) {
    return null;
  }

  const menuSectionProps = {
    appFontId,
    appThemeId,
    canControlWindowsStartupTrayResident,
    editFontId,
    editFontSizePx,
    systemFontSizePx,
    isPreviewVisible,
    layoutMode,
    multiCursorModifier,
    onAppFontChange,
    onAppThemeChange,
    onEditFontChange,
    onEditFontSizeChange,
    onSystemFontSizeChange,
    onLayoutModeChange: handleLayoutModeChange,
    onMultiCursorModifierChange,
    onNewDocument: handleRequestNew,
    onOpenCurrentDocumentFolder: handleRequestOpenCurrentDocumentFolder,
    onOpenDocument: handleRequestOpen,
    onOpenSubWindow: handleRequestOpenSubWindow,
    onOpenRecentFile: handleRequestOpenRecentFile,
    onOverwriteSaveDocument: handleRequestOverwriteSave,
    onPreviewDisplayModeChange,
    onPreviewUsesAppThemeColorsChange,
    onPreviewVisibilityChange: handlePreviewVisibilityChange,
    onPrintDocument: handleRequestPrint,
    onSaveDocumentAs: handleRequestSaveAs,
    onShowLineNumbersChange,
    onStartupEditModeChange,
    onWindowsStartupTrayResidentChange,
    previewDisplayMode,
    recentFiles,
    previewUsesAppThemeColors,
    showLineNumbers,
    startupEditMode,
    windowsStartupTrayResidentEnabled,
  };

  return (
    <main
      className={`editor-shell editor-shell--${layoutMode}`}
      data-resizing={isDesktopResizing ? "true" : "false"}
      style={layoutMode === "desktop" && isPreviewVisible ? desktopLayoutStyle : undefined}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MARKDOWN_FILES}
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileSelection}
      />

      {errorMessage !== null ? (
        <aside
          className={`editor-shell__toast editor-shell__toast--${layoutMode}`}
          role="alert"
          onClick={handleErrorClear}
        >
          {errorMessage}
        </aside>
      ) : null}

      {layoutMode === "desktop" ? (
        <>
          <section
            ref={desktopWorkspaceRef}
            className={isPreviewVisible ? "workspace-grid" : "workspace-grid workspace-grid--preview-hidden"}
            aria-label="メインワークスペース"
          >
            <div className="workspace-grid__panel workspace-grid__panel--edit">
              <MarkdownInput
                appThemeId={appThemeId}
                content={content}
                currentDocumentFilePath={currentDocumentFilePath}
                editFontId={editFontId}
                layoutMode={layoutMode}
                multiCursorModifier={multiCursorModifier}
                showLineNumbers={showLineNumbers}
                onAssetDrop={handleImportDroppedAssets}
                onContentChange={handleContentChange}
                onCursorLineChange={handleEditCursorLineChange}
                onFocusChange={handleEditFocusChange}
                requestedLineSelection={editSelectionRequest}
              />
            </div>

            {isPreviewVisible ? (
              <>
                <div
                  className="workspace-grid__divider"
                  role="separator"
                  aria-label="Edit と Preview の幅を調整"
                  aria-orientation="vertical"
                  aria-valuemin={minimumDesktopSplitRatio}
                  aria-valuemax={maximumDesktopSplitRatio}
                  aria-valuenow={Math.round(desktopSplitRatio)}
                  tabIndex={0}
                  onKeyDown={handleDividerKeyDown}
                  onPointerDown={handleDividerPointerDown}
                  onPointerMove={handleDividerPointerMove}
                  onPointerUp={handleDividerPointerEnd}
                  onPointerCancel={handleDividerPointerEnd}
                  onDoubleClick={handleDividerDoubleClick}
                />

                <div className="workspace-grid__panel workspace-grid__panel--preview">
                  <MarkdownPreview
                    activeSourceLine={previewHighlightSourceLine}
                    displayMode={previewDisplayMode}
                    enableInteractiveViewportNavigation
                    html={previewHtml}
                    maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
                    minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
                    onOpenExternalLink={handlePreviewExternalLinkOpen}
                    onPreviewContextMenu={handlePreviewContextMenu}
                    onSourceLineDoubleClick={handlePreviewSourceLineDoubleClick}
                    onZoomScaleChange={handlePreviewZoomScaleChange}
                    defaultPageStyle={defaultPreviewPageStyle}
                    defaultTextStyle={defaultPreviewTextStyle}
                    pageHtmls={previewPageHtmls}
                    pages={previewPages}
                    previewFitMode={previewFitMode}
                    zoomScale={previewZoomScale}
                  />
                </div>
              </>
            ) : null}
          </section>
          {isDesktopMenuMounted ? (
            <div
              className="editor-shell__overlay"
              data-visible={isDesktopMenuVisible ? "true" : "false"}
              onClick={handleOverlayClick}
            >
              <div className="editor-shell__sidebar" role="dialog" aria-modal="true" aria-label="メニュー">
                <MenuSection {...menuSectionProps} />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <section
            ref={mobileTrackRef}
            className="editor-shell__mobile-track"
            data-dragging={isMobileDragging ? "true" : "false"}
            aria-label="モバイルワークスペース"
            onPointerDown={handleMobileTrackPointerDown}
            onPointerMove={handleMobileTrackPointerMove}
            onPointerUp={handleMobileTrackPointerEnd}
            onPointerCancel={handleMobileTrackPointerEnd}
          >
            <div className="editor-shell__mobile-track-inner" style={mobileTrackInnerStyle}>
              {mobileSectionOrder.map((section) => (
                <div key={section} className="editor-shell__mobile-slide">
                  {section === "menu" ? (
                    <MenuSection {...menuSectionProps} />
                  ) : section === "edit" ? (
                    <MarkdownInput
                      appThemeId={appThemeId}
                      content={content}
                      currentDocumentFilePath={currentDocumentFilePath}
                      editFontId={editFontId}
                      layoutMode={layoutMode}
                      multiCursorModifier={multiCursorModifier}
                      showLineNumbers={showLineNumbers}
                      onAssetDrop={handleImportDroppedAssets}
                      onContentChange={handleContentChange}
                      onCursorLineChange={handleEditCursorLineChange}
                      onFocusChange={handleEditFocusChange}
                      requestedLineSelection={editSelectionRequest}
                      showMobileInputHelperBar={mobileSection === "edit"}
                    />
                  ) : (
                    <MarkdownPreview
                      activeSourceLine={previewHighlightSourceLine}
                      displayMode={previewDisplayMode}
                      enableInteractiveViewportNavigation
                      html={previewHtml}
                      maximumZoomScale={MAX_PREVIEW_ZOOM_SCALE}
                      minimumZoomScale={MIN_PREVIEW_ZOOM_SCALE}
                      onOpenExternalLink={handlePreviewExternalLinkOpen}
                      onPreviewContextMenu={handlePreviewContextMenu}
                      onSourceLineDoubleClick={handlePreviewSourceLineDoubleClick}
                      onZoomScaleChange={handlePreviewZoomScaleChange}
                      defaultPageStyle={defaultPreviewPageStyle}
                      defaultTextStyle={defaultPreviewTextStyle}
                      pageHtmls={previewPageHtmls}
                      pages={previewPages}
                      previewFitMode={previewFitMode}
                      zoomScale={previewZoomScale}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <nav className="editor-shell__mobile-nav" style={mobileNavStyle} aria-label="セクション移動">
            {mobileSectionOrder.map((section) => (
              <button
                key={section}
                type="button"
                className={mobileSection === section ? "is-active" : undefined}
                onClick={() => requestMobileSection(section)}
              >
                {getMobileSectionLabel(section)}
              </button>
            ))}
          </nav>
        </>
      )}

      {previewContextMenuState !== null ? (
        <PreviewContextMenu
          ariaLabel="本体プレビューのコンテキストメニュー"
          hasModelCameraTarget={previewContextMenuHasModelCameraTarget}
          menuRef={previewContextMenuRef}
          onFit={handlePreviewZoomFit}
          onFullFit={previewDisplayMode === "a4" ? handlePreviewZoomFullFit : undefined}
          onModelCameraReset={handlePreviewModelCameraReset}
          style={previewContextMenuStyle}
        />
      ) : null}

      {confirmSaveOnExit.isOpen ? (
        <UnsavedExitDialog
          fileName={normalizedFileName}
          isSaving={confirmSaveOnExit.isSaving}
          onCancel={confirmSaveOnExit.onCancel}
          onDiscard={confirmSaveOnExit.onDiscard}
          onSave={confirmSaveOnExit.onSave}
        />
      ) : null}
    </main>
  );
}
