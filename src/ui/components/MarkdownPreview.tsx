import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  A4_MARGIN_BOTTOM_MM,
  A4_MARGIN_LEFT_MM,
  A4_MARGIN_RIGHT_MM,
  A4_MARGIN_TOP_MM,
  A4_PAGE_HEIGHT_PX,
  A4_PAGE_WIDTH_PX,
  CSS_MM_TO_PX,
  type PreviewDisplayMode,
} from "../../domain/preview";

const A4_MARGIN_TOP_PX = A4_MARGIN_TOP_MM * CSS_MM_TO_PX;
const A4_MARGIN_RIGHT_PX = A4_MARGIN_RIGHT_MM * CSS_MM_TO_PX;
const A4_MARGIN_BOTTOM_PX = A4_MARGIN_BOTTOM_MM * CSS_MM_TO_PX;
const A4_MARGIN_LEFT_PX = A4_MARGIN_LEFT_MM * CSS_MM_TO_PX;
const MIN_A4_SCALE = 0.1;
const DEFAULT_MAX_PREVIEW_ZOOM_SCALE = 2;
const INTERACTIVE_PREVIEW_PAN_THRESHOLD_PX = 3;
const PREVIEW_CURSOR_TARGET_CLASS_NAME = "preview-section__cursor-target";
const PREVIEW_CURSOR_SCROLL_PADDING_PX = 72;
const PREVIEW_CURSOR_VIEWPORT_ANCHOR_RATIO = 0.35;
const DEFAULT_TABLE_CELL_HORIZONTAL_PADDING_PX = 12;
const DEFAULT_TABLE_CELL_VERTICAL_PADDING_PX = 10.4;
const MIN_TABLE_CELL_HORIZONTAL_PADDING_PX = 4;
const MIN_TABLE_CELL_VERTICAL_PADDING_PX = 4;
const MIN_TABLE_FONT_SCALE = 0.74;
const TABLE_FONT_SCALE_STEP = 0.02;
const TABLE_OVERFLOW_TOLERANCE_PX = 1;
const EXTERNAL_LINK_SCHEME_PATTERN = /^(https?:|mailto:|tel:)/iu;

type MarkdownPreviewProps = {
  readonly activeSourceLine?: number | null;
  readonly displayMode: PreviewDisplayMode;
  readonly enableInteractiveViewportNavigation?: boolean;
  readonly html: string;
  readonly maximumZoomScale?: number;
  readonly minimumZoomScale?: number;
  readonly onOpenExternalLink?: (url: string) => void;
  readonly onPreviewContextMenu?: (clientX: number, clientY: number) => void;
  readonly onSourceLineDoubleClick?: (lineNumber: number) => void;
  readonly onZoomScaleChange?: (zoomScale: number) => void;
  readonly pageHtmls?: readonly string[];
  readonly zoomScale?: number;
};

