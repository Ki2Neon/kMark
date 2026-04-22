import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  A4_CONTENT_HEIGHT_PX,
  A4_CONTENT_WIDTH_PX,
  A4_MARGIN_LEFT_MM,
  A4_MARGIN_TOP_MM,
  A4_PAGE_HEIGHT_PX,
  A4_PAGE_WIDTH_PX,
  A4_VIEWPORT_OVERSCAN_PX,
  CSS_MM_TO_PX,
  type PreviewDisplayMode,
  type RenderedA4PreviewPage,
} from "../../domain/preview";

const A4_MARGIN_TOP_PX = A4_MARGIN_TOP_MM * CSS_MM_TO_PX;
const A4_MARGIN_LEFT_PX = A4_MARGIN_LEFT_MM * CSS_MM_TO_PX;
const MIN_A4_SCALE = 0.1;
const DEFAULT_MAX_PREVIEW_ZOOM_SCALE = 2;
const INTERACTIVE_PREVIEW_PAN_THRESHOLD_PX = 3;
const PREVIEW_CURSOR_TARGET_CLASS_NAME = "preview-section__cursor-target";
const PREVIEW_CURSOR_SCROLL_PADDING_PX = 72;
const PREVIEW_CURSOR_VIEWPORT_ANCHOR_RATIO = 0.35;
const PREVIEW_MEASURE_SEGMENT_SELECTOR = "[data-a4-measure-segment='true']";

type MarkdownPreviewProps = {
  readonly activeSourceLine?: number | null;
  readonly displayMode: PreviewDisplayMode;
  readonly enableInteractiveViewportNavigation?: boolean;
  readonly html: string;
  readonly maximumZoomScale?: number;
  readonly minimumZoomScale?: number;
  readonly onPreviewContextMenu?: (clientX: number, clientY: number) => void;
  readonly onRenderedA4PagesChange?: (pages: readonly RenderedA4PreviewPage[]) => void;
  readonly onSourceLineDoubleClick?: (lineNumber: number) => void;
  readonly onZoomScaleChange?: (zoomScale: number) => void;
  readonly pageHtmls?: readonly string[];
  readonly zoomScale?: number;
};

