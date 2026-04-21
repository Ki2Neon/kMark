import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
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
const PREVIEW_CURSOR_TARGET_CLASS_NAME = "preview-section__cursor-target";
const PREVIEW_CURSOR_SCROLL_PADDING_PX = 72;
const PREVIEW_CURSOR_VIEWPORT_ANCHOR_RATIO = 0.35;
const PREVIEW_MEASURE_SEGMENT_SELECTOR = "[data-a4-measure-segment='true']";

type MarkdownPreviewProps = {
  readonly activeSourceLine?: number | null;
  readonly displayMode: PreviewDisplayMode;
  readonly html: string;
  readonly onRenderedA4PagesChange?: (pages: readonly RenderedA4PreviewPage[]) => void;
  readonly onSourceLineDoubleClick?: (lineNumber: number) => void;
  readonly pageHtmls?: readonly string[];
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
  html,
  onRenderedA4PagesChange,
  onSourceLineDoubleClick,
  pageHtmls,
}: MarkdownPreviewProps) {
  const a4MeasureContainerRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLElement | null>(null);
  const lastCursorTargetRef = useRef<HTMLElement | null>(null);
  const [a4Scale, setA4Scale] = useState(1);
  const [renderedA4Pages, setRenderedA4Pages] = useState<readonly RenderedA4PreviewPage[]>(() => createRenderedA4PagesFromSegments(
    pageHtmls !== undefined && pageHtmls.length > 0 ? [...pageHtmls] : [html],
  ));

  const normalizedPageHtmls = useMemo(
    () => (pageHtmls !== undefined && pageHtmls.length > 0 ? [...pageHtmls] : [html]),
    [html, pageHtmls],
  );

  const handlePreviewViewportRef = useCallback((node: HTMLElement | null) => {
    previewViewportRef.current = node;
  }, []);

  const handlePreviewDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (onSourceLineDoubleClick === undefined) {
      return;
    }

    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    const eventTarget = event.target;

    if (!(eventTarget instanceof HTMLElement)) {
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

  const a4PageFrameStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX * a4Scale}px`,
      height: `${A4_PAGE_HEIGHT_PX * a4Scale}px`,
    } as CSSProperties),
    [a4Scale],
  );

  const a4PageStyle = useMemo(
    () => ({
      width: `${A4_PAGE_WIDTH_PX}px`,
      height: `${A4_PAGE_HEIGHT_PX}px`,
      transform: `scale(${a4Scale})`,
    } as CSSProperties),
    [a4Scale],
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
      const paddingY = Number.parseFloat(previewBodyStyle.paddingTop) + Number.parseFloat(previewBodyStyle.paddingBottom);
      const nextScale = Math.max(
        MIN_A4_SCALE,
        Math.min(
          (previewBody.clientWidth - paddingX) / A4_PAGE_WIDTH_PX,
          (previewBody.clientHeight - paddingY) / A4_PAGE_HEIGHT_PX,
        ),
      );

      setA4Scale((currentScale) => (Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale));
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
        <div ref={handlePreviewViewportRef} className="preview-section__body preview-section__body--a4" onDoubleClick={handlePreviewDoubleClick}>
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
      <article
        ref={handlePreviewViewportRef}
        className="preview-section__body markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
        onDoubleClick={handlePreviewDoubleClick}
      />
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);