type PreviewBlockInfo = {
  readonly containerRect: DOMRect;
  readonly rect: DOMRect;
  readonly visibilityScore: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveEventTargetElement(eventTarget: EventTarget | null): HTMLElement | null {
  if (eventTarget instanceof HTMLElement) {
    return eventTarget;
  }

  if (eventTarget instanceof Node && eventTarget.parentElement instanceof HTMLElement) {
    return eventTarget.parentElement;
  }

  return null;
}

function isPointInsideRect(rect: DOMRect, clientX: number, clientY: number): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getVisibleAreaWithinContainer(subject: DOMRect, container: DOMRect): number {
  const visibleWidth = Math.max(0, Math.min(subject.right, container.right) - Math.max(subject.left, container.left));
  const visibleHeight = Math.max(0, Math.min(subject.bottom, container.bottom) - Math.max(subject.top, container.top));

  return visibleWidth * visibleHeight;
}

function getPreviewBlockInfo(
  previewViewport: HTMLElement,
  previewBlock: HTMLElement,
): PreviewBlockInfo | null {
  const rect = previewBlock.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const containerRect = previewViewport.getBoundingClientRect();

  return {
    containerRect,
    rect,
    visibilityScore: getVisibleAreaWithinContainer(rect, containerRect),
  };
}

function getSourceLineProgress(
  sourceLineRange: { start: number; end: number },
  activeSourceLine: number,
): number {
  if (sourceLineRange.end <= sourceLineRange.start) {
    return 0.5;
  }

  return clamp(
    (Math.max(sourceLineRange.start, Math.min(activeSourceLine, sourceLineRange.end)) - sourceLineRange.start)
      / (sourceLineRange.end - sourceLineRange.start),
    0,
    1,
  );
}

function getPreviewBlockVisibilityScore(
  previewViewport: HTMLElement,
  previewBlock: HTMLElement,
): number {
  return getPreviewBlockInfo(previewViewport, previewBlock)?.visibilityScore ?? 0;
}

function findPreviewCursorTarget(
  previewViewport: HTMLElement,
  activeSourceLine: number,
): HTMLElement | null {
  const previewBlocks = Array.from(
    previewViewport.querySelectorAll<HTMLElement>("[data-source-line-start][data-source-line-end]"),
  );
  let containingBlock: { element: HTMLElement; span: number; visibilityScore: number } | null = null;
  let nearestBlock: { element: HTMLElement; distance: number; visibilityScore: number } | null = null;

  for (const previewBlock of previewBlocks) {
    const sourceLineStart = Number.parseInt(previewBlock.dataset.sourceLineStart ?? "", 10);
    const sourceLineEnd = Number.parseInt(previewBlock.dataset.sourceLineEnd ?? "", 10);

    if (!Number.isFinite(sourceLineStart) || !Number.isFinite(sourceLineEnd)) {
      continue;
    }

    if (activeSourceLine >= sourceLineStart && activeSourceLine <= sourceLineEnd) {
      const span = sourceLineEnd - sourceLineStart;
      const visibilityScore = getPreviewBlockVisibilityScore(previewViewport, previewBlock);

      if (
        containingBlock === null
        || span < containingBlock.span
        || (span === containingBlock.span && visibilityScore > containingBlock.visibilityScore)
      ) {
        containingBlock = {
          element: previewBlock,
          span,
          visibilityScore,
        };
      }

      continue;
    }

    const distance = activeSourceLine < sourceLineStart
      ? sourceLineStart - activeSourceLine
      : activeSourceLine - sourceLineEnd;
    const visibilityScore = getPreviewBlockVisibilityScore(previewViewport, previewBlock);

    if (
      nearestBlock === null
      || distance < nearestBlock.distance
      || (distance === nearestBlock.distance && visibilityScore > nearestBlock.visibilityScore)
    ) {
      nearestBlock = {
        element: previewBlock,
        distance,
        visibilityScore,
      };
    }
  }

  return containingBlock?.element ?? nearestBlock?.element ?? null;
}

function getPreviewCursorTargetLineRange(
  previewTarget: HTMLElement,
): { start: number; end: number } | null {
  const sourceLineStart = Number.parseInt(previewTarget.dataset.sourceLineStart ?? "", 10);
  const sourceLineEnd = Number.parseInt(previewTarget.dataset.sourceLineEnd ?? "", 10);

  if (!Number.isFinite(sourceLineStart) || !Number.isFinite(sourceLineEnd)) {
    return null;
  }

  return {
    start: sourceLineStart,
    end: sourceLineEnd,
  };
}

function resolveDoubleClickSourceLine(
  previewViewport: HTMLElement,
  previewTarget: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const previewTargetLineRange = getPreviewCursorTargetLineRange(previewTarget);
  const previewBlockInfo = getPreviewBlockInfo(previewViewport, previewTarget);

  if (previewTargetLineRange === null || previewBlockInfo === null) {
    return null;
  }

  if (!isPointInsideRect(previewBlockInfo.rect, clientX, clientY)) {
    return null;
  }

  const lineProgress = previewBlockInfo.rect.height <= 0
    ? 0.5
    : clamp((clientY - previewBlockInfo.rect.top) / previewBlockInfo.rect.height, 0, 1);
  const zeroBasedLineNumber = previewTargetLineRange.end <= previewTargetLineRange.start
    ? previewTargetLineRange.start
    : Math.round(
      previewTargetLineRange.start
        + ((previewTargetLineRange.end - previewTargetLineRange.start) * lineProgress),
    );

  return zeroBasedLineNumber + 1;
}

function resolveExternalLink(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")?.trim() ?? "";

  if (href.length === 0 || href.startsWith("#") || !EXTERNAL_LINK_SCHEME_PATTERN.test(href)) {
    return null;
  }

  return href;
}

function getTableAvailableWidth(table: HTMLTableElement): number {
  return table.parentElement?.clientWidth ?? table.clientWidth;
}

function isPreviewTableOverflowing(table: HTMLTableElement): boolean {
  const availableWidth = getTableAvailableWidth(table);

  if (availableWidth <= 0) {
    return false;
  }

  return table.scrollWidth - availableWidth > TABLE_OVERFLOW_TOLERANCE_PX;
}

function getPreviewTableCellPadding(
  table: HTMLTableElement,
): { horizontal: number; vertical: number } {
  const previewTableCell = table.querySelector<HTMLElement>("th, td");

  if (previewTableCell === null) {
    return {
      horizontal: DEFAULT_TABLE_CELL_HORIZONTAL_PADDING_PX,
      vertical: DEFAULT_TABLE_CELL_VERTICAL_PADDING_PX,
    };
  }

  const previewTableCellStyle = window.getComputedStyle(previewTableCell);
  const horizontalPadding = Number.parseFloat(previewTableCellStyle.paddingLeft);
  const verticalPadding = Number.parseFloat(previewTableCellStyle.paddingTop);

  return {
    horizontal: Number.isFinite(horizontalPadding) ? horizontalPadding : DEFAULT_TABLE_CELL_HORIZONTAL_PADDING_PX,
    vertical: Number.isFinite(verticalPadding) ? verticalPadding : DEFAULT_TABLE_CELL_VERTICAL_PADDING_PX,
  };
}

function resetPreviewTableFit(table: HTMLTableElement): void {
  table.style.removeProperty("--preview-table-cell-padding-x");
  table.style.removeProperty("--preview-table-cell-padding-y");
  table.style.removeProperty("--preview-table-font-scale");
}

function setPreviewTablePadding(
  table: HTMLTableElement,
  horizontalPaddingPx: number,
  verticalPaddingPx: number,
): void {
  table.style.setProperty("--preview-table-cell-padding-x", `${horizontalPaddingPx.toFixed(2)}px`);
  table.style.setProperty("--preview-table-cell-padding-y", `${verticalPaddingPx.toFixed(2)}px`);
}

function setPreviewTableFontScale(table: HTMLTableElement, fontScale: number): void {
  table.style.setProperty("--preview-table-font-scale", fontScale.toFixed(2));
}

function fitPreviewTable(table: HTMLTableElement): void {
  resetPreviewTableFit(table);

  if (!isPreviewTableOverflowing(table)) {
    return;
  }

  const defaultPadding = getPreviewTableCellPadding(table);

  for (
    let nextHorizontalPadding = defaultPadding.horizontal - 1;
    nextHorizontalPadding >= MIN_TABLE_CELL_HORIZONTAL_PADDING_PX;
    nextHorizontalPadding -= 1
  ) {
    const paddingReductionRatio = defaultPadding.horizontal <= MIN_TABLE_CELL_HORIZONTAL_PADDING_PX
      ? 1
      : (nextHorizontalPadding - MIN_TABLE_CELL_HORIZONTAL_PADDING_PX)
        / (defaultPadding.horizontal - MIN_TABLE_CELL_HORIZONTAL_PADDING_PX);
    const nextVerticalPadding = Math.max(
      MIN_TABLE_CELL_VERTICAL_PADDING_PX,
      MIN_TABLE_CELL_VERTICAL_PADDING_PX
        + ((defaultPadding.vertical - MIN_TABLE_CELL_VERTICAL_PADDING_PX) * paddingReductionRatio),
    );

    setPreviewTablePadding(table, nextHorizontalPadding, nextVerticalPadding);

    if (!isPreviewTableOverflowing(table)) {
      return;
    }
  }

  setPreviewTablePadding(
    table,
    MIN_TABLE_CELL_HORIZONTAL_PADDING_PX,
    MIN_TABLE_CELL_VERTICAL_PADDING_PX,
  );

  if (!isPreviewTableOverflowing(table)) {
    return;
  }

  for (let fontScale = 1 - TABLE_FONT_SCALE_STEP; fontScale >= MIN_TABLE_FONT_SCALE; fontScale -= TABLE_FONT_SCALE_STEP) {
    setPreviewTableFontScale(table, fontScale);

    if (!isPreviewTableOverflowing(table)) {
      return;
    }
  }

  setPreviewTableFontScale(table, MIN_TABLE_FONT_SCALE);
}

function MarkdownPreviewComponent({
  activeSourceLine = null,
  displayMode,
  enableInteractiveViewportNavigation = false,
  html,
  maximumZoomScale = DEFAULT_MAX_PREVIEW_ZOOM_SCALE,
  minimumZoomScale = MIN_A4_SCALE,
  onOpenExternalLink,
  onPreviewContextMenu,
  onSourceLineDoubleClick,
  onZoomScaleChange,
  pageHtmls,
  zoomScale = 1,
}: MarkdownPreviewProps) {
  const previewViewportRef = useRef<HTMLElement | null>(null);
  const lastCursorTargetRef = useRef<HTMLElement | null>(null);
  const pendingViewportZoomAnchorRef = useRef<{
    readonly previousDisplayScale: number;
    readonly nextDisplayScale: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
    readonly viewportOffsetX: number;
    readonly viewportOffsetY: number;
  } | null>(null);
  const panPointerStateRef = useRef<{
    readonly pointerId: number;
    readonly startClientX: number;
    readonly startClientY: number;
    readonly startScrollLeft: number;
    readonly startScrollTop: number;
  } | null>(null);
  const [a4FitScale, setA4FitScale] = useState(1);
  const [isViewportPanning, setIsViewportPanning] = useState(false);

  const normalizedPageHtmls = useMemo(
    () => (pageHtmls !== undefined && pageHtmls.length > 0 ? [...pageHtmls] : [html]),
    [html, pageHtmls],
  );

  const clearViewportPan = useCallback((previewViewport?: HTMLElement) => {
    const viewport = previewViewport ?? previewViewportRef.current;

    if (viewport !== null && panPointerStateRef.current !== null && viewport.hasPointerCapture(panPointerStateRef.current.pointerId)) {
      viewport.releasePointerCapture(panPointerStateRef.current.pointerId);
    }

    panPointerStateRef.current = null;
    setIsViewportPanning(false);
  }, []);

  const handlePreviewViewportRef = useCallback((node: HTMLElement | null) => {
    previewViewportRef.current = node;
  }, []);

  const interactiveViewportNavigationEnabled = enableInteractiveViewportNavigation && onZoomScaleChange !== undefined;

  const handlePreviewDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (onSourceLineDoubleClick === undefined) {
      return;
    }

    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    const eventTarget = resolveEventTargetElement(event.target);

    if (eventTarget === null) {
      return;
    }

    const previewTarget = eventTarget.closest<HTMLElement>("[data-source-line-start][data-source-line-end]");

    if (previewTarget === null) {
      return;
    }

    const sourceLine = resolveDoubleClickSourceLine(
      previewViewport,
      previewTarget,
      event.clientX,
      event.clientY,
    );

    if (sourceLine === null) {
      return;
    }

    onSourceLineDoubleClick(sourceLine);
  }, [onSourceLineDoubleClick]);

  const handlePreviewClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (onOpenExternalLink === undefined) {
      return;
    }

    const eventTarget = resolveEventTargetElement(event.target);

    if (eventTarget === null) {
      return;
    }

    const anchor = eventTarget.closest<HTMLAnchorElement>("a[href]");

    if (anchor === null) {
      return;
    }

    const externalLink = resolveExternalLink(anchor);

    if (externalLink === null) {
      return;
    }

    event.preventDefault();
    onOpenExternalLink(externalLink);
  }, [onOpenExternalLink]);

  const handlePreviewContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (onPreviewContextMenu === undefined) {
      return;
    }

    clearViewportPan();
    event.preventDefault();
    onPreviewContextMenu(event.clientX, event.clientY);
  }, [clearViewportPan, onPreviewContextMenu]);

  const normalizedZoomScale = useMemo(
    () => clamp(zoomScale, minimumZoomScale, maximumZoomScale),
    [maximumZoomScale, minimumZoomScale, zoomScale],
  );

  const effectiveA4Scale = useMemo(
    () => Math.max(MIN_A4_SCALE, a4FitScale * normalizedZoomScale),
    [a4FitScale, normalizedZoomScale],
  );

  const currentDisplayScale = useMemo(
    () => (displayMode === "a4" ? effectiveA4Scale : normalizedZoomScale),
    [displayMode, effectiveA4Scale, normalizedZoomScale],
  );

  const a4PageFrameStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX * effectiveA4Scale}px`,
      minHeight: `${A4_PAGE_HEIGHT_PX * effectiveA4Scale}px`,
    } as CSSProperties),
    [effectiveA4Scale],
  );

  const a4PageStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX}px`,
      minHeight: `${A4_PAGE_HEIGHT_PX}px`,
      padding: `${A4_MARGIN_TOP_PX}px ${A4_MARGIN_RIGHT_PX}px ${A4_MARGIN_BOTTOM_PX}px ${A4_MARGIN_LEFT_PX}px`,
      position: "relative",
      top: 0,
      left: 0,
      overflow: "visible",
      zoom: effectiveA4Scale,
    } as CSSProperties),
    [effectiveA4Scale],
  );

  const standardPreviewContentStyle = useMemo(
    () => ({ zoom: normalizedZoomScale } as CSSProperties),
    [normalizedZoomScale],
  );

  useLayoutEffect(() => {
    if (displayMode !== "a4") {
      return;
    }

    const previewBody = previewViewportRef.current;

    if (previewBody === null) {
      return;
    }

    let animationFrameId: number | null = null;

    const updateA4Scale = () => {
      const previewBodyStyle = window.getComputedStyle(previewBody);
      const paddingX = Number.parseFloat(previewBodyStyle.paddingLeft) + Number.parseFloat(previewBodyStyle.paddingRight);
      const availableWidth = Math.max(0, previewBody.clientWidth - paddingX);
      const nextScale = Math.max(
        MIN_A4_SCALE,
        availableWidth / A4_PAGE_WIDTH_PX,
      );

      setA4FitScale((currentScale) => (Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale));
    };

    updateA4Scale();

    const resizeObserver = new ResizeObserver(() => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        updateA4Scale();
      });
    });

    resizeObserver.observe(previewBody);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [displayMode]);

  useLayoutEffect(() => {
    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    let animationFrameId: number | null = null;

    const fitPreviewTables = () => {
      for (const previewTable of previewViewport.querySelectorAll<HTMLTableElement>("table")) {
        fitPreviewTable(previewTable);
      }
    };

    const schedulePreviewTableFit = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        fitPreviewTables();
      });
    };

    schedulePreviewTableFit();

    const resizeObserver = new ResizeObserver(() => {
      schedulePreviewTableFit();
    });

    resizeObserver.observe(previewViewport);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [currentDisplayScale, html, normalizedPageHtmls]);

  useLayoutEffect(() => {
    const previewViewport = previewViewportRef.current;
    const pendingViewportZoomAnchor = pendingViewportZoomAnchorRef.current;

    if (previewViewport === null || pendingViewportZoomAnchor === null) {
      return;
    }

    pendingViewportZoomAnchorRef.current = null;

    const contentAnchorX = (pendingViewportZoomAnchor.scrollLeft + pendingViewportZoomAnchor.viewportOffsetX) / pendingViewportZoomAnchor.previousDisplayScale;
    const contentAnchorY = (pendingViewportZoomAnchor.scrollTop + pendingViewportZoomAnchor.viewportOffsetY) / pendingViewportZoomAnchor.previousDisplayScale;
    const maxScrollLeft = Math.max(0, previewViewport.scrollWidth - previewViewport.clientWidth);
    const maxScrollTop = Math.max(0, previewViewport.scrollHeight - previewViewport.clientHeight);
    const nextScrollLeft = clamp(
      (contentAnchorX * pendingViewportZoomAnchor.nextDisplayScale) - pendingViewportZoomAnchor.viewportOffsetX,
      0,
      maxScrollLeft,
    );
    const nextScrollTop = clamp(
      (contentAnchorY * pendingViewportZoomAnchor.nextDisplayScale) - pendingViewportZoomAnchor.viewportOffsetY,
      0,
      maxScrollTop,
    );

    previewViewport.scrollTo({
      left: nextScrollLeft,
      top: nextScrollTop,
      behavior: "auto",
    });
  }, [currentDisplayScale]);

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (!interactiveViewportNavigationEnabled || !event.ctrlKey) {
      return;
    }

    const nextZoomScale = clamp(
      normalizedZoomScale * Math.exp(-event.deltaY * 0.001),
      minimumZoomScale,
      maximumZoomScale,
    );

    if (Math.abs(nextZoomScale - normalizedZoomScale) < 0.001) {
      return;
    }

    event.preventDefault();

    const previewViewport = event.currentTarget;
    const previewViewportRect = previewViewport.getBoundingClientRect();
    const nextDisplayScale = displayMode === "a4"
      ? Math.max(MIN_A4_SCALE, a4FitScale * nextZoomScale)
      : nextZoomScale;

    pendingViewportZoomAnchorRef.current = {
      previousDisplayScale: currentDisplayScale,
      nextDisplayScale,
      scrollLeft: previewViewport.scrollLeft,
      scrollTop: previewViewport.scrollTop,
      viewportOffsetX: event.clientX - previewViewportRect.left,
      viewportOffsetY: event.clientY - previewViewportRect.top,
    };

    onZoomScaleChange(nextZoomScale);
  }, [a4FitScale, currentDisplayScale, displayMode, interactiveViewportNavigationEnabled, maximumZoomScale, minimumZoomScale, normalizedZoomScale, onZoomScaleChange]);

  const handlePreviewPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enableInteractiveViewportNavigation || event.button !== 0 || !event.isPrimary || event.ctrlKey) {
      return;
    }

    const eventTarget = resolveEventTargetElement(event.target);

    if (eventTarget === null || eventTarget.closest("a, button, input, textarea, select") !== null) {
      return;
    }

    panPointerStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      startScrollTop: event.currentTarget.scrollTop,
    };
    setIsViewportPanning(false);
  }, [enableInteractiveViewportNavigation]);

  const handlePreviewPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const panPointerState = panPointerStateRef.current;

    if (panPointerState === null || panPointerState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panPointerState.startClientX;
    const deltaY = event.clientY - panPointerState.startClientY;

    if (!isViewportPanning && Math.abs(deltaX) < INTERACTIVE_PREVIEW_PAN_THRESHOLD_PX && Math.abs(deltaY) < INTERACTIVE_PREVIEW_PAN_THRESHOLD_PX) {
      return;
    }

    if (!isViewportPanning) {
      event.preventDefault();

      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      window.getSelection()?.removeAllRanges();
      setIsViewportPanning(true);
    }

    event.currentTarget.scrollTo({
      left: panPointerState.startScrollLeft - deltaX,
      top: panPointerState.startScrollTop - deltaY,
      behavior: "auto",
    });
  }, [isViewportPanning]);

  const handlePreviewPointerEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (panPointerStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    clearViewportPan(event.currentTarget);
  }, [clearViewportPan]);

  useEffect(() => {
    if (enableInteractiveViewportNavigation) {
      return;
    }

    clearViewportPan();
  }, [clearViewportPan, enableInteractiveViewportNavigation]);

  useEffect(() => {
    const lastCursorTarget = lastCursorTargetRef.current;

    if (lastCursorTarget !== null) {
      lastCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
      lastCursorTargetRef.current = null;
    }

    if (activeSourceLine === null) {
      return;
    }

    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    const nextCursorTarget = findPreviewCursorTarget(previewViewport, Math.max(0, activeSourceLine - 1));

    if (nextCursorTarget === null) {
      return;
    }

    nextCursorTarget.classList.add(PREVIEW_CURSOR_TARGET_CLASS_NAME);
    lastCursorTargetRef.current = nextCursorTarget;

    const cursorTargetLineRange = getPreviewCursorTargetLineRange(nextCursorTarget);
    const previewBlockInfo = getPreviewBlockInfo(previewViewport, nextCursorTarget);

    if (cursorTargetLineRange === null || previewBlockInfo === null) {
      return () => {
        nextCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
      };
    }

    const cursorTargetOffsetTop = previewBlockInfo.rect.top - previewBlockInfo.containerRect.top + previewViewport.scrollTop;
    const cursorTargetOffsetBottom = previewBlockInfo.rect.bottom - previewBlockInfo.containerRect.top + previewViewport.scrollTop;
    const cursorTargetLineProgress = getSourceLineProgress(cursorTargetLineRange, activeSourceLine - 1);
    const cursorAnchorOffsetTop =
      cursorTargetOffsetTop + ((cursorTargetOffsetBottom - cursorTargetOffsetTop) * cursorTargetLineProgress);
    const viewportAnchorOffsetTop = Math.max(
      PREVIEW_CURSOR_SCROLL_PADDING_PX,
      previewViewport.clientHeight * PREVIEW_CURSOR_VIEWPORT_ANCHOR_RATIO,
    );
    const maxScrollTop = Math.max(0, previewViewport.scrollHeight - previewViewport.clientHeight);
    const nextScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, cursorAnchorOffsetTop - viewportAnchorOffsetTop),
    );

    if (Math.abs(previewViewport.scrollTop - nextScrollTop) > 2) {
      previewViewport.scrollTo({
        top: nextScrollTop,
        behavior: "auto",
      });
    }

    return () => {
      nextCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
    };
  }, [activeSourceLine, currentDisplayScale, html, normalizedPageHtmls]);

  if (displayMode === "a4") {
    return (
      <section className="section section--preview" aria-label="Preview">
        <div
          ref={handlePreviewViewportRef}
          className="preview-section__body preview-section__body--a4"
          data-interactive-pan={enableInteractiveViewportNavigation ? "true" : "false"}
          data-panning={isViewportPanning ? "true" : "false"}
          onClick={handlePreviewClick}
          onContextMenu={handlePreviewContextMenu}
          onDoubleClick={handlePreviewDoubleClick}
          onPointerCancel={handlePreviewPointerEnd}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerEnd}
          onWheel={handlePreviewWheel}
        >
          <div className="preview-section__page-stack">
            {normalizedPageHtmls.map((pageHtml, index) => (
              <div key={`${index}-${pageHtml.length}`} className="preview-section__page-frame" style={a4PageFrameStyle}>
                <article
                  className="preview-section__page markdown-body markdown-body--a4"
                  style={a4PageStyle}
                  dangerouslySetInnerHTML={{ __html: pageHtml }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section section--preview" aria-label="Preview">
      <div
        ref={handlePreviewViewportRef}
        className="preview-section__body"
        data-interactive-pan={enableInteractiveViewportNavigation ? "true" : "false"}
        data-panning={isViewportPanning ? "true" : "false"}
        onClick={handlePreviewClick}
        onContextMenu={handlePreviewContextMenu}
        onDoubleClick={handlePreviewDoubleClick}
        onPointerCancel={handlePreviewPointerEnd}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerEnd}
        onWheel={handlePreviewWheel}
      >
        <article
          className="preview-section__standard-content markdown-body"
          style={standardPreviewContentStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);