type PreviewFragmentInfo = {
  readonly containerRect: DOMRect;
  readonly rect: DOMRect;
  readonly rectCount: number;
  readonly rectIndex: number;
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

function getPreviewFragmentInfo(
  previewViewport: HTMLElement,
  previewBlock: HTMLElement,
  clickPoint?: { readonly clientX: number; readonly clientY: number },
): PreviewFragmentInfo | null {
  const rects = Array.from(previewBlock.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);

  if (rects.length === 0) {
    return null;
  }

  const pageViewport = previewBlock.closest<HTMLElement>(".preview-section__page-viewport");
  const containerRect = pageViewport?.getBoundingClientRect() ?? previewViewport.getBoundingClientRect();

  if (clickPoint !== undefined) {
    const clickedRectIndex = rects.findIndex((rect) => isPointInsideRect(rect, clickPoint.clientX, clickPoint.clientY));

    if (clickedRectIndex !== -1) {
      return {
        containerRect,
        rect: rects[clickedRectIndex],
        rectCount: rects.length,
        rectIndex: clickedRectIndex,
        visibilityScore: getVisibleAreaWithinContainer(rects[clickedRectIndex], containerRect),
      };
    }
  }

  let bestRectIndex = 0;
  let bestVisibilityScore = Number.NEGATIVE_INFINITY;

  for (const [rectIndex, rect] of rects.entries()) {
    const visibilityScore = getVisibleAreaWithinContainer(rect, containerRect);

    if (visibilityScore > bestVisibilityScore) {
      bestVisibilityScore = visibilityScore;
      bestRectIndex = rectIndex;
    }
  }

  return {
    containerRect,
    rect: rects[bestRectIndex],
    rectCount: rects.length,
    rectIndex: bestRectIndex,
    visibilityScore: bestVisibilityScore,
  };
}

function getSourceLineProgress(sourceLineRange: { start: number; end: number }, activeSourceLine: number): number {
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

function getPreviewBlockVisibilityScore(previewViewport: HTMLElement, previewBlock: HTMLElement): number {
  const fragmentInfo = getPreviewFragmentInfo(previewViewport, previewBlock);

  if (fragmentInfo === null) {
    return 0;
  }

  return fragmentInfo.visibilityScore;
}

function findPreviewCursorTarget(previewViewport: HTMLElement, activeSourceLine: number): HTMLElement | null {
  const previewBlocks = Array.from(previewViewport.querySelectorAll<HTMLElement>("[data-source-line-start][data-source-line-end]"));
  let containingBlock: { element: HTMLElement; fragmentDistance: number; span: number; visibilityScore: number } | null = null;
  let nearestBlock: { element: HTMLElement; distance: number; visibilityScore: number } | null = null;

  for (const previewBlock of previewBlocks) {
    const sourceLineStart = Number.parseInt(previewBlock.dataset.sourceLineStart ?? "", 10);
    const sourceLineEnd = Number.parseInt(previewBlock.dataset.sourceLineEnd ?? "", 10);

    if (!Number.isFinite(sourceLineStart) || !Number.isFinite(sourceLineEnd)) {
      continue;
    }

    if (activeSourceLine >= sourceLineStart && activeSourceLine <= sourceLineEnd) {
      const span = sourceLineEnd - sourceLineStart;
      const fragmentInfo = getPreviewFragmentInfo(previewViewport, previewBlock);

      if (fragmentInfo === null) {
        continue;
      }

      const expectedFragmentIndex = fragmentInfo.rectCount <= 1
        ? 0
        : Math.round(getSourceLineProgress({ start: sourceLineStart, end: sourceLineEnd }, activeSourceLine) * (fragmentInfo.rectCount - 1));
      const fragmentDistance = Math.abs(fragmentInfo.rectIndex - expectedFragmentIndex);
      const visibilityScore = fragmentInfo.visibilityScore;

      if (
        containingBlock === null
        || span < containingBlock.span
        || (span === containingBlock.span && fragmentDistance < containingBlock.fragmentDistance)
        || (
          span === containingBlock.span
          && fragmentDistance === containingBlock.fragmentDistance
          && visibilityScore > containingBlock.visibilityScore
        )
      ) {
        containingBlock = {
          element: previewBlock,
          fragmentDistance,
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

function getPreviewCursorTargetLineRange(previewTarget: HTMLElement): { start: number; end: number } | null {
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

function createRenderedA4PagesFromSegments(pageHtmls: readonly string[]): readonly RenderedA4PreviewPage[] {
  return pageHtmls.map((pageHtml, index) => ({
    html: pageHtml,
    key: `${index}-0`,
    offsetPx: 0,
  }));
}

function areRenderedA4PagesEqual(currentPages: readonly RenderedA4PreviewPage[], nextPages: readonly RenderedA4PreviewPage[]): boolean {
  return currentPages.length === nextPages.length && currentPages.every((currentPage, index) => {
    const nextPage = nextPages[index];

    return currentPage.html === nextPage?.html
      && currentPage.key === nextPage.key
      && Math.abs(currentPage.offsetPx - (nextPage?.offsetPx ?? Number.NaN)) < 0.5;
  });
}

function paginateMeasuredSegment(measureSegment: HTMLElement, segmentHtml: string, segmentIndex: number): readonly RenderedA4PreviewPage[] {
  const measuredWidth = Math.max(A4_CONTENT_WIDTH_PX, measureSegment.scrollWidth);
  const pageCount = Math.max(1, Math.round(measuredWidth / A4_CONTENT_WIDTH_PX));

  return Array.from({ length: pageCount }, (_, pageIndex) => ({
    html: segmentHtml,
    key: `${segmentIndex}-${pageIndex}`,
    offsetPx: Math.round(pageIndex * A4_CONTENT_WIDTH_PX),
  }));
}

function resolveDoubleClickSourceLine(
  previewViewport: HTMLElement,
  previewTarget: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const previewTargetLineRange = getPreviewCursorTargetLineRange(previewTarget);

  if (previewTargetLineRange === null) {
    return null;
  }

  const fragmentInfo = getPreviewFragmentInfo(previewViewport, previewTarget, { clientX, clientY });

  if (fragmentInfo === null) {
    return null;
  }

  const fragmentProgress = fragmentInfo.rect.height <= 0
    ? 0.5
    : clamp((clientY - fragmentInfo.rect.top) / fragmentInfo.rect.height, 0, 1);
  const overallProgress = fragmentInfo.rectCount <= 1
    ? fragmentProgress
    : (fragmentInfo.rectIndex + fragmentProgress) / fragmentInfo.rectCount;
  const zeroBasedLineNumber = previewTargetLineRange.end <= previewTargetLineRange.start
    ? previewTargetLineRange.start
    : Math.round(previewTargetLineRange.start + ((previewTargetLineRange.end - previewTargetLineRange.start) * overallProgress));

  return zeroBasedLineNumber + 1;
}

function MarkdownPreviewComponent({
  activeSourceLine = null,
  displayMode,
  enableInteractiveViewportNavigation = false,
  html,
  maximumZoomScale = DEFAULT_MAX_PREVIEW_ZOOM_SCALE,
  minimumZoomScale = MIN_A4_SCALE,
  onPreviewContextMenu,
  onRenderedA4PagesChange,
  onSourceLineDoubleClick,
  onZoomScaleChange,
  pageHtmls,
  zoomScale = 1,
}: MarkdownPreviewProps) {
  const a4MeasureContainerRef = useRef<HTMLDivElement | null>(null);
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
  const [renderedA4Pages, setRenderedA4Pages] = useState<readonly RenderedA4PreviewPage[]>(() => createRenderedA4PagesFromSegments(
    pageHtmls !== undefined && pageHtmls.length > 0 ? [...pageHtmls] : [html],
  ));

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

    const sourceLine = resolveDoubleClickSourceLine(previewViewport, previewTarget, event.clientX, event.clientY);

    if (sourceLine === null) {
      return;
    }

    onSourceLineDoubleClick(sourceLine);
  }, [onSourceLineDoubleClick]);

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

  const a4PageFrameStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX * effectiveA4Scale}px`,
      height: `${A4_PAGE_HEIGHT_PX * effectiveA4Scale}px`,
    } as CSSProperties),
    [effectiveA4Scale],
  );

  const a4PageStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX}px`,
      height: `${A4_PAGE_HEIGHT_PX}px`,
      transform: `scale(${effectiveA4Scale})`,
    } as CSSProperties),
    [effectiveA4Scale],
  );

  const standardPreviewContentStyle = useMemo(
    () => ({ zoom: normalizedZoomScale } as CSSProperties),
    [normalizedZoomScale],
  );

  const currentDisplayScale = useMemo(
    () => (displayMode === "a4" ? effectiveA4Scale : normalizedZoomScale),
    [displayMode, effectiveA4Scale, normalizedZoomScale],
  );

  const a4PageViewportStyle = useMemo(
    () => ({
      top: `${A4_MARGIN_TOP_PX}px`,
      left: `${A4_MARGIN_LEFT_PX}px`,
      width: `${A4_CONTENT_WIDTH_PX + A4_VIEWPORT_OVERSCAN_PX}px`,
      height: `${A4_CONTENT_HEIGHT_PX}px`,
    } as CSSProperties),
    [],
  );

  const a4MeasureContainerStyle = useMemo(
    () => ({ width: `${A4_CONTENT_WIDTH_PX}px` } as CSSProperties),
    [],
  );

  const a4MeasureSegmentStyle = useMemo(
    () => ({ width: `${A4_CONTENT_WIDTH_PX}px` } as CSSProperties),
    [],
  );

  const a4FlowStyle = useMemo(
    () => ({
      width: `${A4_CONTENT_WIDTH_PX}px`,
      height: `${A4_CONTENT_HEIGHT_PX}px`,
      columnWidth: `${A4_CONTENT_WIDTH_PX}px`,
      columnGap: "0px",
      columnFill: "auto",
    } as CSSProperties),
    [],
  );

  useEffect(() => {
    if (onRenderedA4PagesChange === undefined || displayMode !== "a4") {
      return;
    }

    onRenderedA4PagesChange(renderedA4Pages);
  }, [displayMode, onRenderedA4PagesChange, renderedA4Pages]);

  useLayoutEffect(() => {
    if (displayMode !== "a4") {
      setRenderedA4Pages(createRenderedA4PagesFromSegments(normalizedPageHtmls));
      return;
    }

    const measureContainer = a4MeasureContainerRef.current;

    if (measureContainer === null) {
      return;
    }

    let animationFrameId: number | null = null;

    const updateRenderedPages = () => {
      const measuredSegments = Array.from(measureContainer.querySelectorAll<HTMLElement>(PREVIEW_MEASURE_SEGMENT_SELECTOR));
      const nextRenderedPages = measuredSegments.flatMap((measuredSegment, index) => paginateMeasuredSegment(
        measuredSegment,
        normalizedPageHtmls[index] ?? "",
        index,
      ));

      setRenderedA4Pages((currentRenderedPages) => {
        if (areRenderedA4PagesEqual(currentRenderedPages, nextRenderedPages)) {
          return currentRenderedPages;
        }

        return nextRenderedPages;
      });
    };

    const scheduleRenderedPageUpdate = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        updateRenderedPages();
      });
    };

    scheduleRenderedPageUpdate();

    const resizeObserver = new ResizeObserver(() => {
      scheduleRenderedPageUpdate();
    });

    resizeObserver.observe(measureContainer);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [displayMode, normalizedPageHtmls]);

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
    const fragmentInfo = getPreviewFragmentInfo(previewViewport, nextCursorTarget);

    if (cursorTargetLineRange === null || fragmentInfo === null) {
      return () => {
        nextCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
      };
    }

    const previewViewportRect = previewViewport.getBoundingClientRect();
    const cursorTargetOffsetTop = fragmentInfo.rect.top - previewViewportRect.top + previewViewport.scrollTop;
    const cursorTargetOffsetBottom = fragmentInfo.rect.bottom - previewViewportRect.top + previewViewport.scrollTop;
    const cursorTargetLineProgress = getSourceLineProgress(cursorTargetLineRange, activeSourceLine - 1);
    const fragmentLocalProgress = fragmentInfo.rectCount <= 1
      ? cursorTargetLineProgress
      : clamp((cursorTargetLineProgress * fragmentInfo.rectCount) - fragmentInfo.rectIndex, 0, 1);
    const cursorAnchorOffsetTop = cursorTargetOffsetTop + ((cursorTargetOffsetBottom - cursorTargetOffsetTop) * fragmentLocalProgress);
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
  }, [activeSourceLine, displayMode, html, renderedA4Pages]);

  if (displayMode === "a4") {
    return (
      <section className="section section--preview" aria-label="Preview">
        <div
          ref={handlePreviewViewportRef}
          className="preview-section__body preview-section__body--a4"
          data-interactive-pan={enableInteractiveViewportNavigation ? "true" : "false"}
          data-panning={isViewportPanning ? "true" : "false"}
          onContextMenu={handlePreviewContextMenu}
          onDoubleClick={handlePreviewDoubleClick}
          onPointerCancel={handlePreviewPointerEnd}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerEnd}
          onWheel={handlePreviewWheel}
        >
          <div className="preview-section__page-stack">
            {renderedA4Pages.map((renderedPage) => (
              <div key={renderedPage.key} className="preview-section__page-frame" style={a4PageFrameStyle}>
                <article
                  className="preview-section__page"
                  style={a4PageStyle}
                >
                  <div className="preview-section__page-viewport" style={a4PageViewportStyle}>
                    <div
                      className="preview-section__page-content markdown-body markdown-body--a4 markdown-body--a4-flow"
                      style={{ ...a4FlowStyle, left: `-${renderedPage.offsetPx}px` }}
                      dangerouslySetInnerHTML={{ __html: renderedPage.html }}
                    />
                  </div>
                </article>
              </div>
            ))}
          </div>
        </div>

        <div ref={a4MeasureContainerRef} className="preview-section__measure" style={a4MeasureContainerStyle} aria-hidden="true">
          {normalizedPageHtmls.map((pageHtml, index) => (
            <article
              key={index}
              className="preview-section__measure-page markdown-body markdown-body--a4 markdown-body--a4-flow"
              data-a4-measure-segment="true"
              style={{ ...a4MeasureSegmentStyle, ...a4FlowStyle }}
              dangerouslySetInnerHTML={{ __html: pageHtml }}
            />
          ))}
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