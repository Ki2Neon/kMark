import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { selectMostRecentExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type RenderedA4PreviewPage } from "../../domain/preview";
import { selectStartupLayoutMode, type LayoutMode } from "../../domain/editor";
import { type AppFontId, type DraftFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";
import {
  DEFAULT_DESKTOP_SPLIT_RATIO,
  MAX_DESKTOP_SPLIT_RATIO,
  MIN_DESKTOP_SPLIT_RATIO,
  loadDesktopSplitRatio,
  persistDesktopSplitRatio,
} from "../../infra/editorLayout";
import { openPreviewWindow } from "../../infra/previewWindow";
import { MenuSection } from "../components/MenuSection";
import { MarkdownInput } from "../components/MarkdownInput";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { useMarkdownEditor } from "../hooks/useMarkdownEditor";
import { usePreviewPreferences } from "../hooks/usePreviewPreferences";

const ACCEPTED_MARKDOWN_FILES = ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain";
const MOBILE_SECTION_ORDER_WITH_PREVIEW = ["menu", "draft", "preview"] as const;
const MOBILE_SECTION_ORDER_WITHOUT_PREVIEW = ["menu", "draft"] as const;
const DESKTOP_DIVIDER_WIDTH = 8;
const DESKTOP_MIN_PANEL_WIDTH = 180;
const DESKTOP_SPLIT_KEYBOARD_STEP = 5;
const DESKTOP_MENU_TRANSITION_MS = 60;
const ERROR_TOAST_DURATION_MS = 2400;
const MOBILE_SWIPE_THRESHOLD_PX = 40;
const MOBILE_SLIDE_TRANSITION_MS = 60;

type MobileSectionId = "menu" | "draft" | "preview";

type MarkdownEditorScreenProps = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly draftFontId: DraftFontId;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly onAppFontChange: (appFontId: AppFontId) => void;
  readonly onAppThemeChange: (appThemeId: AppThemeId) => void;
  readonly onDraftFontChange: (draftFontId: DraftFontId) => void;
  readonly onMultiCursorModifierChange: (multiCursorModifier: MultiCursorModifier) => void;
  readonly onPreviewUsesAppThemeColorsChange: (previewUsesAppThemeColors: boolean) => void;
  readonly previewUsesAppThemeColors: boolean;
};

function getMobileSectionIndex(section: MobileSectionId, sectionOrder: readonly MobileSectionId[]): number {
  return sectionOrder.indexOf(section);
}

function toPreviewWindowErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "プレビューウィンドウを開けませんでした。";
}

function clampDesktopSplitRatio(splitRatio: number, containerWidth: number): number {
  if (containerWidth <= DESKTOP_MIN_PANEL_WIDTH * 2) {
    return DEFAULT_DESKTOP_SPLIT_RATIO;
  }

  const minRatio = Math.max(
    MIN_DESKTOP_SPLIT_RATIO,
    (DESKTOP_MIN_PANEL_WIDTH / containerWidth) * 100,
  );
  const maxRatio = Math.min(MAX_DESKTOP_SPLIT_RATIO, 100 - minRatio);

  return Math.min(maxRatio, Math.max(minRatio, splitRatio));
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
    viewportWidth: window.innerWidth,
    isMobileUserAgent:
      navigatorWithUAData.userAgentData?.mobile === true ||
      /android|iphone|ipad|ipod/iu.test(navigator.userAgent),
  });
}

export function MarkdownEditorScreen({
  appFontId,
  appThemeId,
  draftFontId,
  multiCursorModifier,
  onAppFontChange,
  onAppThemeChange,
  onDraftFontChange,
  onMultiCursorModifierChange,
  onPreviewUsesAppThemeColorsChange,
  previewUsesAppThemeColors,
}: MarkdownEditorScreenProps) {
  const { previewDisplayMode, onPreviewDisplayModeChange } = usePreviewPreferences();
  const {
    canOpenDocumentWithNativePicker,
    content,
    errorMessage,
    fileName,
    isDirty,
    previewHtml,
    handleClearPendingExternalDocuments,
    previewPageHtmls,
    confirmDiscard,
    handleContentChange,
    handleLoadExternalDocument,
    handleOpenDocumentFromPicker,
    handlePickedFile,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
    handleTakePendingExternalDocuments,
    subscribeToExternalDocumentRequests,
    handleErrorClear,
    handleErrorRaise,
  } = useMarkdownEditor();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const desktopWorkspaceRef = useRef<HTMLElement | null>(null);
  const mobileTrackRef = useRef<HTMLElement | null>(null);
  const mobileSwipePointerIdRef = useRef<number | null>(null);
  const mobileSwipeStartXRef = useRef<number | null>(null);
  const mobileSwipeStartYRef = useRef<number | null>(null);
  const mobileSwipeStartIndexRef = useRef(0);
  const mobileSwipeAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const mobileDragOffsetPxRef = useRef(0);
  const mobileSectionBeforeMenuRef = useRef<Exclude<MobileSectionId, "menu">>("draft");
  const pendingMobileSectionRef = useRef<MobileSectionId | null>(null);
  const draftSelectionRequestIdRef = useRef(0);
  const activeDividerPointerIdRef = useRef<number | null>(null);
  const desktopMenuCloseTimeoutRef = useRef<number | null>(null);
  const desktopMenuOpenFrameRef = useRef<number | null>(null);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => detectLayoutMode());
  const [isDesktopMenuMounted, setIsDesktopMenuMounted] = useState(false);
  const [isDesktopMenuVisible, setIsDesktopMenuVisible] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [isDesktopResizing, setIsDesktopResizing] = useState(false);
  const [isDraftFocused, setIsDraftFocused] = useState(false);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [activeDraftCursorLine, setActiveDraftCursorLine] = useState<number | null>(1);
  const [draftSelectionRequest, setDraftSelectionRequest] = useState<{ readonly lineNumber: number; readonly requestId: number } | null>(null);
  const [renderedA4PreviewPages, setRenderedA4PreviewPages] = useState<readonly RenderedA4PreviewPage[]>([]);
  const [mobileDragOffsetPx, setMobileDragOffsetPx] = useState(0);
  const [mobileSection, setMobileSection] = useState<MobileSectionId>("draft");
  const [mobileViewportWidth, setMobileViewportWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }

    return window.innerWidth;
  });
  const [desktopSplitRatio, setDesktopSplitRatio] = useState<number>(
    () => loadDesktopSplitRatio() ?? DEFAULT_DESKTOP_SPLIT_RATIO,
  );

  const desktopSplitRatioRef = useRef(desktopSplitRatio);
  const mobileSectionOrder = isPreviewVisible ? MOBILE_SECTION_ORDER_WITH_PREVIEW : MOBILE_SECTION_ORDER_WITHOUT_PREVIEW;

  const mobileSectionIndex = useMemo(() => {
    const nextIndex = getMobileSectionIndex(mobileSection, mobileSectionOrder);

    return nextIndex === -1 ? getMobileSectionIndex("draft", mobileSectionOrder) : nextIndex;
  }, [mobileSection, mobileSectionOrder]);

  useEffect(() => {
    desktopSplitRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  const desktopLayoutStyle = useMemo(
    () => ({ "--desktop-split-ratio": `${desktopSplitRatio}` } as CSSProperties),
    [desktopSplitRatio],
  );

  const mobileTrackInnerStyle = useMemo(
    () => ({
      transform: `translate3d(${(-mobileSectionIndex * mobileViewportWidth) + mobileDragOffsetPx}px, 0, 0)`,
      transitionDuration: isMobileDragging ? "0ms" : `${MOBILE_SLIDE_TRANSITION_MS}ms`,
    } as CSSProperties),
    [isMobileDragging, mobileDragOffsetPx, mobileSectionIndex, mobileViewportWidth],
  );

  const mobileNavStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${mobileSectionOrder.length}, minmax(0, 1fr))` } as CSSProperties),
    [mobileSectionOrder.length],
  );

  const setDesktopSplitRatioValue = useCallback((nextRatio: number) => {
    desktopSplitRatioRef.current = nextRatio;
    setDesktopSplitRatio(nextRatio);
  }, []);

  const updateDesktopSplitRatioFromClientX = useCallback((clientX: number) => {
    const workspace = desktopWorkspaceRef.current;

    if (workspace === null) {
      return;
    }

    const workspaceBounds = workspace.getBoundingClientRect();
    const availableWidth = workspaceBounds.width - DESKTOP_DIVIDER_WIDTH;

    if (availableWidth <= 0) {
      return;
    }

    const nextRatio = clampDesktopSplitRatio(
      ((clientX - workspaceBounds.left - DESKTOP_DIVIDER_WIDTH / 2) / availableWidth) * 100,
      availableWidth,
    );

    setDesktopSplitRatioValue(nextRatio);
  }, [setDesktopSplitRatioValue]);

  const commitDesktopSplitRatio = useCallback((splitRatio: number) => {
    persistDesktopSplitRatio(splitRatio);
  }, []);

  const syncMobileViewportWidth = useCallback(() => {
    const track = mobileTrackRef.current;
    const nextWidth = track?.clientWidth ?? (typeof window === "undefined" ? 0 : window.innerWidth);

    setMobileViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  }, []);

  const clearDesktopMenuTimers = useCallback(() => {
    if (desktopMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(desktopMenuCloseTimeoutRef.current);
      desktopMenuCloseTimeoutRef.current = null;
    }

    if (desktopMenuOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(desktopMenuOpenFrameRef.current);
      desktopMenuOpenFrameRef.current = null;
    }
  }, []);

  const closeDesktopMenuImmediately = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuVisible(false);
    setIsDesktopMenuMounted(false);
  }, [clearDesktopMenuTimers]);

  const closeDesktopMenu = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuVisible(false);
    desktopMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsDesktopMenuMounted(false);
      desktopMenuCloseTimeoutRef.current = null;
    }, DESKTOP_MENU_TRANSITION_MS);
  }, [clearDesktopMenuTimers]);

  const openDesktopMenu = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuMounted(true);
    desktopMenuOpenFrameRef.current = window.requestAnimationFrame(() => {
      setIsDesktopMenuVisible(true);
      desktopMenuOpenFrameRef.current = null;
    });
  }, [clearDesktopMenuTimers]);

  const toggleDesktopMenu = useCallback(() => {
    if (isDesktopMenuMounted && isDesktopMenuVisible) {
      closeDesktopMenu();
      return;
    }

    openDesktopMenu();
  }, [closeDesktopMenu, isDesktopMenuMounted, isDesktopMenuVisible, openDesktopMenu]);

  const handleViewportResize = useCallback(() => {
    syncMobileViewportWidth();
  }, [syncMobileViewportWidth]);

  useEffect(() => {
    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [handleViewportResize]);

  useEffect(() => {
    if (layoutMode === "desktop") {
      pendingMobileSectionRef.current = null;
      return;
    }

    closeDesktopMenuImmediately();
    syncMobileViewportWidth();
    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
    mobileDragOffsetPxRef.current = 0;

    const animationFrameId = window.requestAnimationFrame(() => {
      const nextMobileSection = pendingMobileSectionRef.current ?? "draft";
      pendingMobileSectionRef.current = null;
      setMobileSection(nextMobileSection);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [closeDesktopMenuImmediately, layoutMode, syncMobileViewportWidth]);

  useEffect(() => {
    syncMobileViewportWidth();
  }, [layoutMode, syncMobileViewportWidth]);

  useEffect(() => {
    if (layoutMode !== "mobile") {
      setIsDraftFocused(false);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (mobileSection !== "menu") {
      mobileSectionBeforeMenuRef.current = mobileSection;
    }
  }, [mobileSection]);

  useEffect(() => {
    if (isPreviewVisible || mobileSection !== "preview") {
      return;
    }

    pendingMobileSectionRef.current = "draft";
    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
    mobileDragOffsetPxRef.current = 0;
    setMobileSection("draft");
  }, [isPreviewVisible, mobileSection]);

  useEffect(() => {
    return () => {
      clearDesktopMenuTimers();
    };
  }, [clearDesktopMenuTimers]);

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

  useEffect(() => {
    const normalizedFileName = fileName.trim().length > 0 ? fileName.trim() : "untitled.md";
    document.title = `${isDirty ? "• " : ""}${normalizedFileName} - kMark`;
  }, [fileName, isDirty]);

  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

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
    void handlePrintDocument(previewDisplayMode, renderedA4PreviewPages);
  }, [closeDesktopMenu, handlePrintDocument, previewDisplayMode, renderedA4PreviewPages]);

  const handleRequestOpenPreviewWindow = useCallback(() => {
    if (layoutMode === "desktop") {
      closeDesktopMenu();
    }

    void openPreviewWindow().catch((error) => {
      handleErrorRaise(toPreviewWindowErrorMessage(error));
    });
  }, [closeDesktopMenu, handleErrorRaise, layoutMode]);

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

  const handleMobileSectionRequest = useCallback(
    (section: MobileSectionId) => {
      if (!isPreviewVisible && section === "preview") {
        return;
      }

      if (section === "menu" && mobileSection !== "menu") {
        mobileSectionBeforeMenuRef.current = mobileSection;
      }

      if (section !== "draft") {
        blurActiveElement();
      }

      setIsMobileDragging(false);
      setMobileDragOffsetPx(0);
      mobileDragOffsetPxRef.current = 0;
      setMobileSection(section);
    },
    [blurActiveElement, isPreviewVisible, mobileSection],
  );

  const loadPendingExternalDocumentEvent = useEffectEvent(async (requiresDiscardConfirmation: boolean) => {
    if (requiresDiscardConfirmation && !confirmDiscard()) {
      await handleClearPendingExternalDocuments();
      return;
    }

    const pendingDocuments = await handleTakePendingExternalDocuments();
    const nextDocument = selectMostRecentExternalMarkdownDocument(pendingDocuments);

    if (nextDocument === null) {
      return;
    }

    if (layoutMode === "desktop") {
      closeDesktopMenu();
    } else {
      handleMobileSectionRequest("draft");
    }

    handleLoadExternalDocument(nextDocument);
  });

  useEffect(() => {
    void loadPendingExternalDocumentEvent(false);
  }, [loadPendingExternalDocumentEvent]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToExternalDocumentRequests(() => {
      void loadPendingExternalDocumentEvent(true);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [loadPendingExternalDocumentEvent, subscribeToExternalDocumentRequests]);

  const handlePreviewVisibilityChange = useCallback((nextIsPreviewVisible: boolean) => {
    setIsPreviewVisible(nextIsPreviewVisible);

    if (!nextIsPreviewVisible) {
      setIsMobileDragging(false);
      setMobileDragOffsetPx(0);
      mobileDragOffsetPxRef.current = 0;
    }
  }, []);

  const handleLayoutModeChange = useCallback((nextLayoutMode: LayoutMode) => {
    closeDesktopMenuImmediately();
    blurActiveElement();
    setIsDraftFocused(false);
    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
    mobileDragOffsetPxRef.current = 0;

    if (nextLayoutMode === "mobile") {
      pendingMobileSectionRef.current = "menu";
      syncMobileViewportWidth();
    }

    setLayoutMode(nextLayoutMode);
  }, [blurActiveElement, closeDesktopMenuImmediately, syncMobileViewportWidth]);

  const clearMobileSwipeState = useCallback(() => {
    mobileSwipePointerIdRef.current = null;
    mobileSwipeStartXRef.current = null;
    mobileSwipeStartYRef.current = null;
    mobileSwipeAxisRef.current = null;
  }, []);

  const handleDraftFocusChange = useCallback((nextIsFocused: boolean) => {
    setIsDraftFocused(nextIsFocused);
  }, []);

  const handleDraftCursorLineChange = useCallback((nextCursorLine: number) => {
    setActiveDraftCursorLine(nextCursorLine);
  }, []);

  const handleRenderedA4PagesChange = useCallback((nextRenderedA4Pages: readonly RenderedA4PreviewPage[]) => {
    setRenderedA4PreviewPages(nextRenderedA4Pages);
  }, []);

  const handlePreviewSourceLineDoubleClick = useCallback((lineNumber: number) => {
    const nextRequestId = draftSelectionRequestIdRef.current + 1;
    draftSelectionRequestIdRef.current = nextRequestId;

    setActiveDraftCursorLine(lineNumber);
    setDraftSelectionRequest({ lineNumber, requestId: nextRequestId });

    if (layoutMode === "mobile") {
      handleMobileSectionRequest("draft");
    }
  }, [handleMobileSectionRequest, layoutMode]);

  const handleMobileTrackPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || layoutMode !== "mobile") {
      return;
    }

    const eventTarget = event.target;

    if (!(eventTarget instanceof HTMLElement)) {
      return;
    }

    if (eventTarget.closest("button, input, select, label, a") !== null) {
      return;
    }

    if (mobileSection === "draft" && isDraftFocused) {
      return;
    }

    mobileSwipePointerIdRef.current = event.pointerId;
    mobileSwipeStartXRef.current = event.clientX;
    mobileSwipeStartYRef.current = event.clientY;
    mobileSwipeStartIndexRef.current = mobileSectionIndex;
    mobileSwipeAxisRef.current = null;
    mobileDragOffsetPxRef.current = 0;
    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
  }, [isDraftFocused, layoutMode, mobileSectionIndex]);

  const handleMobileTrackPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (mobileSwipePointerIdRef.current !== event.pointerId) {
      return;
    }

    const startX = mobileSwipeStartXRef.current;
    const startY = mobileSwipeStartYRef.current;

    if (startX === null || startY === null) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (mobileSwipeAxisRef.current === null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
        return;
      }

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        clearMobileSwipeState();
        return;
      }

      mobileSwipeAxisRef.current = "horizontal";
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsMobileDragging(true);
    }

    if (mobileSwipeAxisRef.current !== "horizontal") {
      return;
    }

    const baseIndex = mobileSwipeStartIndexRef.current;
    let nextOffset = deltaX;

    if ((baseIndex === 0 && nextOffset > 0) || (baseIndex === mobileSectionOrder.length - 1 && nextOffset < 0)) {
      nextOffset = 0;
    }

    mobileDragOffsetPxRef.current = nextOffset;
    setMobileDragOffsetPx(nextOffset);
  }, [clearMobileSwipeState, mobileSectionOrder.length]);

  const handleMobileTrackPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (mobileSwipePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const axis = mobileSwipeAxisRef.current;
      const baseIndex = mobileSwipeStartIndexRef.current;
      const width = mobileViewportWidth > 0 ? mobileViewportWidth : event.currentTarget.clientWidth;
      const currentOffset = mobileDragOffsetPxRef.current;

      clearMobileSwipeState();
      setIsMobileDragging(false);
      setMobileDragOffsetPx(0);
      mobileDragOffsetPxRef.current = 0;

      if (axis !== "horizontal" || width <= 0) {
        return;
      }

      const threshold = Math.max(MOBILE_SWIPE_THRESHOLD_PX, Math.min(80, width * 0.12));
      let targetIndex = baseIndex;

      if (Math.abs(currentOffset) >= threshold) {
        targetIndex = currentOffset < 0
          ? Math.min(baseIndex + 1, mobileSectionOrder.length - 1)
          : Math.max(baseIndex - 1, 0);
      }

      const nextSection = mobileSectionOrder[targetIndex] ?? "draft";

      if (nextSection !== "draft") {
        blurActiveElement();
      }

      setMobileSection(nextSection);
    },
    [blurActiveElement, clearMobileSwipeState, mobileSectionOrder, mobileViewportWidth],
  );

  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        closeDesktopMenu();
      }
    },
    [closeDesktopMenu],
  );

  const handleDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (layoutMode !== "desktop") {
        return;
      }

      activeDividerPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDesktopResizing(true);
      updateDesktopSplitRatioFromClientX(event.clientX);
    },
    [layoutMode, updateDesktopSplitRatioFromClientX],
  );

  const handleDividerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeDividerPointerIdRef.current !== event.pointerId) {
        return;
      }

      updateDesktopSplitRatioFromClientX(event.clientX);
    },
    [updateDesktopSplitRatioFromClientX],
  );

  const handleDividerPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeDividerPointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activeDividerPointerIdRef.current = null;
      setIsDesktopResizing(false);
      commitDesktopSplitRatio(desktopSplitRatioRef.current);
    },
    [commitDesktopSplitRatio],
  );

  const handleDividerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const workspace = desktopWorkspaceRef.current;

      if (workspace === null) {
        return;
      }

      const availableWidth = workspace.getBoundingClientRect().width - DESKTOP_DIVIDER_WIDTH;

      if (event.key === "Home") {
        event.preventDefault();
        const nextRatio = clampDesktopSplitRatio(MIN_DESKTOP_SPLIT_RATIO, availableWidth);
        setDesktopSplitRatioValue(nextRatio);
        commitDesktopSplitRatio(nextRatio);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const nextRatio = clampDesktopSplitRatio(MAX_DESKTOP_SPLIT_RATIO, availableWidth);
        setDesktopSplitRatioValue(nextRatio);
        commitDesktopSplitRatio(nextRatio);
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();

      const delta = event.key === "ArrowLeft" ? -DESKTOP_SPLIT_KEYBOARD_STEP : DESKTOP_SPLIT_KEYBOARD_STEP;
      const nextRatio = clampDesktopSplitRatio(desktopSplitRatioRef.current + delta, availableWidth);

      setDesktopSplitRatioValue(nextRatio);
      commitDesktopSplitRatio(nextRatio);
    },
    [commitDesktopSplitRatio, setDesktopSplitRatioValue],
  );

  const handleDividerDoubleClick = useCallback(() => {
    setDesktopSplitRatioValue(DEFAULT_DESKTOP_SPLIT_RATIO);
    commitDesktopSplitRatio(DEFAULT_DESKTOP_SPLIT_RATIO);
  }, [commitDesktopSplitRatio, setDesktopSplitRatioValue]);

  const saveDocumentEvent = useEffectEvent(() => {
    void handleOverwriteSaveDocument();
  });

  const printDocumentEvent = useEffectEvent(() => {
    closeDesktopMenu();
    void handlePrintDocument(previewDisplayMode, renderedA4PreviewPages);
  });

  const openDocumentEvent = useEffectEvent(() => {
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
  });

  const newDocumentEvent = useEffectEvent(() => {
    if (!confirmDiscard()) {
      return;
    }

    if (layoutMode === "desktop") {
      closeDesktopMenu();
    }

    handleResetDocument();
  });

  const menuToggleEvent = useEffectEvent(() => {
    if (layoutMode === "desktop") {
      toggleDesktopMenu();
      return;
    }

    handleMobileSectionRequest("menu");
  });

  const dismissMenuEvent = useEffectEvent(() => {
    if (layoutMode === "desktop") {
      closeDesktopMenu();
      return;
    }

    if (mobileSection !== "menu") {
      return;
    }

    const previousMobileSection = !isPreviewVisible && mobileSectionBeforeMenuRef.current === "preview"
      ? "draft"
      : mobileSectionBeforeMenuRef.current;

    handleMobileSectionRequest(previousMobileSection);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissMenuEvent();
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        saveDocumentEvent();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        printDocumentEvent();
        return;
      }

      if (key === "b" && event.shiftKey) {
        event.preventDefault();
        menuToggleEvent();
        return;
      }

      if (key === "o") {
        event.preventDefault();
        openDocumentEvent();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        newDocumentEvent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissMenuEvent, menuToggleEvent, newDocumentEvent, openDocumentEvent, printDocumentEvent, saveDocumentEvent]);

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
            <div className="workspace-grid__panel workspace-grid__panel--draft">
              <MarkdownInput
                appThemeId={appThemeId}
                content={content}
                draftFontId={draftFontId}
                layoutMode={layoutMode}
                multiCursorModifier={multiCursorModifier}
                onContentChange={handleContentChange}
                onCursorLineChange={handleDraftCursorLineChange}
                requestedLineSelection={draftSelectionRequest}
              />
            </div>

            {isPreviewVisible ? (
              <>
                <div
                  className="workspace-grid__divider"
                  role="separator"
                  aria-label="Draft と Preview の幅を調整"
                  aria-orientation="vertical"
                  aria-valuemin={MIN_DESKTOP_SPLIT_RATIO}
                  aria-valuemax={MAX_DESKTOP_SPLIT_RATIO}
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
                    activeSourceLine={activeDraftCursorLine}
                    displayMode={previewDisplayMode}
                    html={previewHtml}
                    onRenderedA4PagesChange={handleRenderedA4PagesChange}
                    onSourceLineDoubleClick={handlePreviewSourceLineDoubleClick}
                    pageHtmls={previewPageHtmls}
                  />
                </div>
              </>
            ) : null}
          </section>

          {previewDisplayMode === "a4" && !isPreviewVisible ? (
            <div className="editor-shell__hidden-preview-probe" aria-hidden="true">
              <MarkdownPreview
                displayMode={previewDisplayMode}
                html={previewHtml}
                onRenderedA4PagesChange={handleRenderedA4PagesChange}
                pageHtmls={previewPageHtmls}
              />
            </div>
          ) : null}

          {isDesktopMenuMounted ? (
            <div
              className="editor-shell__overlay"
              data-visible={isDesktopMenuVisible ? "true" : "false"}
              onClick={handleOverlayClick}
            >
              <div className="editor-shell__sidebar" role="dialog" aria-modal="true" aria-label="メニュー">
                <MenuSection
                  appFontId={appFontId}
                  appThemeId={appThemeId}
                  draftFontId={draftFontId}
                  previewDisplayMode={previewDisplayMode}
                  previewUsesAppThemeColors={previewUsesAppThemeColors}
                  isPreviewVisible={isPreviewVisible}
                  layoutMode={layoutMode}
                  multiCursorModifier={multiCursorModifier}
                  onAppFontChange={onAppFontChange}
                  onAppThemeChange={onAppThemeChange}
                  onDraftFontChange={onDraftFontChange}
                  onLayoutModeChange={handleLayoutModeChange}
                  onMultiCursorModifierChange={onMultiCursorModifierChange}
                  onNewDocument={handleRequestNew}
                  onOpenPreviewWindow={handleRequestOpenPreviewWindow}
                  onOpenDocument={handleRequestOpen}
                  onOverwriteSaveDocument={handleRequestOverwriteSave}
                  onPrintDocument={handleRequestPrint}
                  onPreviewDisplayModeChange={onPreviewDisplayModeChange}
                  onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
                  onPreviewVisibilityChange={handlePreviewVisibilityChange}
                  onSaveDocumentAs={handleRequestSaveAs}
                />
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
                    <MenuSection
                      appFontId={appFontId}
                      appThemeId={appThemeId}
                      draftFontId={draftFontId}
                      previewDisplayMode={previewDisplayMode}
                      previewUsesAppThemeColors={previewUsesAppThemeColors}
                      isPreviewVisible={isPreviewVisible}
                      layoutMode={layoutMode}
                      multiCursorModifier={multiCursorModifier}
                      onAppFontChange={onAppFontChange}
                      onAppThemeChange={onAppThemeChange}
                      onDraftFontChange={onDraftFontChange}
                      onLayoutModeChange={handleLayoutModeChange}
                      onMultiCursorModifierChange={onMultiCursorModifierChange}
                      onNewDocument={handleRequestNew}
                      onOpenPreviewWindow={handleRequestOpenPreviewWindow}
                      onOpenDocument={handleRequestOpen}
                      onOverwriteSaveDocument={handleRequestOverwriteSave}
                      onPrintDocument={handleRequestPrint}
                      onPreviewDisplayModeChange={onPreviewDisplayModeChange}
                      onPreviewUsesAppThemeColorsChange={onPreviewUsesAppThemeColorsChange}
                      onPreviewVisibilityChange={handlePreviewVisibilityChange}
                      onSaveDocumentAs={handleRequestSaveAs}
                    />
                  ) : section === "draft" ? (
                    <MarkdownInput
                      appThemeId={appThemeId}
                      content={content}
                      draftFontId={draftFontId}
                      layoutMode={layoutMode}
                      multiCursorModifier={multiCursorModifier}
                      onContentChange={handleContentChange}
                      onCursorLineChange={handleDraftCursorLineChange}
                      onFocusChange={handleDraftFocusChange}
                      requestedLineSelection={draftSelectionRequest}
                    />
                  ) : (
                    <MarkdownPreview
                      activeSourceLine={activeDraftCursorLine}
                      displayMode={previewDisplayMode}
                      html={previewHtml}
                      onRenderedA4PagesChange={handleRenderedA4PagesChange}
                      onSourceLineDoubleClick={handlePreviewSourceLineDoubleClick}
                      pageHtmls={previewPageHtmls}
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
                onClick={() => handleMobileSectionRequest(section)}
              >
                {section}
              </button>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}