import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent as ReactFormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent as ReactUIEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  createKmarkModelViewerScope,
  persistKmarkModelViewerSnapshots,
  preserveReusableKmarkModelViewers,
  type ModelViewerScope,
} from "../../adapters/browser/browserModelRenderer";
import {
  A4_PAGE_WIDTH_MM,
  CSS_MM_TO_PX,
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type PageChromeConfig,
  type PageChromeRegionConfig,
  type PageNumberConfig,
  type PageNumberPosition,
  type PageNumberStyle,
  type PageStyle,
  type PreviewDisplayMode,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";

const A4_PAGE_WIDTH_FOR_FIT_PX = A4_PAGE_WIDTH_MM * CSS_MM_TO_PX;
const MIN_A4_SCALE = 0.1;
const DEFAULT_MAX_PREVIEW_ZOOM_SCALE = 2;
const INTERACTIVE_PREVIEW_PAN_THRESHOLD_PX = 3;
const PREVIEW_CURSOR_TARGET_CLASS_NAME = "preview-section__cursor-target";
const PREVIEW_CURSOR_SCROLL_PADDING_PX = 72;
const PREVIEW_CURSOR_VIEWPORT_ANCHOR_RATIO = 0.35;
const A4_PAGE_NAVIGATION_SCROLL_MARGIN_PX = 16;
const KMARK_VIDEO_FRAME_CLASS_NAME = "kmark-video-frame";
const KMARK_VIDEO_ERROR_CLASS_NAME = "kmark-video-error";
const KMARK_VIDEO_POSTER_IMAGE_CLASS_NAME = "kmark-video-poster-image";
const KMARK_MODEL_VIEWER_CLASS_NAME = "kmark-model-viewer";
const KMARK_MODEL_ERROR_CLASS_NAME = "kmark-model-error";
const PREVIEW_INTERACTIVE_ELEMENT_SELECTOR = `a, button, input, textarea, select, video, .${KMARK_MODEL_VIEWER_CLASS_NAME}`;
const KMARK_VIDEO_FAILED_STATE = "failed";
const KMARK_VIDEO_POSTER_IMAGE_HIDDEN_STATE = "hidden";
const VIDEO_HAVE_METADATA_READY_STATE = 1;
const DEFAULT_TABLE_CELL_HORIZONTAL_PADDING_PX = 12;
const DEFAULT_TABLE_CELL_VERTICAL_PADDING_PX = 10.4;
const MIN_TABLE_CELL_HORIZONTAL_PADDING_PX = 4;
const MIN_TABLE_CELL_VERTICAL_PADDING_PX = 4;
const MIN_TABLE_FONT_SCALE = 0.74;
const TABLE_FONT_SCALE_STEP = 0.02;
const TABLE_OVERFLOW_TOLERANCE_PX = 1;
const A4_PAGINATION_OVERFLOW_TOLERANCE_PX = 1;
const A4_PAGINATION_SOURCE_SEPARATOR = "\x1f";
const A4_PAGINATION_HEADING_TAG_NAMES = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const A4_PAGINATION_INLINE_SPLIT_TAG_NAMES = new Set(["a", "abbr", "b", "cite", "del", "em", "i", "ins", "mark", "small", "span", "strong", "sub", "sup", "u"]);
const A4_PAGINATION_ATOMIC_INLINE_CLASS_NAMES = new Set([
  KMARK_MODEL_VIEWER_CLASS_NAME,
  KMARK_MODEL_ERROR_CLASS_NAME,
]);
const A4_PAGE_VALIGN_VALUES = new Set(["top", "center", "bottom"]);
const A4_PAGINATION_CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;
const A4_PAGINATION_LONG_TEXT_TOKEN_LENGTH = 24;
const A4_PAGE_FIT_STYLE_FRAGMENT = "--kmark-page-fit-";
const A4_PAGE_FIT_WIDTH_VARIABLE = "--kmark-page-fit-width";
const A4_PAGE_FIT_HEIGHT_VARIABLE = "--kmark-page-fit-height";
const A4_PAGE_FIT_CONTAIN_STYLE_FRAGMENT = "--kmark-page-fit-contain-";
const A4_PAGE_FIT_CONTAIN_WIDTH_VARIABLE = "--kmark-page-fit-contain-width";
const A4_PAGE_FIT_CONTAIN_HEIGHT_VARIABLE = "--kmark-page-fit-contain-height";
const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/iu;
const A4_TOC_ITEM_HEADER_LABEL = "項目名";
const A4_TOC_PAGE_HEADER_LABEL = "ページ番号";
const A4_TOC_INDENT_STEP_EM = 1.25;

type PreviewTableFitMode = "auto" | "off" | "shrink";
type PreviewFitMode = "width" | "page";
type ActiveSourceLineScrollMode = "center" | "none" | "page";

type MarkdownPreviewProps = {
  readonly activeSourceLine?: number | null;
  readonly activeSourceLineScrollMode?: ActiveSourceLineScrollMode;
  readonly defaultPageStyle?: PageStyle;
  readonly defaultTextStyle?: PreviewTextStyle;
  readonly displayMode: PreviewDisplayMode;
  readonly enableInteractiveViewportNavigation?: boolean;
  readonly html: string;
  readonly maximumZoomScale?: number;
  readonly minimumZoomScale?: number;
  readonly onOpenExternalLink?: (url: string) => void;
  readonly onPreviewContextMenu?: (
    clientX: number,
    clientY: number,
    modelViewer: HTMLElement | null,
    modelViewerRoot: HTMLElement,
  ) => void;
  readonly onSourceLineDoubleClick?: (lineNumber: number) => void;
  readonly onZoomScaleChange?: (zoomScale: number) => void;
  readonly pageHtmls?: readonly string[];
  readonly pages?: readonly RenderedPreviewPage[];
  readonly pageTransitionFadeMs?: number;
  readonly previewFitMode?: PreviewFitMode;
  readonly suppressTextSelectionOnDoubleClick?: boolean;
  /** @deprecated Use activeSourceLineScrollMode. */
  readonly followActiveSourceLine?: boolean;
  readonly previewNavigationRequest?: PreviewNavigationRequest | null;
  readonly zoomScale?: number;
};

export type PreviewNavigationRequest = {
  readonly direction: -1 | 1;
  readonly requestId: number;
};

type PreviewBlockInfo = {
  readonly containerRect: DOMRect;
  readonly rect: DOMRect;
  readonly visibilityScore: number;
};

type PreviewTargetCandidate = {
  readonly element: HTMLElement;
  readonly sourceLineEnd: number;
  readonly sourceLineStart: number;
  readonly span: number;
};

type NearestPreviewTargetCandidate = PreviewTargetCandidate & {
  readonly distance: number;
};

type A4PaginationContext = {
  body: HTMLElement;
  frame: HTMLElement;
  maxContentHeight: number;
  maxContentWidth: number;
  pageConfig: PreviewPageConfig;
  pages: RenderedPreviewPage[];
  readonly root: HTMLElement;
};

type A4PageValign = "top" | "center" | "bottom";

type A4PageValignAppendOptions = {
  readonly commitAfter: boolean;
};

type PreviewPageConfig = {
  readonly pageStyle: PageStyle;
  readonly textStyle: PreviewTextStyle;
  readonly pageNumberConfig: PageNumberConfig;
  readonly pageChromeConfig: PageChromeConfig;
};

type NumberedRenderedPreviewPage = RenderedPreviewPage & {
  readonly pageNumberText: string | null;
  readonly tocPageNumberText: string;
};

type PreviewCssProperties = CSSProperties & Record<string, string | number | undefined>;

type A4TocRowElements = {
  readonly label: HTMLElement;
  readonly page: HTMLElement;
  readonly row: HTMLElement;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function arePreviewPagesEqual(left: readonly RenderedPreviewPage[], right: readonly RenderedPreviewPage[]): boolean {
  return left.length === right.length && left.every((leftPage, index) => {
    const rightPage = right[index];

    return rightPage !== undefined
      && leftPage.html === rightPage.html
      && arePageStylesEqual(leftPage.pageStyle, rightPage.pageStyle)
      && arePreviewTextStylesEqual(leftPage.textStyle, rightPage.textStyle)
      && arePageNumberConfigsEqual(leftPage.pageNumberConfig, rightPage.pageNumberConfig)
      && arePageChromeConfigsEqual(leftPage.pageChromeConfig, rightPage.pageChromeConfig);
  });
}

function arePageStylesEqual(left: PageStyle, right: PageStyle): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.marginTop === right.marginTop
    && left.marginRight === right.marginRight
    && left.marginBottom === right.marginBottom
    && left.marginLeft === right.marginLeft;
}

function arePreviewTextStylesEqual(left: PreviewTextStyle, right: PreviewTextStyle): boolean {
  return left.fontSize === right.fontSize
    && left.fontFamily === right.fontFamily
    && left.headingFontFamily === right.headingFontFamily;
}

function arePageNumberConfigsEqual(left: PageNumberConfig, right: PageNumberConfig): boolean {
  return left.position === right.position
    && left.format === right.format
    && left.start === right.start
    && left.reset === right.reset
    && left.count === right.count
    && left.visible === right.visible
    && left.style === right.style
    && left.fontSize === right.fontSize
    && left.color === right.color
    && left.marginTop === right.marginTop
    && left.marginBottom === right.marginBottom
    && left.marginLeft === right.marginLeft
    && left.marginRight === right.marginRight;
}

function arePageChromeRegionConfigsEqual(left: PageChromeRegionConfig, right: PageChromeRegionConfig): boolean {
  return left.enabled === right.enabled
    && left.left === right.left
    && left.center === right.center
    && left.right === right.right
    && left.opacity === right.opacity
    && left.offset === right.offset
    && left.borderSize === right.borderSize
    && left.borderColor === right.borderColor
    && left.borderStyle === right.borderStyle
    && left.fontSize === right.fontSize
    && left.fontFamily === right.fontFamily
    && left.fontColor === right.fontColor
    && left.padding === right.padding;
}

function arePageChromeConfigsEqual(left: PageChromeConfig, right: PageChromeConfig): boolean {
  return arePageChromeRegionConfigsEqual(left.header, right.header)
    && arePageChromeRegionConfigsEqual(left.footer, right.footer);
}

function pageStyleKey(pageStyle: PageStyle): string {
  return [
    pageStyle.width,
    pageStyle.height,
    pageStyle.marginTop,
    pageStyle.marginRight,
    pageStyle.marginBottom,
    pageStyle.marginLeft,
  ].join("|");
}

function previewTextStyleKey(textStyle: PreviewTextStyle): string {
  return [
    textStyle.fontSize,
    textStyle.fontFamily,
    textStyle.headingFontFamily,
  ].join("|");
}

function pageNumberConfigKey(config: PageNumberConfig): string {
  return [
    config.position,
    config.format,
    config.start,
    config.reset,
    config.count,
    config.visible,
    config.style,
    config.fontSize,
    config.color,
    config.marginTop,
    config.marginBottom,
    config.marginLeft,
    config.marginRight,
  ].join("|");
}

function pageChromeRegionConfigKey(config: PageChromeRegionConfig): string {
  return [
    config.enabled,
    config.left ?? "",
    config.center ?? "",
    config.right ?? "",
    config.opacity,
    config.offset ?? "",
    config.borderSize ?? "",
    config.borderColor ?? "",
    config.borderStyle ?? "",
    config.fontSize ?? "",
    config.fontFamily ?? "",
    config.fontColor ?? "",
    config.padding ?? "",
  ].join("|");
}

function pageChromeConfigKey(config: PageChromeConfig): string {
  return [
    pageChromeRegionConfigKey(config.header),
    pageChromeRegionConfigKey(config.footer),
  ].join("|");
}

function previewPageKey(page: RenderedPreviewPage): string {
  return [
    page.html,
    pageStyleKey(page.pageStyle),
    previewTextStyleKey(page.textStyle),
    pageNumberConfigKey(page.pageNumberConfig),
    pageChromeConfigKey(page.pageChromeConfig),
  ].join(A4_PAGINATION_SOURCE_SEPARATOR);
}

function getPreviewPageConfig(page: RenderedPreviewPage): PreviewPageConfig {
  return {
    pageStyle: page.pageStyle,
    textStyle: page.textStyle,
    pageNumberConfig: page.pageNumberConfig,
    pageChromeConfig: page.pageChromeConfig,
  };
}

function getPreviewPageStyle(pageConfig: PreviewPageConfig): CSSProperties {
  const style: PreviewCssProperties = {
    "--kmark-page-width": pageConfig.pageStyle.width,
    "--kmark-page-height": pageConfig.pageStyle.height,
    "--kmark-page-margin-top": pageConfig.pageStyle.marginTop,
    "--kmark-page-margin-right": pageConfig.pageStyle.marginRight,
    "--kmark-page-margin-bottom": pageConfig.pageStyle.marginBottom,
    "--kmark-page-margin-left": pageConfig.pageStyle.marginLeft,
    "--kmark-font-size": pageConfig.textStyle.fontSize,
  };

  if (pageConfig.textStyle.fontFamily.trim().length > 0) {
    style["--kmark-font-family"] = pageConfig.textStyle.fontFamily;
  }

  if (pageConfig.textStyle.headingFontFamily.trim().length > 0) {
    style["--kmark-heading-font-family"] = pageConfig.textStyle.headingFontFamily;
  }

  return style;
}

function applyPreviewPageStyle(element: HTMLElement, pageConfig: PreviewPageConfig): void {
  element.style.setProperty("--kmark-page-width", pageConfig.pageStyle.width);
  element.style.setProperty("--kmark-page-height", pageConfig.pageStyle.height);
  element.style.setProperty("--kmark-page-margin-top", pageConfig.pageStyle.marginTop);
  element.style.setProperty("--kmark-page-margin-right", pageConfig.pageStyle.marginRight);
  element.style.setProperty("--kmark-page-margin-bottom", pageConfig.pageStyle.marginBottom);
  element.style.setProperty("--kmark-page-margin-left", pageConfig.pageStyle.marginLeft);
  element.style.setProperty("--kmark-font-size", pageConfig.textStyle.fontSize);

  if (pageConfig.textStyle.fontFamily.trim().length > 0) {
    element.style.setProperty("--kmark-font-family", pageConfig.textStyle.fontFamily);
  } else {
    element.style.removeProperty("--kmark-font-family");
  }

  if (pageConfig.textStyle.headingFontFamily.trim().length > 0) {
    element.style.setProperty("--kmark-heading-font-family", pageConfig.textStyle.headingFontFamily);
  } else {
    element.style.removeProperty("--kmark-heading-font-family");
  }
}

function getPreviewPageScaleStyle(page: RenderedPreviewPage, scale: number): CSSProperties {
  const widthPx = cssLengthToPx(page.pageStyle.width);
  const heightPx = cssLengthToPx(page.pageStyle.height);

  return {
    "--a4-scale": scale,
    width: Number.isFinite(widthPx) ? `${widthPx * scale}px` : `calc(${page.pageStyle.width} * ${scale})`,
    height: Number.isFinite(heightPx) ? `${heightPx * scale}px` : `calc(${page.pageStyle.height} * ${scale})`,
  } as CSSProperties;
}

function cssLengthToPx(value: string): number {
  const match = /^([0-9]+(?:\.[0-9]+)?)(px|mm|cm|in|pt|pc)$/iu.exec(value.trim());

  if (match === null) {
    return Number.NaN;
  }

  const amount = Number.parseFloat(match[1] ?? "");
  const unit = (match[2] ?? "").toLowerCase();

  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  switch (unit) {
    case "px":
      return amount;
    case "mm":
      return amount * CSS_MM_TO_PX;
    case "cm":
      return amount * CSS_MM_TO_PX * 10;
    case "in":
      return amount * 96;
    case "pt":
      return amount * (96 / 72);
    case "pc":
      return amount * 16;
    default:
      return Number.NaN;
  }
}

function getA4PreviewPageElements(previewViewport: HTMLElement): HTMLElement[] {
  return Array.from(
    previewViewport.querySelectorAll<HTMLElement>(".preview-section__page-scale"),
  );
}

function findNearestA4PreviewPageIndex(
  previewViewport: HTMLElement,
  previewPages: readonly HTMLElement[],
): number | null {
  if (previewPages.length === 0) {
    return null;
  }

  const viewportCenterTop = previewViewport.scrollTop + (previewViewport.clientHeight / 2);

  return previewPages.reduce((nearestIndex, previewPage, index) => {
    const nearestPage = previewPages[nearestIndex];
    const nearestDistance = Math.abs(
      nearestPage.offsetTop + (nearestPage.offsetHeight / 2) - viewportCenterTop,
    );
    const previewPageDistance = Math.abs(
      previewPage.offsetTop + (previewPage.offsetHeight / 2) - viewportCenterTop,
    );

    return previewPageDistance < nearestDistance ? index : nearestIndex;
  }, 0);
}

function scrollPreviewToA4Page(previewViewport: HTMLElement, previewPage: HTMLElement): void {
  previewViewport.scrollTo({
    top: Math.max(0, previewPage.offsetTop - A4_PAGE_NAVIGATION_SCROLL_MARGIN_PX),
    behavior: "auto",
  });
}

function resolveA4ZoomAnchorElement(
  previewViewport: HTMLElement,
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const targetElement = resolveEventTargetElement(eventTarget);
  const targetPage = targetElement?.closest<HTMLElement>(".preview-section__page-frame") ?? null;

  if (targetPage !== null && previewViewport.contains(targetPage)) {
    return targetPage;
  }

  return Array.from(previewViewport.querySelectorAll<HTMLElement>(".preview-section__page-frame"))
    .find((previewPage) => isPointInsideRect(previewPage.getBoundingClientRect(), clientX, clientY))
    ?? null;
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

function getPreviewTargetCandidate(previewBlock: HTMLElement): PreviewTargetCandidate | null {
  const sourceLineStart = Number.parseInt(previewBlock.dataset.sourceLineStart ?? "", 10);
  const sourceLineEnd = Number.parseInt(previewBlock.dataset.sourceLineEnd ?? "", 10);

  if (!Number.isFinite(sourceLineStart) || !Number.isFinite(sourceLineEnd)) {
    return null;
  }

  return {
    element: previewBlock,
    sourceLineEnd,
    sourceLineStart,
    span: Math.max(0, sourceLineEnd - sourceLineStart),
  };
}

function isMoreSpecificPreviewTarget(
  candidate: PreviewTargetCandidate,
  current: PreviewTargetCandidate,
): boolean {
  if (current.element !== candidate.element && current.element.contains(candidate.element)) {
    return true;
  }

  if (current.element !== candidate.element && candidate.element.contains(current.element)) {
    return false;
  }

  return false;
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

function findPreviewCursorTarget(
  previewViewport: HTMLElement,
  activeSourceLine: number,
): HTMLElement | null {
  const previewBlocks = Array.from(
    previewViewport.querySelectorAll<HTMLElement>("[data-source-line-start][data-source-line-end]"),
  );
  let containingBlock: PreviewTargetCandidate | null = null;
  let nearestBlock: NearestPreviewTargetCandidate | null = null;

  for (const previewBlock of previewBlocks) {
    const candidate = getPreviewTargetCandidate(previewBlock);

    if (candidate === null) {
      continue;
    }

    if (activeSourceLine >= candidate.sourceLineStart && activeSourceLine <= candidate.sourceLineEnd) {
      if (
        containingBlock === null
        || candidate.span < containingBlock.span
        || (candidate.span === containingBlock.span && isMoreSpecificPreviewTarget(candidate, containingBlock))
      ) {
        containingBlock = candidate;
      }

      continue;
    }

    const distance = activeSourceLine < candidate.sourceLineStart
      ? candidate.sourceLineStart - activeSourceLine
      : activeSourceLine - candidate.sourceLineEnd;

    if (
      nearestBlock === null
      || distance < nearestBlock.distance
      || (
        distance === nearestBlock.distance
        && (
          candidate.span < nearestBlock.span
          || (candidate.span === nearestBlock.span && isMoreSpecificPreviewTarget(candidate, nearestBlock))
        )
      )
    ) {
      nearestBlock = {
        ...candidate,
        distance,
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

  if (href.length === 0 || href.startsWith("#")) {
    return null;
  }

  const scheme = URL_SCHEME_PATTERN.exec(href)?.[1]?.toLocaleLowerCase("en-US") ?? "";

  if (scheme !== "http" && scheme !== "https") {
    return null;
  }

  try {
    const parsedUrl = new URL(href);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? parsedUrl.href
      : null;
  } catch {
    return null;
  }
}

function resolvePreviewHashTargetId(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")?.trim() ?? "";

  if (!href.startsWith("#") || href.length <= 1) {
    return null;
  }

  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

function scrollPreviewHashTarget(previewViewport: HTMLElement, targetId: string): void {
  for (const element of previewViewport.querySelectorAll<HTMLElement>("[id]")) {
    if (element.id !== targetId) {
      continue;
    }

    element.scrollIntoView({ block: "start", behavior: "auto" });
    return;
  }
}

function hardenPreviewSurfaceNavigation(surface: HTMLElement): void {
  for (const form of surface.querySelectorAll<HTMLFormElement>("form")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  for (const anchor of surface.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    anchor.removeAttribute("target");
    anchor.setAttribute("rel", "noreferrer noopener");
  }
}

function getTableAvailableWidth(table: HTMLTableElement): number {
  return table.parentElement?.clientWidth ?? table.clientWidth;
}

function resolvePreviewTableFitMode(table: HTMLTableElement): PreviewTableFitMode {
  const value = table.dataset.kmarkTableFit?.trim();

  return value === "off" || value === "shrink" ? value : "auto";
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

  const fitMode = resolvePreviewTableFitMode(table);

  if (fitMode === "off") {
    return;
  }

  const defaultPadding = getPreviewTableCellPadding(table);
  const minimumHorizontalPadding = Math.min(
    defaultPadding.horizontal,
    MIN_TABLE_CELL_HORIZONTAL_PADDING_PX,
  );
  const minimumVerticalPadding = Math.min(
    defaultPadding.vertical,
    MIN_TABLE_CELL_VERTICAL_PADDING_PX,
  );

  if (fitMode === "shrink") {
    setPreviewTablePadding(
      table,
      minimumHorizontalPadding,
      minimumVerticalPadding,
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
    return;
  }

  if (!isPreviewTableOverflowing(table)) {
    return;
  }

  for (
    let nextHorizontalPadding = defaultPadding.horizontal - 1;
    nextHorizontalPadding >= minimumHorizontalPadding;
    nextHorizontalPadding -= 1
  ) {
    const paddingReductionRatio = defaultPadding.horizontal <= minimumHorizontalPadding
      ? 1
      : (nextHorizontalPadding - minimumHorizontalPadding)
        / (defaultPadding.horizontal - minimumHorizontalPadding);
    const nextVerticalPadding = Math.max(
      minimumVerticalPadding,
      minimumVerticalPadding
        + ((defaultPadding.vertical - minimumVerticalPadding) * paddingReductionRatio),
    );

    setPreviewTablePadding(table, nextHorizontalPadding, nextVerticalPadding);

    if (!isPreviewTableOverflowing(table)) {
      return;
    }
  }

  setPreviewTablePadding(
    table,
    minimumHorizontalPadding,
    minimumVerticalPadding,
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

function createA4PaginationMeasureRoot(): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.position = "absolute";
  root.style.inset = "0 auto auto 0";
  root.style.visibility = "hidden";
  root.style.pointerEvents = "none";
  root.style.overflow = "visible";
  root.style.zIndex = "-1";
  document.body.append(root);

  return root;
}

function createA4PaginationPage(
  root: HTMLElement,
  pageConfig: PreviewPageConfig,
): Pick<A4PaginationContext, "body" | "frame" | "maxContentHeight" | "maxContentWidth"> {
  const frame = document.createElement("div");
  frame.className = "preview-section__page-frame";
  applyPreviewPageStyle(frame, pageConfig);

  const body = document.createElement("main");
  body.className = "preview-section__page kmark-page-body markdown-body markdown-body--a4";

  frame.append(body);
  root.append(frame);

  const frameStyle = window.getComputedStyle(frame);
  const paddingTop = Number.parseFloat(frameStyle.paddingTop);
  const paddingRight = Number.parseFloat(frameStyle.paddingRight);
  const paddingBottom = Number.parseFloat(frameStyle.paddingBottom);
  const paddingLeft = Number.parseFloat(frameStyle.paddingLeft);
  const maxContentWidth = Math.max(
    0,
    frame.clientWidth
      - (Number.isFinite(paddingLeft) ? paddingLeft : 0)
      - (Number.isFinite(paddingRight) ? paddingRight : 0),
  );
  const maxContentHeight = Math.max(
    0,
    frame.clientHeight
      - (Number.isFinite(paddingTop) ? paddingTop : 0)
      - (Number.isFinite(paddingBottom) ? paddingBottom : 0),
  );

  return { body, frame, maxContentHeight, maxContentWidth };
}

function startA4PaginationPage(context: A4PaginationContext): void {
  const page = createA4PaginationPage(context.root, context.pageConfig);
  context.body = page.body;
  context.frame = page.frame;
  context.maxContentHeight = page.maxContentHeight;
  context.maxContentWidth = page.maxContentWidth;
}

function hasA4PaginationContent(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some((node) => !isIgnorableA4PaginationNode(node));
}

function commitA4PaginationPage(context: A4PaginationContext): void {
  if (!hasA4PaginationContent(context.body)) {
    return;
  }

  context.pages.push({
    html: context.body.innerHTML,
    pageStyle: context.pageConfig.pageStyle,
    textStyle: context.pageConfig.textStyle,
    pageNumberConfig: context.pageConfig.pageNumberConfig,
    pageChromeConfig: context.pageConfig.pageChromeConfig,
  });
}

function getA4PaginationNodeBottomOffset(container: HTMLElement, node: Node): number {
  const containerRect = container.getBoundingClientRect();

  if (node instanceof Element) {
    const nodeRect = node.getBoundingClientRect();
    const nodeStyle = window.getComputedStyle(node);
    const marginBottom = Number.parseFloat(nodeStyle.marginBottom);

    return nodeRect.bottom - containerRect.top + (Number.isFinite(marginBottom) ? marginBottom : 0);
  }

  if (node.nodeType !== Node.TEXT_NODE || (node.textContent?.trim() ?? "") === "") {
    return 0;
  }

  const range = document.createRange();
  range.selectNode(node);
  const rangeRect = range.getBoundingClientRect();
  range.detach();

  return rangeRect.bottom - containerRect.top;
}

function getA4PaginationContentHeight(body: HTMLElement): number {
  return Math.max(
    0,
    ...Array.from(body.childNodes).map((node) => getA4PaginationNodeBottomOffset(body, node)),
  );
}

function isA4PaginationPageOverflowing(context: A4PaginationContext): boolean {
  return getA4PaginationContentHeight(context.body)
    > context.maxContentHeight + A4_PAGINATION_OVERFLOW_TOLERANCE_PX;
}

function hasA4PageFitStyle(element: HTMLElement): boolean {
  return (element.getAttribute("style") ?? "").includes(A4_PAGE_FIT_STYLE_FRAGMENT);
}

function hasA4PageFitContainStyle(element: HTMLElement): boolean {
  return (element.getAttribute("style") ?? "").includes(A4_PAGE_FIT_CONTAIN_STYLE_FRAGMENT);
}

function collectA4PageFitElements(root: HTMLElement): readonly HTMLElement[] {
  const pageFitElements = Array.from(
    root.querySelectorAll<HTMLElement>(`[style*="${A4_PAGE_FIT_STYLE_FRAGMENT}"]`),
  );

  if (hasA4PageFitStyle(root)) {
    pageFitElements.unshift(root);
  }

  return pageFitElements;
}

function setA4PageFitVariables(element: HTMLElement, width: number, height: number): void {
  element.style.setProperty(A4_PAGE_FIT_WIDTH_VARIABLE, `${Math.max(0, width).toFixed(2)}px`);
  element.style.setProperty(A4_PAGE_FIT_HEIGHT_VARIABLE, `${Math.max(0, height).toFixed(2)}px`);
}

function setA4PageFitContainVariables(element: HTMLElement, width: number, height: number): void {
  element.style.setProperty(A4_PAGE_FIT_CONTAIN_WIDTH_VARIABLE, `${Math.max(0, width).toFixed(2)}px`);
  element.style.setProperty(A4_PAGE_FIT_CONTAIN_HEIGHT_VARIABLE, `${Math.max(0, height).toFixed(2)}px`);
}

function getA4ElementAspectRatio(element: HTMLElement): number | null {
  if (element instanceof HTMLImageElement && element.naturalWidth > 0 && element.naturalHeight > 0) {
    return element.naturalWidth / element.naturalHeight;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0
    ? rect.width / rect.height
    : null;
}

function resolveA4ContainSize(
  element: HTMLElement,
  maxWidth: number,
  maxHeight: number,
): { readonly width: number; readonly height: number } | null {
  if (maxWidth <= 0 || maxHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const aspectRatio = getA4ElementAspectRatio(element);

  if (aspectRatio === null || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }

  const heightFromWidth = maxWidth / aspectRatio;

  if (heightFromWidth <= maxHeight) {
    return { width: maxWidth, height: heightFromWidth };
  }

  return { width: maxHeight * aspectRatio, height: maxHeight };
}

function seedA4PageFitVariables(context: A4PaginationContext, root: HTMLElement): boolean {
  const pageFitElements = collectA4PageFitElements(root);

  if (pageFitElements.length === 0) {
    return false;
  }

  const remainingHeight = context.maxContentHeight - getA4PaginationContentHeight(context.body);
  for (const element of pageFitElements) {
    setA4PageFitVariables(element, context.maxContentWidth, remainingHeight);
  }

  return true;
}

function resolveA4PageFitVariables(context: A4PaginationContext, root: HTMLElement): void {
  const pageFitElements = collectA4PageFitElements(root);

  if (pageFitElements.length === 0) {
    return;
  }

  const bodyRect = context.body.getBoundingClientRect();
  const contentRight = bodyRect.left + context.maxContentWidth;
  const contentBottom = bodyRect.top + context.maxContentHeight;

  for (const element of pageFitElements) {
    const elementRect = element.getBoundingClientRect();
    const maxWidth = contentRight - elementRect.left;
    const maxHeight = contentBottom - elementRect.top;
    setA4PageFitVariables(
      element,
      maxWidth,
      maxHeight,
    );

    if (hasA4PageFitContainStyle(element)) {
      const containSize = resolveA4ContainSize(element, maxWidth, maxHeight);
      if (containSize !== null) {
        setA4PageFitContainVariables(element, containSize.width, containSize.height);
      }
    }
  }
}

function appendA4PageFitAwareClone(context: A4PaginationContext, nodeClone: Node): void {
  if (nodeClone instanceof HTMLElement) {
    seedA4PageFitVariables(context, nodeClone);
  }

  context.body.append(nodeClone);

  if (nodeClone instanceof HTMLElement) {
    resolveA4PageFitVariables(context, nodeClone);
  }
}

function isIgnorableA4PaginationNode(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent?.trim() ?? "") === "";
}

function getA4PageValign(element: HTMLElement): A4PageValign | null {
  const value = element.dataset.pageValign;

  return value !== undefined && A4_PAGE_VALIGN_VALUES.has(value)
    ? value as A4PageValign
    : null;
}

function getA4EffectivePageValign(node: Node | undefined): A4PageValign | null {
  if (!(node instanceof HTMLElement)) {
    return null;
  }

  const valign = getA4PageValign(node);

  return valign === "center" || valign === "bottom"
    ? valign
    : null;
}

function createA4PageValignSpacer(height: number): HTMLElement {
  const spacer = document.createElement("div");
  spacer.className = "kmark-page-flex-spacer";
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.height = `${Math.max(0, height).toFixed(2)}px`;
  return spacer;
}

function getA4PaginationNodes(html: string): readonly Node[] {
  const template = document.createElement("template");
  template.innerHTML = prepareA4TocRowsHtml(html);

  return Array.from(template.content.childNodes).filter((node) => !isIgnorableA4PaginationNode(node));
}

function cloneA4PaginationElementShell(element: Element): HTMLElement {
  return element.cloneNode(false) as HTMLElement;
}

function splitA4PaginationTextToken(token: string): readonly string[] {
  if (/^\s+$/u.test(token)) {
    return [token];
  }

  const graphemes = Array.from(token);

  if (
    A4_PAGINATION_CJK_TEXT_PATTERN.test(token)
    || graphemes.length > A4_PAGINATION_LONG_TEXT_TOKEN_LENGTH
  ) {
    return graphemes;
  }

  return [token];
}

function splitA4PaginationText(text: string): readonly Node[] {
  return (text.match(/\s+|[^\s]+/gu) ?? [])
    .filter((token) => token.length > 0)
    .flatMap((token) => splitA4PaginationTextToken(token))
    .map((token) => document.createTextNode(token));
}

function isA4PaginationSplittableInlineElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement
    && A4_PAGINATION_INLINE_SPLIT_TAG_NAMES.has(node.tagName.toLowerCase())
    && !hasAnyClassName(node, A4_PAGINATION_ATOMIC_INLINE_CLASS_NAMES);
}

function hasAnyClassName(element: HTMLElement, classNames: ReadonlySet<string>): boolean {
  for (const className of classNames) {
    if (element.classList.contains(className)) {
      return true;
    }
  }

  return false;
}

function getA4InlinePaginationUnits(element: HTMLElement): readonly Node[] {
  return Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return splitA4PaginationText(node.textContent ?? "");
    }

    if (isA4PaginationSplittableInlineElement(node)) {
      const childUnits = getA4InlinePaginationUnits(node);

      if (childUnits.length === 0) {
        return [node.cloneNode(true)];
      }

      return childUnits.map((childUnit) => {
        const nextInlineElement = cloneA4PaginationElementShell(node);
        nextInlineElement.append(childUnit.cloneNode(true));
        return nextInlineElement;
      });
    }

    return [node.cloneNode(true)];
  });
}

function isA4PaginationHeadingElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && A4_PAGINATION_HEADING_TAG_NAMES.has(node.tagName.toLowerCase());
}

function cloneA4PaginationMinimumTableKeepNode(element: HTMLElement): HTMLElement {
  const table = cloneA4PaginationElementShell(element);

  for (const headerNode of getA4TableHeaderNodes(element)) {
    table.append(headerNode.cloneNode(true));
  }

  const firstBodyRow = getA4TableBodyRows(element)[0];

  if (firstBodyRow !== undefined) {
    const tbody = document.createElement("tbody");
    tbody.append(firstBodyRow.cloneNode(true));
    table.append(tbody);
  }

  return table;
}

function cloneA4PaginationMinimumListItemKeepNode(listItem: HTMLElement): HTMLElement {
  const listItemClone = cloneA4PaginationListItemShell(listItem, false);
  const firstUnit = getA4PaginationListItemUnits(listItem)[0];

  if (firstUnit === undefined) {
    return listItemClone;
  }

  if (firstUnit.kind === "node") {
    listItemClone.append(firstUnit.node.cloneNode(true));
    return listItemClone;
  }

  const nestedListClone = cloneA4PaginationListShell(firstUnit.list, false);
  const nestedListItem = getA4PaginationListItems(firstUnit.list)[0];

  if (nestedListItem !== undefined) {
    nestedListClone.append(cloneA4PaginationMinimumListItemKeepNode(nestedListItem));
  }

  listItemClone.append(nestedListClone);

  return listItemClone;
}

function cloneA4PaginationMinimumListKeepNode(element: HTMLElement): HTMLElement {
  const list = cloneA4PaginationListShell(element, false);
  const firstListItem = getA4PaginationListItems(element)[0];

  if (firstListItem !== undefined) {
    list.append(cloneA4PaginationMinimumListItemKeepNode(firstListItem));
  }

  return list;
}

function cloneA4PaginationMinimumPreKeepNode(element: HTMLElement): HTMLElement {
  const pre = cloneA4PaginationElementShell(element);
  const codeElement = getA4DirectCodeElement(element);
  const code = codeElement === null ? document.createElement("code") : cloneA4PaginationElementShell(codeElement);
  const firstCodeLine = splitA4CodeLines(codeElement?.textContent ?? element.textContent ?? "")[0];

  if (firstCodeLine !== undefined) {
    code.append(document.createTextNode(firstCodeLine));
  }

  pre.append(code);

  return pre;
}

function cloneA4PaginationMinimumInlineKeepNode(element: HTMLElement): HTMLElement {
  const inlineElement = cloneA4PaginationElementShell(element);
  const firstUnit = getA4InlinePaginationUnits(element)[0];

  if (firstUnit !== undefined) {
    inlineElement.append(firstUnit.cloneNode(true));
  }

  return inlineElement;
}

function cloneA4PaginationMinimumKeepNode(node: Node): Node {
  if (!(node instanceof HTMLElement)) {
    return node.cloneNode(true);
  }

  const tagName = node.tagName.toLowerCase();

  if (tagName === "table") {
    return cloneA4PaginationMinimumTableKeepNode(node);
  }

  if (tagName === "ol" || tagName === "ul") {
    return cloneA4PaginationMinimumListKeepNode(node);
  }

  if (tagName === "pre") {
    return cloneA4PaginationMinimumPreKeepNode(node);
  }

  if (tagName === "p") {
    return cloneA4PaginationMinimumInlineKeepNode(node);
  }

  return node.cloneNode(true);
}

function shouldMoveA4PaginationHeadingWithNext(
  context: A4PaginationContext,
  heading: HTMLElement,
  nextNode: Node,
): boolean {
  if (!hasA4PaginationContent(context.body)) {
    return false;
  }

  const headingClone = heading.cloneNode(true);
  const nextNodeClone = cloneA4PaginationMinimumKeepNode(nextNode);

  appendA4PageFitAwareClone(context, headingClone);
  appendA4PageFitAwareClone(context, nextNodeClone);
  const shouldMove = isA4PaginationPageOverflowing(context);
  context.body.removeChild(nextNodeClone);
  context.body.removeChild(headingClone);

  return shouldMove;
}

function appendSplitInlineElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const units = getA4InlinePaginationUnits(element);

  if (units.length === 0) {
    return false;
  }

  let activeElement: HTMLElement | null = null;

  const startElement = (): HTMLElement => {
    const nextElement = cloneA4PaginationElementShell(element);
    appendA4PageFitAwareClone(context, nextElement);
    activeElement = nextElement;
    return nextElement;
  };

  for (const unit of units) {
    const currentElement = activeElement ?? startElement();
    const unitClone = unit.cloneNode(true);
    currentElement.append(unitClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentElement.removeChild(unitClone);

    if (hasA4PaginationContent(currentElement)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      startElement().append(unitClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        activeElement = null;
      }
      continue;
    }

    currentElement.remove();

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      startElement().append(unitClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        activeElement = null;
      }
      continue;
    }

    startElement().append(unitClone);
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    activeElement = null;
  }

  return true;
}

function addA4PaginationClassName(element: HTMLElement, className: string): void {
  element.classList.add(className);
}

function hasA4PaginationDeepContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").trim().length > 0;
  }

  if (!(node instanceof HTMLElement)) {
    return false;
  }

  if (node instanceof HTMLImageElement || node.tagName.toLowerCase() === "br") {
    return true;
  }

  return Array.from(node.childNodes).some((childNode) => hasA4PaginationDeepContent(childNode));
}

function removeA4PaginationElementIfEmpty(element: HTMLElement): void {
  if (!hasA4PaginationDeepContent(element)) {
    element.remove();
  }
}

function isA4PaginationListElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && (node.tagName.toLowerCase() === "ol" || node.tagName.toLowerCase() === "ul");
}

function getA4PaginationListItems(element: HTMLElement): readonly HTMLElement[] {
  return Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "li",
  );
}

function cloneA4PaginationListShell(element: HTMLElement, isContinuation: boolean): HTMLElement {
  const list = cloneA4PaginationElementShell(element);

  if (isContinuation) {
    addA4PaginationClassName(list, "kmark-list-continuation");
  }

  return list;
}

function cloneA4PaginationListItemShell(element: HTMLElement, isContinuation: boolean): HTMLElement {
  const listItem = cloneA4PaginationElementShell(element);

  if (isContinuation) {
    addA4PaginationClassName(listItem, "kmark-li-continuation");
  }

  return listItem;
}

type A4PaginationListAccess = {
  readonly ensureCurrentList: () => HTMLElement;
  readonly resetAfterPageBreak: () => void;
  readonly startContinuationList: () => HTMLElement;
};

type A4PaginationListItemUnit =
  | {
    readonly kind: "list";
    readonly list: HTMLElement;
  }
  | {
    readonly kind: "node";
    readonly node: Node;
  };

function getA4PaginationListItemUnits(listItem: HTMLElement): readonly A4PaginationListItemUnit[] {
  return Array.from(listItem.childNodes).flatMap((node): A4PaginationListItemUnit[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      return splitA4PaginationText(node.textContent ?? "").map((textNode) => ({
        kind: "node",
        node: textNode,
      }));
    }

    if (isA4PaginationListElement(node)) {
      return [{ kind: "list", list: node }];
    }

    if (isA4PaginationSplittableInlineElement(node)) {
      return getA4InlinePaginationUnits(node).map((inlineNode) => ({
        kind: "node",
        node: inlineNode,
      }));
    }

    return [{
      kind: "node",
      node: node.cloneNode(true),
    }];
  });
}

function appendA4PaginationNodeToListItem(
  context: A4PaginationContext,
  node: Node,
  ensureCurrentListItem: () => HTMLElement,
  startContinuationListItem: () => HTMLElement,
  removeEmptyCurrentListItem: () => void,
): void {
  const currentListItem = ensureCurrentListItem();
  const nodeClone = node.cloneNode(true);
  currentListItem.append(nodeClone);

  if (!isA4PaginationPageOverflowing(context)) {
    return;
  }

  currentListItem.removeChild(nodeClone);

  if (hasA4PaginationDeepContent(currentListItem)) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    const continuationListItem = startContinuationListItem();
    continuationListItem.append(nodeClone);

    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      removeEmptyCurrentListItem();
    }
    return;
  }

  removeEmptyCurrentListItem();

  if (hasA4PaginationDeepContent(context.body)) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    startContinuationListItem().append(nodeClone);

    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      removeEmptyCurrentListItem();
    }
    return;
  }

  ensureCurrentListItem().append(nodeClone);

  if (isA4PaginationPageOverflowing(context)) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    removeEmptyCurrentListItem();
  }
}

function appendNestedListToA4ListItemPages(
  context: A4PaginationContext,
  nestedList: HTMLElement,
  ensureCurrentListItem: () => HTMLElement,
  startContinuationListItem: () => HTMLElement,
  resetCurrentListItem: () => void,
): boolean {
  const nestedListItems = getA4PaginationListItems(nestedList);

  if (nestedListItems.length === 0) {
    return false;
  }

  let activeNestedList: HTMLElement | null = null;

  const startNestedList = (isContinuation: boolean): HTMLElement => {
    const parentListItem = isContinuation ? startContinuationListItem() : ensureCurrentListItem();
    const nextNestedList = cloneA4PaginationListShell(nestedList, isContinuation);
    parentListItem.append(nextNestedList);
    activeNestedList = nextNestedList;
    return nextNestedList;
  };

  const resetNestedListAfterPageBreak = (): void => {
    activeNestedList = null;
    resetCurrentListItem();
  };

  const removeEmptyNestedList = (): void => {
    if (activeNestedList !== null && !hasA4PaginationDeepContent(activeNestedList)) {
      const parentListItem = activeNestedList.parentElement;
      activeNestedList.remove();
      activeNestedList = null;

      if (parentListItem instanceof HTMLElement) {
        removeA4PaginationElementIfEmpty(parentListItem);
      }
    }
  };

  const nestedListAccess: A4PaginationListAccess = {
    ensureCurrentList: () => activeNestedList ?? startNestedList(false),
    resetAfterPageBreak: resetNestedListAfterPageBreak,
    startContinuationList: () => {
      activeNestedList = null;
      return startNestedList(true);
    },
  };

  for (const nestedListItem of nestedListItems) {
    const currentNestedList = nestedListAccess.ensureCurrentList();
    const nestedListItemClone = nestedListItem.cloneNode(true);
    currentNestedList.append(nestedListItemClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentNestedList.removeChild(nestedListItemClone);

    if (appendSplitListItemToA4Pages(context, nestedListItem, nestedListAccess)) {
      continue;
    }

    if (hasA4PaginationDeepContent(currentNestedList)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      nestedListAccess.resetAfterPageBreak();
      nestedListAccess.startContinuationList().append(nestedListItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        nestedListAccess.resetAfterPageBreak();
      }
      continue;
    }

    removeEmptyNestedList();

    if (hasA4PaginationDeepContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      nestedListAccess.resetAfterPageBreak();
      nestedListAccess.startContinuationList().append(nestedListItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        nestedListAccess.resetAfterPageBreak();
      }
      continue;
    }

    nestedListAccess.ensureCurrentList().append(nestedListItemClone);
  }

  return true;
}

function appendSplitListItemToA4Pages(
  context: A4PaginationContext,
  sourceListItem: HTMLElement,
  listAccess: A4PaginationListAccess,
): boolean {
  const units = getA4PaginationListItemUnits(sourceListItem);

  if (units.length === 0) {
    return false;
  }

  let activeListItem: HTMLElement | null = null;

  const startListItem = (isContinuation: boolean): HTMLElement => {
    const list = isContinuation ? listAccess.startContinuationList() : listAccess.ensureCurrentList();
    const nextListItem = cloneA4PaginationListItemShell(sourceListItem, isContinuation);
    list.append(nextListItem);
    activeListItem = nextListItem;
    return nextListItem;
  };

  const ensureCurrentListItem = (): HTMLElement => activeListItem ?? startListItem(false);

  const resetCurrentListItem = (): void => {
    activeListItem = null;
    listAccess.resetAfterPageBreak();
  };

  const startContinuationListItem = (): HTMLElement => {
    activeListItem = null;
    return startListItem(true);
  };

  const removeEmptyCurrentListItem = (): void => {
    if (activeListItem === null) {
      return;
    }

    const parentList = activeListItem.parentElement;
    removeA4PaginationElementIfEmpty(activeListItem);
    activeListItem = null;

    if (parentList instanceof HTMLElement) {
      removeA4PaginationElementIfEmpty(parentList);
    }
  };

  for (const unit of units) {
    if (unit.kind === "list") {
      appendNestedListToA4ListItemPages(
        context,
        unit.list,
        ensureCurrentListItem,
        startContinuationListItem,
        resetCurrentListItem,
      );
      continue;
    }

    appendA4PaginationNodeToListItem(
      context,
      unit.node,
      ensureCurrentListItem,
      startContinuationListItem,
      removeEmptyCurrentListItem,
    );
  }

  return true;
}

function appendSplitListElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const listItems = getA4PaginationListItems(element);

  if (listItems.length === 0) {
    return false;
  }

  let activeList: HTMLElement | null = null;

  const startList = (isContinuation: boolean): HTMLElement => {
    const nextList = cloneA4PaginationListShell(element, isContinuation);
    appendA4PageFitAwareClone(context, nextList);
    activeList = nextList;
    return nextList;
  };

  const listAccess: A4PaginationListAccess = {
    ensureCurrentList: () => activeList ?? startList(false),
    resetAfterPageBreak: () => {
      activeList = null;
    },
    startContinuationList: () => {
      activeList = null;
      return startList(true);
    },
  };

  for (const listItem of listItems) {
    const currentList = listAccess.ensureCurrentList();
    const listItemClone = listItem.cloneNode(true);
    currentList.append(listItemClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentList.removeChild(listItemClone);

    if (appendSplitListItemToA4Pages(context, listItem, listAccess)) {
      continue;
    }

    if (hasA4PaginationContent(currentList)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      listAccess.resetAfterPageBreak();
      listAccess.startContinuationList().append(listItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        listAccess.resetAfterPageBreak();
      }
      continue;
    }

    currentList.remove();
    listAccess.resetAfterPageBreak();

    if (hasA4PaginationDeepContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      listAccess.resetAfterPageBreak();
      listAccess.startContinuationList().append(listItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        listAccess.resetAfterPageBreak();
      }
      continue;
    }

    listAccess.ensureCurrentList().append(listItemClone);
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    listAccess.resetAfterPageBreak();
  }

  return true;
}

function getA4TableHeaderNodes(element: HTMLElement): readonly Element[] {
  return Array.from(element.children).filter((child) => {
    const tagName = child.tagName.toLowerCase();
    return tagName === "caption" || tagName === "colgroup" || tagName === "thead";
  });
}

function getA4TableFooterNodes(element: HTMLElement): readonly Element[] {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "tfoot");
}

function getA4TableBodyRows(element: HTMLElement): readonly HTMLTableRowElement[] {
  const directBodyRows = Array.from(element.children).flatMap((child) => {
    if (child.tagName.toLowerCase() !== "tbody") {
      return [];
    }

    return Array.from(child.children).filter(
      (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement,
    );
  });

  if (directBodyRows.length > 0) {
    return directBodyRows;
  }

  if (element instanceof HTMLTableElement) {
    return Array.from(element.rows).filter((row) => {
      const parentTagName = row.parentElement?.tagName.toLowerCase();
      return parentTagName !== "thead" && parentTagName !== "tfoot";
    });
  }

  return [];
}

function appendSplitTableElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const rows = getA4TableBodyRows(element);

  if (rows.length === 0) {
    return false;
  }

  const headerNodes = getA4TableHeaderNodes(element);
  const footerNodes = getA4TableFooterNodes(element);
  const activeTableState: {
    body: HTMLTableSectionElement | null;
    table: HTMLElement | null;
  } = {
    body: null,
    table: null,
  };

  const startTable = (): HTMLTableSectionElement => {
    const nextTable = cloneA4PaginationElementShell(element);

    for (const headerNode of headerNodes) {
      nextTable.append(headerNode.cloneNode(true));
    }

    const nextTableBody = document.createElement("tbody");
    nextTable.append(nextTableBody);
    appendA4PageFitAwareClone(context, nextTable);
    activeTableState.table = nextTable;
    activeTableState.body = nextTableBody;

    return nextTableBody;
  };

  const appendRowToFreshTable = (row: HTMLTableRowElement): void => {
    const nextRow = row.cloneNode(true);
    startTable().append(nextRow);

    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      activeTableState.table = null;
      activeTableState.body = null;
    }
  };

  for (const row of rows) {
    const currentTableBody = activeTableState.body ?? startTable();
    const rowClone = row.cloneNode(true);
    currentTableBody.append(rowClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentTableBody.removeChild(rowClone);

    if (hasA4PaginationContent(currentTableBody)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendRowToFreshTable(row);
      continue;
    }

    activeTableState.table?.remove();
    activeTableState.table = null;
    activeTableState.body = null;

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendRowToFreshTable(row);
      continue;
    }

    appendRowToFreshTable(row);
  }

  const tableForFooter = activeTableState.table;

  if (footerNodes.length > 0 && tableForFooter !== null) {
    for (const footerNode of footerNodes) {
      tableForFooter.append(footerNode.cloneNode(true));
    }

    if (isA4PaginationPageOverflowing(context)) {
      for (const footerNode of Array.from(tableForFooter.querySelectorAll(":scope > tfoot"))) {
        footerNode.remove();
      }

      commitA4PaginationPage(context);
      startA4PaginationPage(context);

      const footerOnlyTable = cloneA4PaginationElementShell(element);
      for (const footerNode of footerNodes) {
        footerOnlyTable.append(footerNode.cloneNode(true));
      }
      appendA4PageFitAwareClone(context, footerOnlyTable);
    }
  }

  return true;
}

function splitA4CodeLines(text: string): readonly string[] {
  if (text.length === 0) {
    return [];
  }

  const lines = text.split("\n");

  return lines.flatMap((line, index) => {
    if (index < lines.length - 1) {
      return [`${line}\n`];
    }

    return line.length > 0 ? [line] : [];
  });
}

function getA4DirectCodeElement(element: HTMLElement): HTMLElement | null {
  return Array.from(element.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "code",
  ) ?? null;
}

function hasA4CodeContent(element: HTMLElement): boolean {
  return (element.textContent ?? "").length > 0 || hasA4PaginationContent(element);
}

function appendSplitPreElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const codeElement = getA4DirectCodeElement(element);
  const codeLines = splitA4CodeLines(codeElement?.textContent ?? element.textContent ?? "");

  if (codeLines.length === 0) {
    return false;
  }

  const activePreState: {
    code: HTMLElement | null;
    pre: HTMLElement | null;
  } = {
    code: null,
    pre: null,
  };

  const startPre = (): HTMLElement => {
    const nextPre = cloneA4PaginationElementShell(element);
    const nextCode = codeElement === null ? document.createElement("code") : cloneA4PaginationElementShell(codeElement);
    nextPre.append(nextCode);
    appendA4PageFitAwareClone(context, nextPre);
    activePreState.pre = nextPre;
    activePreState.code = nextCode;

    return nextCode;
  };

  const appendLineToFreshPre = (line: string): void => {
    const nextTextNode = document.createTextNode(line);
    startPre().append(nextTextNode);

    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      activePreState.pre = null;
      activePreState.code = null;
    }
  };

  for (const codeLine of codeLines) {
    const currentCode = activePreState.code ?? startPre();
    const codeLineNode = document.createTextNode(codeLine);
    currentCode.append(codeLineNode);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentCode.removeChild(codeLineNode);

    if (hasA4CodeContent(currentCode)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendLineToFreshPre(codeLine);
      continue;
    }

    activePreState.pre?.remove();
    activePreState.pre = null;
    activePreState.code = null;

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendLineToFreshPre(codeLine);
      continue;
    }

    appendLineToFreshPre(codeLine);
  }

  return true;
}

function canSplitA4ContainerElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  if (tagName === "blockquote" || tagName === "section" || tagName === "article") {
    return true;
  }

  return tagName === "div" && !element.hasAttribute("data-kmark-scope") && !element.classList.contains("kmark-scope");
}

function isA4PaginationCalloutElement(element: HTMLElement): boolean {
  return element.classList.contains("kmark-callout");
}

function isA4PaginationTocElement(element: HTMLElement): boolean {
  return element.classList.contains("kmark-toc");
}

function getA4DirectChildByClassName(element: HTMLElement, className: string): HTMLElement | null {
  return Array.from(element.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(className),
  ) ?? null;
}

function appendSplitCalloutElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const titleElement = getA4DirectChildByClassName(element, "kmark-callout__title");
  const bodyElement = getA4DirectChildByClassName(element, "kmark-callout__body");

  if (bodyElement === null) {
    return false;
  }

  const bodyChildNodes = Array.from(bodyElement.childNodes).filter((node) => !isIgnorableA4PaginationNode(node));
  const activeCalloutState: {
    body: HTMLElement | null;
    callout: HTMLElement | null;
  } = {
    body: null,
    callout: null,
  };

  const resetCallout = (): void => {
    activeCalloutState.body = null;
    activeCalloutState.callout = null;
  };

  const removeEmptyActiveCallout = (): void => {
    if (activeCalloutState.callout !== null && activeCalloutState.body !== null && !hasA4PaginationDeepContent(activeCalloutState.body)) {
      activeCalloutState.callout.remove();
    }

    resetCallout();
  };

  const startCallout = (): HTMLElement => {
    const nextCallout = cloneA4PaginationElementShell(element);

    if (titleElement !== null) {
      nextCallout.append(titleElement.cloneNode(true));
    }

    const nextBody = cloneA4PaginationElementShell(bodyElement);
    nextCallout.append(nextBody);
    appendA4PageFitAwareClone(context, nextCallout);
    activeCalloutState.callout = nextCallout;
    activeCalloutState.body = nextBody;

    return nextBody;
  };

  const appendSplitInlineChildToCallout = (inlineElement: HTMLElement): boolean => {
    const units = getA4InlinePaginationUnits(inlineElement);

    if (units.length === 0) {
      return false;
    }

    let activeInlineElement: HTMLElement | null = null;

    const startInlineElement = (): HTMLElement => {
      const nextInlineElement = cloneA4PaginationElementShell(inlineElement);
      (activeCalloutState.body ?? startCallout()).append(nextInlineElement);
      activeInlineElement = nextInlineElement;
      return nextInlineElement;
    };

    for (const unit of units) {
      const currentInlineElement = activeInlineElement ?? startInlineElement();
      const unitClone = unit.cloneNode(true);
      currentInlineElement.append(unitClone);

      if (!isA4PaginationPageOverflowing(context)) {
        continue;
      }

      currentInlineElement.removeChild(unitClone);

      if (hasA4PaginationDeepContent(currentInlineElement)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeInlineElement = null;
        startInlineElement().append(unitClone);
        if (isA4PaginationPageOverflowing(context)) {
          commitA4PaginationPage(context);
          startA4PaginationPage(context);
          resetCallout();
          activeInlineElement = null;
        }
        continue;
      }

      currentInlineElement.remove();
      activeInlineElement = null;
      removeEmptyActiveCallout();

      if (hasA4PaginationContent(context.body)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      startInlineElement().append(unitClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeInlineElement = null;
      }
    }

    return true;
  };

  const appendSplitPreChildToCallout = (preElement: HTMLElement): boolean => {
    const codeElement = getA4DirectCodeElement(preElement);
    const codeLines = splitA4CodeLines(codeElement?.textContent ?? preElement.textContent ?? "");

    if (codeLines.length === 0) {
      return false;
    }

    const activePreState: {
      code: HTMLElement | null;
      pre: HTMLElement | null;
    } = {
      code: null,
      pre: null,
    };

    const startPre = (): HTMLElement => {
      const nextPre = cloneA4PaginationElementShell(preElement);
      const nextCode = codeElement === null ? document.createElement("code") : cloneA4PaginationElementShell(codeElement);
      nextPre.append(nextCode);
      (activeCalloutState.body ?? startCallout()).append(nextPre);
      activePreState.pre = nextPre;
      activePreState.code = nextCode;
      return nextCode;
    };

    for (const codeLine of codeLines) {
      const currentCode = activePreState.code ?? startPre();
      const codeLineNode = document.createTextNode(codeLine);
      currentCode.append(codeLineNode);

      if (!isA4PaginationPageOverflowing(context)) {
        continue;
      }

      currentCode.removeChild(codeLineNode);

      if (hasA4CodeContent(currentCode)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activePreState.pre = null;
        activePreState.code = null;
        startPre().append(codeLineNode);
        if (isA4PaginationPageOverflowing(context)) {
          commitA4PaginationPage(context);
          startA4PaginationPage(context);
          resetCallout();
          activePreState.pre = null;
          activePreState.code = null;
        }
        continue;
      }

      activePreState.pre?.remove();
      activePreState.pre = null;
      activePreState.code = null;
      removeEmptyActiveCallout();

      if (hasA4PaginationContent(context.body)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      startPre().append(codeLineNode);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activePreState.pre = null;
        activePreState.code = null;
      }
    }

    return true;
  };

  const appendSplitTableChildToCallout = (tableElement: HTMLElement): boolean => {
    const rows = getA4TableBodyRows(tableElement);

    if (rows.length === 0) {
      return false;
    }

    const headerNodes = getA4TableHeaderNodes(tableElement);
    const activeTableState: {
      body: HTMLTableSectionElement | null;
      table: HTMLElement | null;
    } = {
      body: null,
      table: null,
    };

    const startTable = (): HTMLTableSectionElement => {
      const nextTable = cloneA4PaginationElementShell(tableElement);

      for (const headerNode of headerNodes) {
        nextTable.append(headerNode.cloneNode(true));
      }

      const nextTableBody = document.createElement("tbody");
      nextTable.append(nextTableBody);
      (activeCalloutState.body ?? startCallout()).append(nextTable);
      activeTableState.table = nextTable;
      activeTableState.body = nextTableBody;

      return nextTableBody;
    };

    for (const row of rows) {
      const currentTableBody = activeTableState.body ?? startTable();
      const rowClone = row.cloneNode(true);
      currentTableBody.append(rowClone);

      if (!isA4PaginationPageOverflowing(context)) {
        continue;
      }

      currentTableBody.removeChild(rowClone);

      if (hasA4PaginationContent(currentTableBody)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeTableState.table = null;
        activeTableState.body = null;
        startTable().append(rowClone);
        continue;
      }

      activeTableState.table?.remove();
      activeTableState.table = null;
      activeTableState.body = null;
      removeEmptyActiveCallout();

      if (hasA4PaginationContent(context.body)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      startTable().append(rowClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeTableState.table = null;
        activeTableState.body = null;
      }
    }

    return true;
  };

  const appendSplitListChildToCallout = (listElement: HTMLElement): boolean => {
    const listItems = getA4PaginationListItems(listElement);

    if (listItems.length === 0) {
      return false;
    }

    let activeList: HTMLElement | null = null;

    const startList = (isContinuation: boolean): HTMLElement => {
      const nextList = cloneA4PaginationListShell(listElement, isContinuation);
      (activeCalloutState.body ?? startCallout()).append(nextList);
      activeList = nextList;
      return nextList;
    };

    for (const [index, listItem] of listItems.entries()) {
      const currentList = activeList ?? startList(index > 0);
      const listItemClone = listItem.cloneNode(true);
      currentList.append(listItemClone);

      if (!isA4PaginationPageOverflowing(context)) {
        continue;
      }

      currentList.removeChild(listItemClone);

      if (hasA4PaginationDeepContent(currentList)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeList = null;
        startList(true).append(listItemClone);
        continue;
      }

      currentList.remove();
      activeList = null;
      removeEmptyActiveCallout();

      if (hasA4PaginationContent(context.body)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      startList(true).append(listItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        resetCallout();
        activeList = null;
      }
    }

    return true;
  };

  const appendSplitChildToCallout = (childNode: Node): boolean => {
    if (!(childNode instanceof HTMLElement)) {
      return false;
    }

    const tagName = childNode.tagName.toLowerCase();

    if (tagName === "p") {
      return appendSplitInlineChildToCallout(childNode);
    }

    if (tagName === "pre") {
      return appendSplitPreChildToCallout(childNode);
    }

    if (tagName === "table") {
      return appendSplitTableChildToCallout(childNode);
    }

    if (tagName === "ol" || tagName === "ul") {
      return appendSplitListChildToCallout(childNode);
    }

    return false;
  };

  const appendChildToFreshCallout = (childNode: Node): void => {
    const nextBody = startCallout();
    const childNodeClone = childNode.cloneNode(true);
    nextBody.append(childNodeClone);

    if (isA4PaginationPageOverflowing(context)) {
      nextBody.removeChild(childNodeClone);

      if (appendSplitChildToCallout(childNode)) {
        return;
      }

      nextBody.append(childNodeClone);
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      resetCallout();
    }
  };

  if (bodyChildNodes.length === 0) {
    startCallout();

    if (isA4PaginationPageOverflowing(context)) {
      removeEmptyActiveCallout();

      if (hasA4PaginationContent(context.body)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      startCallout();
    }

    return true;
  }

  for (const childNode of bodyChildNodes) {
    const currentBody = activeCalloutState.body ?? startCallout();
    const childNodeClone = childNode.cloneNode(true);
    currentBody.append(childNodeClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentBody.removeChild(childNodeClone);

    if (hasA4PaginationDeepContent(currentBody)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      resetCallout();
      appendChildToFreshCallout(childNode);
      continue;
    }

    removeEmptyActiveCallout();

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
    }

    appendChildToFreshCallout(childNode);
  }

  return true;
}

function appendSplitContainerElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const childNodes = Array.from(element.childNodes).filter((node) => !isIgnorableA4PaginationNode(node));

  if (childNodes.length === 0) {
    return false;
  }

  let activeContainer: HTMLElement | null = null;

  const startContainer = (): HTMLElement => {
    const nextContainer = cloneA4PaginationElementShell(element);
    appendA4PageFitAwareClone(context, nextContainer);
    activeContainer = nextContainer;
    return nextContainer;
  };

  const appendChildToFreshContainer = (childNode: Node): void => {
    startContainer().append(childNode.cloneNode(true));

    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      activeContainer = null;
    }
  };

  for (const childNode of childNodes) {
    const currentContainer = activeContainer ?? startContainer();
    const childNodeClone = childNode.cloneNode(true);
    currentContainer.append(childNodeClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentContainer.removeChild(childNodeClone);

    if (hasA4PaginationContent(currentContainer)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendChildToFreshContainer(childNode);
      continue;
    }

    currentContainer.remove();
    activeContainer = null;

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      appendChildToFreshContainer(childNode);
      continue;
    }

    appendChildToFreshContainer(childNode);
  }

  return true;
}

function appendSplitTocElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const titleElement = getA4DirectChildByClassName(element, "kmark-toc__title");
  const headerElement = getA4DirectChildByClassName(element, "kmark-toc__header");
  const listElement = Array.from(element.children).find(isA4PaginationListElement);

  if (listElement === undefined) {
    return false;
  }

  const listItems = Array.from(element.querySelectorAll<HTMLElement>(".kmark-toc__item"));

  if (listItems.length === 0) {
    return false;
  }

  let activeList: HTMLElement | null = null;
  let activeToc: HTMLElement | null = null;
  let hasStartedToc = false;

  const createFlatTocListItem = (sourceListItem: HTMLElement): HTMLElement | null => {
    const rowElements = ensureA4TocItemRow(sourceListItem);

    if (rowElements === null) {
      return null;
    }

    const listItem = cloneA4PaginationListItemShell(sourceListItem, false);
    listItem.append(rowElements.row.cloneNode(true));

    return listItem;
  };

  const startToc = (isContinuation: boolean): HTMLElement => {
    const nextToc = cloneA4PaginationElementShell(element);

    if (isContinuation) {
      addA4PaginationClassName(nextToc, "kmark-toc--continuation");
    } else {
      if (titleElement !== null) {
        nextToc.append(titleElement.cloneNode(true));
      }

      nextToc.append((headerElement ?? createA4TocHeaderElement()).cloneNode(true));
    }

    appendA4PageFitAwareClone(context, nextToc);
    activeToc = nextToc;
    hasStartedToc = true;

    return nextToc;
  };

  const ensureCurrentToc = (): HTMLElement => activeToc ?? startToc(hasStartedToc);

  const startList = (isContinuation: boolean): HTMLElement => {
    const nextList = cloneA4PaginationListShell(listElement, isContinuation);
    ensureCurrentToc().append(nextList);
    activeList = nextList;
    return nextList;
  };

  const resetAfterPageBreak = (): void => {
    activeList = null;
    activeToc = null;
  };

  const ensureCurrentList = (): HTMLElement => activeList ?? startList(false);

  const startContinuationList = (): HTMLElement => {
    activeList = null;
    return startList(true);
  };

  for (const listItem of listItems) {
    const listItemClone = createFlatTocListItem(listItem);

    if (listItemClone === null) {
      continue;
    }

    const currentList = ensureCurrentList();
    currentList.append(listItemClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentList.removeChild(listItemClone);

    if (hasA4PaginationDeepContent(currentList)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      resetAfterPageBreak();
      startContinuationList().append(listItemClone);
      continue;
    }

    currentList.remove();
    activeList = null;

    if (hasA4PaginationDeepContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      resetAfterPageBreak();
      startContinuationList().append(listItemClone);
      continue;
    }

    ensureCurrentList().append(listItemClone);
    if (isA4PaginationPageOverflowing(context)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      resetAfterPageBreak();
    }
  }

  return true;
}

function appendSplittableElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  if (isA4PaginationTocElement(element)) {
    return appendSplitTocElementToA4Pages(context, element);
  }

  if (isA4PaginationCalloutElement(element)) {
    return appendSplitCalloutElementToA4Pages(context, element);
  }

  if (tagName === "p") {
    return appendSplitInlineElementToA4Pages(context, element);
  }

  if (tagName === "ol" || tagName === "ul") {
    return appendSplitListElementToA4Pages(context, element);
  }

  if (tagName === "table") {
    return appendSplitTableElementToA4Pages(context, element);
  }

  if (tagName === "pre") {
    return appendSplitPreElementToA4Pages(context, element);
  }

  if (canSplitA4ContainerElement(element)) {
    return appendSplitContainerElementToA4Pages(context, element);
  }

  return false;
}

function placePageValignElementOnActiveA4Page(
  context: A4PaginationContext,
  element: HTMLElement,
  valign: A4PageValign,
): boolean {
  const beforeHeight = getA4PaginationContentHeight(context.body);
  const nodeClone = element.cloneNode(true) as HTMLElement;
  appendA4PageFitAwareClone(context, nodeClone);

  if (isA4PaginationPageOverflowing(context)) {
    context.body.removeChild(nodeClone);
    return false;
  }

  const afterHeight = getA4PaginationContentHeight(context.body);
  const targetHeight = Math.max(0, afterHeight - beforeHeight);
  const remainingHeight = Math.max(0, context.maxContentHeight - beforeHeight - targetHeight);
  const spacerHeight = valign === "center"
    ? remainingHeight / 2
    : remainingHeight;

  if (spacerHeight <= A4_PAGINATION_OVERFLOW_TOLERANCE_PX) {
    return true;
  }

  const spacer = createA4PageValignSpacer(spacerHeight);
  context.body.insertBefore(spacer, nodeClone);
  resolveA4PageFitVariables(context, nodeClone);

  const overflowAmount = getA4PaginationContentHeight(context.body) - context.maxContentHeight;
  if (overflowAmount > A4_PAGINATION_OVERFLOW_TOLERANCE_PX) {
    const nextSpacerHeight = Math.max(0, spacerHeight - overflowAmount);
    spacer.style.height = `${nextSpacerHeight.toFixed(2)}px`;
  }

  if (isA4PaginationPageOverflowing(context)) {
    spacer.remove();
  }

  return true;
}

function appendOversizedPageValignElementToA4Pages(
  context: A4PaginationContext,
  element: HTMLElement,
  options: A4PageValignAppendOptions,
): void {
  if (appendSplittableElementToA4Pages(context, element)) {
    if (options.commitAfter) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
    }
    return;
  }

  appendA4PageFitAwareClone(context, element.cloneNode(true));

  if (options.commitAfter) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
  }
}

function appendPageValignElementToA4Pages(
  context: A4PaginationContext,
  element: HTMLElement,
  options: A4PageValignAppendOptions,
): boolean {
  const valign = getA4EffectivePageValign(element);

  if (valign === null) {
    return false;
  }

  if (!placePageValignElementOnActiveA4Page(context, element, valign)) {
    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
    }

    if (!placePageValignElementOnActiveA4Page(context, element, valign)) {
      appendOversizedPageValignElementToA4Pages(context, element, options);
      return true;
    }
  }

  if (options.commitAfter) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
  }

  return true;
}

function appendNodeToA4Pages(context: A4PaginationContext, node: Node, nextNode?: Node): void {
  const nodeValign = getA4EffectivePageValign(node);
  if (node instanceof HTMLElement && nodeValign !== null) {
    const nextValign = getA4EffectivePageValign(nextNode);
    appendPageValignElementToA4Pages(context, node, {
      commitAfter: !(nodeValign === "center" && nextValign === "bottom"),
    });
    return;
  }

  const nodeClone = node.cloneNode(true);
  appendA4PageFitAwareClone(context, nodeClone);

  if (!isA4PaginationPageOverflowing(context)) {
    return;
  }

  context.body.removeChild(nodeClone);

  if (node instanceof HTMLElement && appendSplittableElementToA4Pages(context, node)) {
    return;
  }

  if (hasA4PaginationContent(context.body)) {
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
  }

  appendA4PageFitAwareClone(context, node.cloneNode(true));
}

function paginateA4HtmlSegment(page: RenderedPreviewPage): readonly RenderedPreviewPage[] {
  const root = createA4PaginationMeasureRoot();
  const firstPageConfig = getPreviewPageConfig(page);
  const firstPage = createA4PaginationPage(root, firstPageConfig);
  const context: A4PaginationContext = {
    body: firstPage.body,
    frame: firstPage.frame,
    maxContentHeight: firstPage.maxContentHeight,
    maxContentWidth: firstPage.maxContentWidth,
    pageConfig: firstPageConfig,
    pages: [],
    root,
  };

  try {
    const nodes = getA4PaginationNodes(page.html);

    for (const [index, node] of nodes.entries()) {
      const nextNode = nodes.slice(index + 1).find((candidate) => !isIgnorableA4PaginationNode(candidate));

      if (
        isA4PaginationHeadingElement(node)
        && nextNode !== undefined
        && shouldMoveA4PaginationHeadingWithNext(context, node, nextNode)
      ) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
      }

      appendNodeToA4Pages(context, node, nextNode);
    }

    commitA4PaginationPage(context);

    const pages = context.pages.length > 0
      ? context.pages
      : [{ ...page, html: "" }];

    return pages.map((nextPage, index) => index === 0
      ? nextPage
      : {
        ...nextPage,
        pageNumberConfig: {
          ...nextPage.pageNumberConfig,
          reset: false,
        },
      });
  } finally {
    root.remove();
  }
}

function paginateA4HtmlSegments(
  pages: readonly RenderedPreviewPage[],
): readonly RenderedPreviewPage[] {
  return pages.flatMap((page) => [...paginateA4HtmlSegment(page)]);
}

function formatDecimalNumber(value: number): string {
  return String(value);
}

function formatRomanNumber(value: number): string {
  if (value <= 0 || value > 3999) {
    return String(value);
  }

  const romanTokens: readonly [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let output = "";

  for (const [number, token] of romanTokens) {
    while (remaining >= number) {
      output += token;
      remaining -= number;
    }
  }

  return output;
}

function formatAlphaNumber(value: number): string {
  if (value <= 0) {
    return String(value);
  }

  let remaining = value;
  let output = "";

  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(97 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }

  return output;
}

function formatPageNumberValue(value: number, style: PageNumberStyle): string {
  switch (style) {
    case "decimal":
      return formatDecimalNumber(value);
    case "lower-roman":
      return formatRomanNumber(value).toLocaleLowerCase("en-US");
    case "upper-roman":
      return formatRomanNumber(value);
    case "lower-alpha":
      return formatAlphaNumber(value);
    case "upper-alpha":
      return formatAlphaNumber(value).toLocaleUpperCase("en-US");
  }
}

function resolvePageNumberText(input: {
  readonly absPage: number;
  readonly absTotal: number;
  readonly config: PageNumberConfig;
  readonly page: number;
  readonly total: number;
}): string {
  const styledPage = formatPageNumberValue(input.page, input.config.style);
  const styledTotal = formatPageNumberValue(input.total, input.config.style);

  return input.config.format
    .replace(/\{abs_page\}/gu, formatDecimalNumber(input.absPage))
    .replace(/\{abs_total\}/gu, formatDecimalNumber(input.absTotal))
    .replace(/\{page\}/gu, styledPage)
    .replace(/\{total\}/gu, styledTotal);
}

function resolveNumberedPreviewPages(pages: readonly RenderedPreviewPage[]): readonly NumberedRenderedPreviewPage[] {
  const groupIds: number[] = [];
  const pageValues: number[] = [];
  const groupTotals = new Map<number, number>();
  let activeGroupId = 0;
  let nextPageNumber = pages[0]?.pageNumberConfig.start ?? DEFAULT_PAGE_NUMBER_CONFIG.start;

  pages.forEach((page, index) => {
    if (index === 0 || page.pageNumberConfig.reset) {
      activeGroupId += 1;
      nextPageNumber = page.pageNumberConfig.start;
    }

    groupIds[index] = activeGroupId;
    pageValues[index] = nextPageNumber;

    if (page.pageNumberConfig.count) {
      groupTotals.set(activeGroupId, (groupTotals.get(activeGroupId) ?? 0) + 1);
      nextPageNumber += 1;
    }
  });

  return pages.map((page, index) => {
    const config = page.pageNumberConfig;

    if (!config.visible || config.position === "none") {
      return {
        ...page,
        pageNumberText: null,
        tocPageNumberText: formatPageNumberValue(pageValues[index] ?? config.start, config.style),
      };
    }

    return {
      ...page,
      tocPageNumberText: formatPageNumberValue(pageValues[index] ?? config.start, config.style),
      pageNumberText: resolvePageNumberText({
        absPage: index + 1,
        absTotal: pages.length,
        config,
        page: pageValues[index] ?? config.start,
        total: groupTotals.get(groupIds[index] ?? 0) ?? 0,
      }),
    };
  });
}

function collectA4HeadingPageNumbers(pages: readonly NumberedRenderedPreviewPage[]): ReadonlyMap<string, string> {
  const pageNumbersByHeadingId = new Map<string, string>();

  pages.forEach((page) => {
    const template = document.createElement("template");
    template.innerHTML = page.html;

    for (const heading of template.content.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")) {
      if (!pageNumbersByHeadingId.has(heading.id)) {
        pageNumbersByHeadingId.set(heading.id, page.tocPageNumberText);
      }
    }
  });

  return pageNumbersByHeadingId;
}

function isA4TocLabelElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement
    && (element.classList.contains("kmark-toc__link") || element.classList.contains("kmark-toc__text"));
}

function getA4DirectTocLabelElement(element: HTMLElement): HTMLElement | null {
  return Array.from(element.children).find(isA4TocLabelElement) ?? null;
}

function getA4DirectTocRowElement(item: HTMLElement): HTMLElement | null {
  return Array.from(item.children).find((child): child is HTMLElement => (
    child instanceof HTMLElement && child.classList.contains("kmark-toc__row")
  )) ?? null;
}

function getA4DirectTocPageElement(row: HTMLElement): HTMLElement | null {
  return Array.from(row.children).find((child): child is HTMLElement => (
    child instanceof HTMLElement && child.classList.contains("kmark-toc__page")
  )) ?? null;
}

function createA4TocHeaderElement(): HTMLElement {
  const header = document.createElement("div");
  header.className = "kmark-toc__header";

  const item = document.createElement("span");
  item.className = "kmark-toc__header-item";
  item.textContent = A4_TOC_ITEM_HEADER_LABEL;
  header.append(item);

  const page = document.createElement("span");
  page.className = "kmark-toc__header-page";
  page.textContent = A4_TOC_PAGE_HEADER_LABEL;
  header.append(page);

  return header;
}

function ensureA4TocHeader(toc: HTMLElement): void {
  if (toc.classList.contains("kmark-toc--continuation")) {
    return;
  }

  const list = Array.from(toc.children).find(isA4PaginationListElement);

  if (list === undefined) {
    return;
  }

  if (getA4DirectChildByClassName(toc, "kmark-toc__header") !== null) {
    return;
  }

  const header = createA4TocHeaderElement();
  const title = getA4DirectChildByClassName(toc, "kmark-toc__title");

  if (title !== null) {
    title.after(header);
    return;
  }

  toc.insertBefore(header, list);
}

function parseA4TocNestDepth(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

function getA4TocItemNestDepth(item: HTMLElement): number {
  const savedDepth = parseA4TocNestDepth(item.dataset.tocNestDepth);

  if (savedDepth !== null) {
    return savedDepth;
  }

  let depth = 0;
  let parent = item.parentElement;

  while (parent !== null) {
    if (parent.classList.contains("kmark-toc__list--nested")) {
      depth += 1;
    }

    if (parent.classList.contains("kmark-toc")) {
      break;
    }

    parent = parent.parentElement;
  }

  return depth;
}

function ensureA4TocItemRow(item: HTMLElement): A4TocRowElements | null {
  const existingRow = getA4DirectTocRowElement(item);

  if (existingRow !== null) {
    const label = getA4DirectTocLabelElement(existingRow);

    if (label === null) {
      return null;
    }

    const existingPage = getA4DirectTocPageElement(existingRow);
    if (existingPage !== null) {
      return { label, page: existingPage, row: existingRow };
    }

    const page = document.createElement("span");
    page.className = "kmark-toc__page";
    existingRow.append(page);

    return { label, page, row: existingRow };
  }

  const label = getA4DirectTocLabelElement(item);

  if (label === null) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "kmark-toc__row";
  item.insertBefore(row, label);
  row.append(label);

  const page = document.createElement("span");
  page.className = "kmark-toc__page";
  row.append(page);

  return { label, page, row };
}

function applyA4TocRowStripeClasses(root: ParentNode): void {
  for (const toc of root.querySelectorAll<HTMLElement>(".kmark-toc")) {
    Array.from(toc.querySelectorAll<HTMLElement>(".kmark-toc__row")).forEach((row, index) => {
      const item = row.closest(".kmark-toc__item");
      const nestDepth = item instanceof HTMLElement ? getA4TocItemNestDepth(item) : 0;

      if (item instanceof HTMLElement) {
        item.dataset.tocNestDepth = `${nestDepth}`;
      }

      row.classList.remove("kmark-toc__row--odd", "kmark-toc__row--even");
      row.classList.add(index % 2 === 0 ? "kmark-toc__row--odd" : "kmark-toc__row--even");
      row.style.setProperty("--kmark-toc-row-indent", `${(nestDepth * A4_TOC_INDENT_STEP_EM).toFixed(2)}em`);
    });
  }
}

function prepareA4TocRowsHtml(html: string): string {
  if (!html.includes("kmark-toc")) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const toc of template.content.querySelectorAll<HTMLElement>(".kmark-toc")) {
    ensureA4TocHeader(toc);
  }

  for (const item of template.content.querySelectorAll<HTMLElement>(".kmark-toc__item")) {
    ensureA4TocItemRow(item);
  }

  applyA4TocRowStripeClasses(template.content);

  return template.innerHTML;
}

function normalizeA4TocTargetId(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute("href");

  if (href === null || !href.startsWith("#") || href.length <= 1) {
    return null;
  }

  return href.slice(1);
}

function resolveA4TocPageNumberHtml(
  html: string,
  pageNumbersByHeadingId: ReadonlyMap<string, string>,
): string {
  if (!html.includes("kmark-toc")) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const toc of template.content.querySelectorAll<HTMLElement>(".kmark-toc")) {
    ensureA4TocHeader(toc);
  }

  for (const item of template.content.querySelectorAll<HTMLElement>(".kmark-toc__item")) {
    const rowElements = ensureA4TocItemRow(item);

    if (rowElements === null) {
      continue;
    }

    const targetId = rowElements.label instanceof HTMLAnchorElement ? normalizeA4TocTargetId(rowElements.label) : null;
    const pageNumber = targetId === null ? null : pageNumbersByHeadingId.get(targetId);

    if (pageNumber === undefined || pageNumber === null) {
      continue;
    }

    rowElements.page.textContent = pageNumber;
  }

  applyA4TocRowStripeClasses(template.content);

  return template.innerHTML;
}

function resolveA4TocPageNumbers(
  pages: readonly NumberedRenderedPreviewPage[],
): readonly NumberedRenderedPreviewPage[] {
  if (!pages.some((page) => page.html.includes("kmark-toc"))) {
    return pages;
  }

  const pageNumbersByHeadingId = collectA4HeadingPageNumbers(pages);

  return pages.map((page) => ({
    ...page,
    html: resolveA4TocPageNumberHtml(page.html, pageNumbersByHeadingId),
  }));
}

function getPageNumberClassName(position: PageNumberPosition): string {
  return `kmark-page-number kmark-page-number--${position}`;
}

function getPageNumberStyle(config: PageNumberConfig): CSSProperties {
  return {
    "--kmark-page-number-font-size": config.fontSize,
    "--kmark-page-number-color": config.color,
    "--kmark-page-number-margin-top": config.marginTop,
    "--kmark-page-number-margin-bottom": config.marginBottom,
    "--kmark-page-number-margin-left": config.marginLeft,
    "--kmark-page-number-margin-right": config.marginRight,
  } as CSSProperties;
}

function getPageChromeRegionStyle(
  region: "header" | "footer",
  config: PageChromeRegionConfig,
): CSSProperties {
  const style: CSSProperties = {
    opacity: config.opacity,
  };

  if (config.fontSize !== undefined && config.fontSize !== null) {
    style.fontSize = config.fontSize;
  }
  if (config.fontFamily !== undefined && config.fontFamily !== null) {
    style.fontFamily = config.fontFamily;
  }
  if (config.fontColor !== undefined && config.fontColor !== null) {
    style.color = config.fontColor;
  }

  if (config.offset !== undefined && config.offset !== null) {
    if (region === "header") {
      style.top = config.offset;
    } else {
      style.bottom = config.offset;
    }
  }

  return style;
}

function getPageChromeRegionTextStyle(config: PageChromeRegionConfig): CSSProperties | undefined {
  const style: CSSProperties = {};
  const hasBorderSize = config.borderSize !== undefined && config.borderSize !== null;
  const hasBorderStyle = config.borderStyle !== undefined && config.borderStyle !== null;

  if (config.fontFamily !== undefined && config.fontFamily !== null) {
    style.fontFamily = config.fontFamily;
  }

  if (hasBorderSize) {
    style.borderWidth = config.borderSize;
    style.borderStyle = config.borderStyle ?? "solid";
  } else if (hasBorderStyle) {
    style.borderStyle = config.borderStyle;
  }
  if (config.borderColor !== undefined && config.borderColor !== null) {
    style.borderColor = config.borderColor;
  }
  if (config.padding !== undefined && config.padding !== null) {
    style.padding = config.padding;
  } else if (hasBorderSize || hasBorderStyle) {
    style.padding = "0.15em 0.45em";
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function renderPageChromeRegionSlot(
  baseClassName: string,
  slotName: "left" | "center" | "right",
  text: string | null | undefined,
  textStyle: CSSProperties | undefined,
): ReactNode {
  const slotText = text ?? "";

  return (
    <div className={`${baseClassName}__${slotName}`}>
      {slotText.length === 0 ? null : (
        <span className={`${baseClassName}__text`} style={textStyle}>
          {slotText}
        </span>
      )}
    </div>
  );
}

function renderPageChromeRegion(
  region: "header" | "footer",
  config: PageChromeRegionConfig,
): ReactNode {
  if (!config.enabled) {
    return null;
  }

  const baseClassName = `kmark-page-${region}`;
  const textStyle = getPageChromeRegionTextStyle(config);

  return (
    <div className={baseClassName} style={getPageChromeRegionStyle(region, config)}>
      {renderPageChromeRegionSlot(baseClassName, "left", config.left, textStyle)}
      {renderPageChromeRegionSlot(baseClassName, "center", config.center, textStyle)}
      {renderPageChromeRegionSlot(baseClassName, "right", config.right, textStyle)}
    </div>
  );
}

function resolveKmarkVideoFrame(video: HTMLVideoElement): HTMLElement | null {
  const parentElement = video.parentElement;

  return parentElement instanceof HTMLElement && parentElement.classList.contains(KMARK_VIDEO_FRAME_CLASS_NAME)
    ? parentElement
    : null;
}

function ensureKmarkVideoFrame(video: HTMLVideoElement): HTMLElement {
  const currentFrame = resolveKmarkVideoFrame(video);

  if (currentFrame !== null) {
    return currentFrame;
  }

  const frame = document.createElement("span");
  frame.className = KMARK_VIDEO_FRAME_CLASS_NAME;
  video.insertAdjacentElement("beforebegin", frame);
  frame.appendChild(video);

  return frame;
}

function resolveVideoSiblingAnchor(video: HTMLVideoElement): HTMLElement {
  return resolveKmarkVideoFrame(video) ?? video;
}

function resolveVideoErrorElement(video: HTMLVideoElement): HTMLElement | null {
  const nextElement = resolveVideoSiblingAnchor(video).nextElementSibling;

  return nextElement instanceof HTMLElement && nextElement.classList.contains(KMARK_VIDEO_ERROR_CLASS_NAME)
    ? nextElement
    : null;
}

function ensureVideoErrorElement(video: HTMLVideoElement): HTMLElement {
  const currentElement = resolveVideoErrorElement(video);

  if (currentElement !== null) {
    return currentElement;
  }

  const errorElement = document.createElement("span");
  errorElement.className = KMARK_VIDEO_ERROR_CLASS_NAME;
  errorElement.hidden = true;
  errorElement.setAttribute("role", "alert");
  resolveVideoSiblingAnchor(video).insertAdjacentElement("afterend", errorElement);

  return errorElement;
}

function setKmarkVideoFrameLoadState(video: HTMLVideoElement, state: string | null): void {
  const frame = resolveKmarkVideoFrame(video);

  if (frame === null) {
    return;
  }

  if (state === null) {
    delete frame.dataset.kmarkVideoLoadState;
    return;
  }

  frame.dataset.kmarkVideoLoadState = state;
}

function showVideoLoadError(video: HTMLVideoElement): void {
  const errorElement = ensureVideoErrorElement(video);
  const altText = video.dataset.kmarkVideoAlt?.trim() ?? "";
  const source = video.dataset.kmarkVideoSource?.trim() || video.currentSrc || video.getAttribute("src") || "";

  video.dataset.kmarkVideoLoadState = KMARK_VIDEO_FAILED_STATE;
  setKmarkVideoFrameLoadState(video, KMARK_VIDEO_FAILED_STATE);
  errorElement.textContent = [
    "動画を読み込めませんでした",
    altText,
    source,
  ].filter((line) => line.length > 0).join("\n");
  errorElement.hidden = false;
}

function hideVideoLoadError(video: HTMLVideoElement): void {
  delete video.dataset.kmarkVideoLoadState;
  setKmarkVideoFrameLoadState(video, null);

  const errorElement = resolveVideoErrorElement(video);
  if (errorElement !== null) {
    errorElement.hidden = true;
  }
}

type PreviewHtmlSurfaceElement = "article" | "main";

type PreviewHtmlSurfaceProps = {
  readonly className: string;
  readonly element: PreviewHtmlSurfaceElement;
  readonly html: string;
  readonly style?: CSSProperties;
};

type PreviewVideoSnapshot = {
  readonly currentTime: number;
  readonly muted: boolean;
  readonly paused: boolean;
  readonly playbackRate: number;
  readonly posterFrameReady: boolean;
  readonly posterImageHidden: boolean;
  readonly posterPlaybackStarted: boolean;
  readonly volume: number;
};

function resolvePreviewVideoSnapshotKey(
  video: HTMLVideoElement,
  occurrenceCounts: Map<string, number>,
): string {
  const source = video.dataset.kmarkVideoSource ?? video.currentSrc ?? video.getAttribute("src") ?? "";
  const sourceLineStart = video.dataset.sourceLineStart ?? video.getAttribute("data-source-line-start") ?? "";
  const sourceLineEnd = video.dataset.sourceLineEnd ?? video.getAttribute("data-source-line-end") ?? "";
  const baseKey = [source, sourceLineStart, sourceLineEnd].join("\u0000");
  const occurrence = occurrenceCounts.get(baseKey) ?? 0;

  occurrenceCounts.set(baseKey, occurrence + 1);

  return `${baseKey}\u0000${occurrence}`;
}

function collectPreviewVideoSnapshots(surface: HTMLElement): ReadonlyMap<string, PreviewVideoSnapshot> {
  const snapshots = new Map<string, PreviewVideoSnapshot>();
  const occurrenceCounts = new Map<string, number>();

  for (const video of surface.querySelectorAll<HTMLVideoElement>("video")) {
    snapshots.set(resolvePreviewVideoSnapshotKey(video, occurrenceCounts), {
      currentTime: video.currentTime,
      muted: video.muted,
      paused: video.paused,
      playbackRate: video.playbackRate,
      posterFrameReady: video.dataset.kmarkVideoPosterFrameReady === "true",
      posterImageHidden: video.dataset.kmarkVideoPosterImageState === KMARK_VIDEO_POSTER_IMAGE_HIDDEN_STATE,
      posterPlaybackStarted: video.dataset.kmarkVideoPosterPlaybackStarted === "true",
      volume: video.volume,
    });
  }

  return snapshots;
}

function restorePreviewVideoSnapshot(video: HTMLVideoElement, snapshot: PreviewVideoSnapshot): void {
  video.muted = snapshot.muted;
  video.playbackRate = snapshot.playbackRate;
  video.volume = snapshot.volume;

  if (snapshot.posterFrameReady) {
    video.dataset.kmarkVideoPosterFrameReady = "true";
  }
  if (snapshot.posterImageHidden) {
    video.dataset.kmarkVideoPosterImageState = KMARK_VIDEO_POSTER_IMAGE_HIDDEN_STATE;
  }
  if (snapshot.posterPlaybackStarted) {
    video.dataset.kmarkVideoPosterPlaybackStarted = "true";
  }

  const restoreTimeAndPlayback = () => {
    if (Number.isFinite(snapshot.currentTime) && snapshot.currentTime >= 0) {
      try {
        video.currentTime = snapshot.currentTime;
      } catch {
        // Some engines reject seeking until metadata is fully available.
      }
    }

    if (!snapshot.paused) {
      void video.play().catch(() => {});
    }
  };

  if (video.readyState >= VIDEO_HAVE_METADATA_READY_STATE) {
    restoreTimeAndPlayback();
    return;
  }

  video.addEventListener("loadedmetadata", restoreTimeAndPlayback, { once: true });
}

function restorePreviewVideoSnapshots(
  surface: HTMLElement,
  snapshots: ReadonlyMap<string, PreviewVideoSnapshot>,
): void {
  const occurrenceCounts = new Map<string, number>();

  for (const video of surface.querySelectorAll<HTMLVideoElement>("video")) {
    const snapshot = snapshots.get(resolvePreviewVideoSnapshotKey(video, occurrenceCounts));

    if (snapshot !== undefined) {
      restorePreviewVideoSnapshot(video, snapshot);
    }
  }
}

function applyPreviewSurfaceHtml(surface: HTMLElement, html: string): void {
  const videoSnapshots = collectPreviewVideoSnapshots(surface);
  const template = document.createElement("template");

  template.innerHTML = html;
  persistKmarkModelViewerSnapshots(surface);
  preserveReusableKmarkModelViewers(surface, template.content);
  surface.replaceChildren(...Array.from(template.content.childNodes));
  hardenPreviewSurfaceNavigation(surface);
  restorePreviewVideoSnapshots(surface, videoSnapshots);
}

function syncPreviewSurfaceModelViewers(
  surface: HTMLElement,
  scopeRef: { current: ModelViewerScope | null },
): void {
  if (scopeRef.current === null) {
    scopeRef.current = createKmarkModelViewerScope(surface);
  }

  scopeRef.current.sync();
}

function isPreviewSurfaceFullscreen(surface: HTMLElement): boolean {
  const fullscreenElement = document.fullscreenElement;

  return fullscreenElement instanceof Element
    && (fullscreenElement === surface || surface.contains(fullscreenElement));
}

function PreviewHtmlSurface({
  className,
  element,
  html,
  style,
}: PreviewHtmlSurfaceProps) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const appliedHtmlRef = useRef<string | null>(null);
  const modelViewerScopeRef = useRef<ModelViewerScope | null>(null);
  const pendingHtmlRef = useRef<string | null>(null);

  const handleSurfaceRef = useCallback((node: HTMLElement | null) => {
    if (surfaceRef.current !== node) {
      modelViewerScopeRef.current?.dispose();
      modelViewerScopeRef.current = null;
      appliedHtmlRef.current = null;
      pendingHtmlRef.current = null;
    }

    surfaceRef.current = node;
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;

    if (surface === null || appliedHtmlRef.current === html) {
      return;
    }

    if (isPreviewSurfaceFullscreen(surface)) {
      pendingHtmlRef.current = html;
      return;
    }

    applyPreviewSurfaceHtml(surface, html);
    syncPreviewSurfaceModelViewers(surface, modelViewerScopeRef);
    appliedHtmlRef.current = html;
    pendingHtmlRef.current = null;
  }, [html]);

  useLayoutEffect(() => {
    const handleFullscreenChange = () => {
      const surface = surfaceRef.current;
      const pendingHtml = pendingHtmlRef.current;

      if (surface === null || pendingHtml === null || isPreviewSurfaceFullscreen(surface)) {
        return;
      }

      applyPreviewSurfaceHtml(surface, pendingHtml);
      syncPreviewSurfaceModelViewers(surface, modelViewerScopeRef);
      appliedHtmlRef.current = pendingHtml;
      pendingHtmlRef.current = null;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useLayoutEffect(() => () => {
    modelViewerScopeRef.current?.dispose();
    modelViewerScopeRef.current = null;
    appliedHtmlRef.current = null;
    pendingHtmlRef.current = null;
  }, []);

  if (element === "main") {
    return <main ref={handleSurfaceRef} className={className} style={style} />;
  }

  return <article ref={handleSurfaceRef} className={className} style={style} />;
}

function parseKmarkVideoPosterTime(video: HTMLVideoElement): number | null {
  const value = Number(video.dataset.kmarkVideoPosterTime);

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function clampVideoTime(video: HTMLVideoElement, seconds: number): number {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return clamp(seconds, 0, video.duration);
  }

  return seconds;
}

function prepareKmarkVideoPosterFrame(video: HTMLVideoElement): () => void {
  const posterTime = parseKmarkVideoPosterTime(video);

  if (posterTime === null) {
    return () => {};
  }

  const seekPosterFrame = () => {
    if (video.dataset.kmarkVideoPosterPlaybackStarted === "true") {
      return;
    }

    const posterFrameTime = clampVideoTime(video, posterTime);

    if (Math.abs(video.currentTime - posterFrameTime) > 0.05) {
      try {
        video.currentTime = posterFrameTime;
      } catch {
        return;
      }
    }

    video.dataset.kmarkVideoPosterFrameReady = "true";
  };
  const handlePlay = () => {
    if (video.dataset.kmarkVideoPosterPlaybackStarted === "true") {
      return;
    }

    video.dataset.kmarkVideoPosterPlaybackStarted = "true";

    if (video.dataset.kmarkVideoPosterFrameReady === "true" && posterTime > 0) {
      try {
        video.currentTime = 0;
      } catch {
        // Playback can continue from the browser-selected position if seeking is unavailable.
      }
    }
  };

  if (video.readyState >= VIDEO_HAVE_METADATA_READY_STATE) {
    seekPosterFrame();
  } else {
    video.addEventListener("loadedmetadata", seekPosterFrame);
  }

  video.addEventListener("play", handlePlay);

  return () => {
    video.removeEventListener("loadedmetadata", seekPosterFrame);
    video.removeEventListener("play", handlePlay);
  };
}

function resolveKmarkVideoPosterImage(frame: HTMLElement): HTMLImageElement | null {
  const posterImage = frame.querySelector(`img.${KMARK_VIDEO_POSTER_IMAGE_CLASS_NAME}`);

  return posterImage instanceof HTMLImageElement ? posterImage : null;
}

function setKmarkVideoPosterImageHidden(video: HTMLVideoElement, hidden: boolean): void {
  const frame = resolveKmarkVideoFrame(video);
  const posterImage = frame === null ? null : resolveKmarkVideoPosterImage(frame);

  if (hidden) {
    video.dataset.kmarkVideoPosterImageState = KMARK_VIDEO_POSTER_IMAGE_HIDDEN_STATE;
  } else {
    delete video.dataset.kmarkVideoPosterImageState;
  }

  if (posterImage !== null) {
    posterImage.hidden = hidden;
  }
}

function prepareKmarkVideoPosterImage(video: HTMLVideoElement): () => void {
  const posterUrl = video.dataset.kmarkVideoPoster || video.getAttribute("poster") || "";

  if (posterUrl.length === 0) {
    return () => {};
  }

  const frame = ensureKmarkVideoFrame(video);
  video.dataset.kmarkVideoPoster = posterUrl;
  video.removeAttribute("poster");

  let posterImage = resolveKmarkVideoPosterImage(frame);
  if (posterImage === null) {
    posterImage = document.createElement("img");
    posterImage.className = KMARK_VIDEO_POSTER_IMAGE_CLASS_NAME;
    posterImage.alt = "";
    posterImage.decoding = "async";
    posterImage.setAttribute("aria-hidden", "true");
    frame.appendChild(posterImage);
  }
  if (posterImage.getAttribute("src") !== posterUrl) {
    posterImage.src = posterUrl;
  }

  const hidePosterImage = () => {
    setKmarkVideoPosterImageHidden(video, true);
  };

  if (
    !video.paused
    || video.dataset.kmarkVideoPosterPlaybackStarted === "true"
    || video.dataset.kmarkVideoPosterImageState === KMARK_VIDEO_POSTER_IMAGE_HIDDEN_STATE
  ) {
    hidePosterImage();
  } else {
    setKmarkVideoPosterImageHidden(video, false);
  }

  video.addEventListener("play", hidePosterImage);
  video.addEventListener("playing", hidePosterImage);

  return () => {
    video.removeEventListener("play", hidePosterImage);
    video.removeEventListener("playing", hidePosterImage);
  };
}

function syncKmarkVideoIntrinsicSize(video: HTMLVideoElement): void {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    return;
  }

  // Keep the layout tied to the video media dimensions instead of the poster image.
  video.setAttribute("width", String(video.videoWidth));
  video.setAttribute("height", String(video.videoHeight));
  video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  video.style.height = "auto";
}

function MarkdownPreviewComponent({
  activeSourceLine = null,
  activeSourceLineScrollMode,
  defaultPageStyle = DEFAULT_PAGE_STYLE,
  defaultTextStyle = DEFAULT_PREVIEW_TEXT_STYLE,
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
  pages,
  pageTransitionFadeMs = 0,
  previewFitMode = "width",
  suppressTextSelectionOnDoubleClick = false,
  followActiveSourceLine = true,
  previewNavigationRequest = null,
  zoomScale = 1,
}: MarkdownPreviewProps) {
  const previewViewportRef = useRef<HTMLElement | null>(null);
  const activeA4PageIndexRef = useRef(0);
  const lastCursorTargetRef = useRef<HTMLElement | null>(null);
  const pageTransitionAnimationRef = useRef<Animation | null>(null);
  const pageTransitionOverlayRef = useRef<HTMLElement | null>(null);
  const pendingA4NavigationScrollRef = useRef(false);
  const pendingViewportZoomAnchorRef = useRef<{
    readonly anchorElement: HTMLElement | null;
    readonly anchorElementOffsetX: number;
    readonly anchorElementOffsetY: number;
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
  const [activeA4PageIndex, setActiveA4PageIndex] = useState(0);
  const [isViewportPanning, setIsViewportPanning] = useState(false);

  const normalizedPages = useMemo(() => {
    if (pages !== undefined && pages.length > 0) {
      return [...pages];
    }

    const htmlSegments = pageHtmls !== undefined && pageHtmls.length > 0 ? pageHtmls : [html];

    return htmlSegments.map((pageHtml) => ({
      html: pageHtml,
      pageStyle: defaultPageStyle,
      textStyle: defaultTextStyle,
      pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
      pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
    }));
  }, [defaultPageStyle, defaultTextStyle, html, pageHtmls, pages]);
  const a4PaginationSourceKey = useMemo(
    () => normalizedPages.map(previewPageKey).join(A4_PAGINATION_SOURCE_SEPARATOR),
    [normalizedPages],
  );
  const [paginatedA4PageState, setPaginatedA4PageState] = useState<{
    readonly pages: readonly RenderedPreviewPage[];
    readonly sourceKey: string;
  }>({
    pages: [],
    sourceKey: "",
  });
  const hasCurrentA4Pagination =
    paginatedA4PageState.sourceKey === a4PaginationSourceKey
    && paginatedA4PageState.pages.length > 0;
  const a4DisplayPages = hasCurrentA4Pagination
    ? paginatedA4PageState.pages
    : normalizedPages;
  const numberedA4DisplayPages = useMemo(
    () => resolveA4TocPageNumbers(resolveNumberedPreviewPages(a4DisplayPages)),
    [a4DisplayPages],
  );
  const currentPreviewPages = displayMode === "a4" ? numberedA4DisplayPages : normalizedPages;
  const currentPreviewPageHtmls = useMemo(
    () => currentPreviewPages.map((page) => page.html),
    [currentPreviewPages],
  );
  const resolvedActiveSourceLineScrollMode = activeSourceLineScrollMode
    ?? (followActiveSourceLine ? "center" : "none");

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

  const updateActiveA4PageIndex = useCallback((nextPageIndex: number) => {
    activeA4PageIndexRef.current = nextPageIndex;
    setActiveA4PageIndex((currentPageIndex) => (
      currentPageIndex === nextPageIndex ? currentPageIndex : nextPageIndex
    ));
  }, []);

  const updateActiveA4PageIndexFromScroll = useCallback((previewViewport: HTMLElement) => {
    const previewPages = getA4PreviewPageElements(previewViewport);
    const nearestPageIndex = findNearestA4PreviewPageIndex(previewViewport, previewPages);

    if (nearestPageIndex === null) {
      return;
    }

    updateActiveA4PageIndex(nearestPageIndex);
  }, [updateActiveA4PageIndex]);

  const handlePreviewScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    updateActiveA4PageIndexFromScroll(event.currentTarget);
  }, [updateActiveA4PageIndexFromScroll]);

  const interactiveViewportNavigationEnabled = enableInteractiveViewportNavigation && onZoomScaleChange !== undefined;

  const startPreviewPageTransitionFade = useCallback(() => {
    const previewViewport = previewViewportRef.current;
    const duration = Math.max(0, pageTransitionFadeMs);

    if (previewViewport === null || duration <= 0) {
      return;
    }

    const viewportRect = previewViewport.getBoundingClientRect();

    if (viewportRect.width <= 0 || viewportRect.height <= 0) {
      return;
    }

    pageTransitionAnimationRef.current?.cancel();
    pageTransitionOverlayRef.current?.remove();

    const overlay = previewViewport.cloneNode(true) as HTMLElement;
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.add("preview-section__transition-overlay");
    overlay.style.left = `${viewportRect.left}px`;
    overlay.style.top = `${viewportRect.top}px`;
    overlay.style.width = `${viewportRect.width}px`;
    overlay.style.height = `${viewportRect.height}px`;
    overlay.scrollLeft = previewViewport.scrollLeft;
    overlay.scrollTop = previewViewport.scrollTop;
    document.body.append(overlay);
    overlay.scrollLeft = previewViewport.scrollLeft;
    overlay.scrollTop = previewViewport.scrollTop;
    pageTransitionOverlayRef.current = overlay;

    const animation = overlay.animate(
      [
        { opacity: 1 },
        { opacity: 0 },
      ],
      {
        duration,
        easing: "linear",
      },
    );
    const cleanup = () => {
      if (pageTransitionAnimationRef.current === animation) {
        pageTransitionAnimationRef.current = null;
      }

      if (pageTransitionOverlayRef.current === overlay) {
        pageTransitionOverlayRef.current = null;
      }

      overlay.remove();
    };

    pageTransitionAnimationRef.current = animation;
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }, [pageTransitionFadeMs]);

  useEffect(() => (
    () => {
      pageTransitionAnimationRef.current?.cancel();
      pageTransitionAnimationRef.current = null;
      pageTransitionOverlayRef.current?.remove();
      pageTransitionOverlayRef.current = null;
    }
  ), []);

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

    if (eventTarget.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR) !== null) {
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

    if (suppressTextSelectionOnDoubleClick) {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    }

    onSourceLineDoubleClick(sourceLine);
  }, [onSourceLineDoubleClick, suppressTextSelectionOnDoubleClick]);

  const handlePreviewMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressTextSelectionOnDoubleClick || event.detail < 2) {
      return;
    }

    const eventTarget = resolveEventTargetElement(event.target);

    if (eventTarget?.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR) !== null) {
      return;
    }

    event.preventDefault();
  }, [suppressTextSelectionOnDoubleClick]);

  const handlePreviewClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const eventTarget = resolveEventTargetElement(event.target);

    if (eventTarget === null) {
      return;
    }

    const anchor = eventTarget.closest<HTMLAnchorElement>("a[href]");

    if (anchor === null) {
      return;
    }

    const hashTargetId = resolvePreviewHashTargetId(anchor);

    if (hashTargetId !== null) {
      event.preventDefault();
      scrollPreviewHashTarget(event.currentTarget, hashTargetId);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const externalLink = resolveExternalLink(anchor);

    if (externalLink === null || onOpenExternalLink === undefined) {
      return;
    }

    onOpenExternalLink(externalLink);
  }, [onOpenExternalLink]);

  const handlePreviewSubmit = useCallback((event: ReactFormEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlePreviewContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (onPreviewContextMenu === undefined) {
      return;
    }

    clearViewportPan();
    event.preventDefault();
    const eventTarget = resolveEventTargetElement(event.target);
    const modelViewer = eventTarget?.closest<HTMLElement>(`.${KMARK_MODEL_VIEWER_CLASS_NAME}`) ?? null;

    onPreviewContextMenu(event.clientX, event.clientY, modelViewer, event.currentTarget);
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

  const maxA4PageWidthPx = useMemo(
    () => {
      const pageWidths = a4DisplayPages
        .map((page) => cssLengthToPx(page.pageStyle.width))
        .filter(Number.isFinite);

      return pageWidths.length > 0 ? Math.max(...pageWidths) : A4_PAGE_WIDTH_FOR_FIT_PX;
    },
    [a4DisplayPages],
  );

  const activeA4Page = a4DisplayPages[Math.min(activeA4PageIndex, Math.max(0, a4DisplayPages.length - 1))]
    ?? a4DisplayPages[0]
    ?? null;

  useEffect(() => {
    activeA4PageIndexRef.current = activeA4PageIndex;
  }, [activeA4PageIndex]);

  useEffect(() => {
    if (displayMode !== "a4") {
      updateActiveA4PageIndex(0);
      return;
    }

    const maxPageIndex = Math.max(0, numberedA4DisplayPages.length - 1);
    const nextPageIndex = clamp(activeA4PageIndexRef.current, 0, maxPageIndex);

    updateActiveA4PageIndex(nextPageIndex);
  }, [displayMode, numberedA4DisplayPages.length, updateActiveA4PageIndex]);

  const standardPreviewContentStyle = useMemo(
    () => {
      const textStyle = normalizedPages[0]?.textStyle ?? defaultTextStyle;
      const style: PreviewCssProperties = { zoom: normalizedZoomScale };

      if (textStyle.fontFamily.trim().length > 0) {
        style["--kmark-font-family"] = textStyle.fontFamily;
      }

      if (textStyle.headingFontFamily.trim().length > 0) {
        style["--kmark-heading-font-family"] = textStyle.headingFontFamily;
      }

      return style;
    },
    [defaultTextStyle, normalizedPages, normalizedZoomScale],
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
      const paddingY = Number.parseFloat(previewBodyStyle.paddingTop) + Number.parseFloat(previewBodyStyle.paddingBottom);
      const availableWidth = Math.max(0, previewBody.clientWidth - paddingX);
      const availableHeight = Math.max(0, previewBody.clientHeight - paddingY);
      const activePageWidthPx = activeA4Page === null ? Number.NaN : cssLengthToPx(activeA4Page.pageStyle.width);
      const activePageHeightPx = activeA4Page === null ? Number.NaN : cssLengthToPx(activeA4Page.pageStyle.height);
      const nextScale = previewFitMode === "page"
        && Number.isFinite(activePageWidthPx)
        && Number.isFinite(activePageHeightPx)
        && activePageWidthPx > 0
        && activePageHeightPx > 0
        ? Math.max(
            MIN_A4_SCALE,
            Math.min(availableWidth / activePageWidthPx, availableHeight / activePageHeightPx),
          )
        : Math.max(
            MIN_A4_SCALE,
            availableWidth / maxA4PageWidthPx,
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
  }, [activeA4Page, displayMode, maxA4PageWidthPx, previewFitMode]);

  useLayoutEffect(() => {
    if (displayMode !== "a4") {
      return;
    }

    const previewViewport = previewViewportRef.current;
    let isCancelled = false;
    let animationFrameId: number | null = null;

    const updateA4Pagination = () => {
      if (isCancelled) {
        return;
      }

      const nextPages = paginateA4HtmlSegments(normalizedPages);

      setPaginatedA4PageState((currentState) => {
        if (
          currentState.sourceKey === a4PaginationSourceKey
          && arePreviewPagesEqual(currentState.pages, nextPages)
        ) {
          return currentState;
        }

        return {
          pages: nextPages,
          sourceKey: a4PaginationSourceKey,
        };
      });
    };

    const scheduleA4Pagination = () => {
      if (isCancelled) {
        return;
      }

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        updateA4Pagination();
      });
    };

    updateA4Pagination();
    void document.fonts?.ready.then(scheduleA4Pagination);

    const previewImages = previewViewport === null
      ? []
      : Array.from(previewViewport.querySelectorAll<HTMLImageElement>("img"));
    const previewVideos = previewViewport === null
      ? []
      : Array.from(previewViewport.querySelectorAll<HTMLVideoElement>("video"));

    for (const previewImage of previewImages) {
      if (!previewImage.complete) {
        previewImage.addEventListener("load", scheduleA4Pagination);
        previewImage.addEventListener("error", scheduleA4Pagination);
      }
    }
    for (const previewVideo of previewVideos) {
      if (previewVideo.readyState < 1) {
        previewVideo.addEventListener("loadedmetadata", scheduleA4Pagination);
        previewVideo.addEventListener("error", scheduleA4Pagination);
      }
    }

    return () => {
      isCancelled = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      for (const previewImage of previewImages) {
        previewImage.removeEventListener("load", scheduleA4Pagination);
        previewImage.removeEventListener("error", scheduleA4Pagination);
      }
      for (const previewVideo of previewVideos) {
        previewVideo.removeEventListener("loadedmetadata", scheduleA4Pagination);
        previewVideo.removeEventListener("error", scheduleA4Pagination);
      }
    };
  }, [a4PaginationSourceKey, displayMode, normalizedPages]);

  useLayoutEffect(() => {
    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    const previewVideos = Array.from(
      previewViewport.querySelectorAll<HTMLVideoElement>("video[data-kmark-video-source]"),
    );
    const videoCleanups: Array<() => void> = [];
    const handleVideoLoaded = (event: Event) => {
      if (event.currentTarget instanceof HTMLVideoElement) {
        syncKmarkVideoIntrinsicSize(event.currentTarget);
        hideVideoLoadError(event.currentTarget);
      }
    };
    const handleVideoError = (event: Event) => {
      if (event.currentTarget instanceof HTMLVideoElement) {
        showVideoLoadError(event.currentTarget);
      }
    };

    for (const previewVideo of previewVideos) {
      videoCleanups.push(prepareKmarkVideoPosterImage(previewVideo));
      ensureVideoErrorElement(previewVideo);
      videoCleanups.push(prepareKmarkVideoPosterFrame(previewVideo));
      previewVideo.addEventListener("loadedmetadata", handleVideoLoaded);
      previewVideo.addEventListener("loadeddata", handleVideoLoaded);
      previewVideo.addEventListener("canplay", handleVideoLoaded);
      previewVideo.addEventListener("error", handleVideoError);

      if (previewVideo.readyState >= VIDEO_HAVE_METADATA_READY_STATE) {
        syncKmarkVideoIntrinsicSize(previewVideo);
      }

      if (previewVideo.error !== null) {
        showVideoLoadError(previewVideo);
      } else if (previewVideo.readyState >= VIDEO_HAVE_METADATA_READY_STATE) {
        hideVideoLoadError(previewVideo);
      }
    }

    return () => {
      for (const cleanup of videoCleanups) {
        cleanup();
      }
      for (const previewVideo of previewVideos) {
        previewVideo.removeEventListener("loadedmetadata", handleVideoLoaded);
        previewVideo.removeEventListener("loadeddata", handleVideoLoaded);
        previewVideo.removeEventListener("canplay", handleVideoLoaded);
        previewVideo.removeEventListener("error", handleVideoError);
      }
    };
  }, [currentPreviewPageHtmls, html]);

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
  }, [currentDisplayScale, currentPreviewPageHtmls, html]);

  useLayoutEffect(() => {
    const previewViewport = previewViewportRef.current;
    const pendingViewportZoomAnchor = pendingViewportZoomAnchorRef.current;

    if (previewViewport === null || pendingViewportZoomAnchor === null) {
      return;
    }

    pendingViewportZoomAnchorRef.current = null;

    const maxScrollLeft = Math.max(0, previewViewport.scrollWidth - previewViewport.clientWidth);
    const maxScrollTop = Math.max(0, previewViewport.scrollHeight - previewViewport.clientHeight);
    const viewportRect = previewViewport.getBoundingClientRect();
    const anchorElement = pendingViewportZoomAnchor.anchorElement;
    let nextScrollLeft: number;
    let nextScrollTop: number;

    if (anchorElement !== null && anchorElement.isConnected && previewViewport.contains(anchorElement)) {
      const anchorRect = anchorElement.getBoundingClientRect();
      const anchorClientX = anchorRect.left
        + (pendingViewportZoomAnchor.anchorElementOffsetX * pendingViewportZoomAnchor.nextDisplayScale);
      const anchorClientY = anchorRect.top
        + (pendingViewportZoomAnchor.anchorElementOffsetY * pendingViewportZoomAnchor.nextDisplayScale);

      nextScrollLeft = clamp(
        previewViewport.scrollLeft + anchorClientX - viewportRect.left - pendingViewportZoomAnchor.viewportOffsetX,
        0,
        maxScrollLeft,
      );
      nextScrollTop = clamp(
        previewViewport.scrollTop + anchorClientY - viewportRect.top - pendingViewportZoomAnchor.viewportOffsetY,
        0,
        maxScrollTop,
      );
    } else {
      const contentAnchorX = (pendingViewportZoomAnchor.scrollLeft + pendingViewportZoomAnchor.viewportOffsetX)
        / pendingViewportZoomAnchor.previousDisplayScale;
      const contentAnchorY = (pendingViewportZoomAnchor.scrollTop + pendingViewportZoomAnchor.viewportOffsetY)
        / pendingViewportZoomAnchor.previousDisplayScale;

      nextScrollLeft = clamp(
        (contentAnchorX * pendingViewportZoomAnchor.nextDisplayScale) - pendingViewportZoomAnchor.viewportOffsetX,
        0,
        maxScrollLeft,
      );
      nextScrollTop = clamp(
        (contentAnchorY * pendingViewportZoomAnchor.nextDisplayScale) - pendingViewportZoomAnchor.viewportOffsetY,
        0,
        maxScrollTop,
      );
    }

    previewViewport.scrollTo({
      left: nextScrollLeft,
      top: nextScrollTop,
      behavior: "auto",
    });
  }, [currentDisplayScale]);

  useLayoutEffect(() => {
    if (displayMode !== "a4" || !pendingA4NavigationScrollRef.current) {
      return;
    }

    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      pendingA4NavigationScrollRef.current = false;
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const previewPages = getA4PreviewPageElements(previewViewport);
      const previewPage = previewPages[activeA4PageIndexRef.current] ?? null;

      pendingA4NavigationScrollRef.current = false;

      if (previewPage === null) {
        return;
      }

      scrollPreviewToA4Page(previewViewport, previewPage);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activeA4PageIndex, currentPreviewPageHtmls, displayMode, effectiveA4Scale]);

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
    const anchorElement = displayMode === "a4"
      ? resolveA4ZoomAnchorElement(previewViewport, event.target, event.clientX, event.clientY)
      : null;
    const anchorElementRect = anchorElement?.getBoundingClientRect() ?? null;
    const nextDisplayScale = displayMode === "a4"
      ? Math.max(MIN_A4_SCALE, a4FitScale * nextZoomScale)
      : nextZoomScale;

    pendingViewportZoomAnchorRef.current = {
      anchorElement,
      anchorElementOffsetX: anchorElementRect === null ? 0 : (event.clientX - anchorElementRect.left) / currentDisplayScale,
      anchorElementOffsetY: anchorElementRect === null ? 0 : (event.clientY - anchorElementRect.top) / currentDisplayScale,
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

    if (eventTarget === null || eventTarget.closest(PREVIEW_INTERACTIVE_ELEMENT_SELECTOR) !== null) {
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
    if (previewNavigationRequest === null) {
      return;
    }

    const previewViewport = previewViewportRef.current;

    if (previewViewport === null) {
      return;
    }

    if (displayMode !== "a4") {
      previewViewport.scrollBy({
        top: previewNavigationRequest.direction * Math.max(120, previewViewport.clientHeight * 0.85),
        behavior: "auto",
      });
      startPreviewPageTransitionFade();
      return;
    }

    const previewPages = getA4PreviewPageElements(previewViewport);

    if (previewPages.length === 0) {
      return;
    }

    const currentPageIndex = clamp(
      activeA4PageIndexRef.current,
      0,
      previewPages.length - 1,
    );
    const nextPageIndex = clamp(
      currentPageIndex + previewNavigationRequest.direction,
      0,
      previewPages.length - 1,
    );

    if (nextPageIndex === currentPageIndex) {
      updateActiveA4PageIndex(nextPageIndex);
      scrollPreviewToA4Page(previewViewport, previewPages[nextPageIndex]);
      return;
    }

    startPreviewPageTransitionFade();
    pendingA4NavigationScrollRef.current = true;
    updateActiveA4PageIndex(nextPageIndex);
  }, [displayMode, previewNavigationRequest, startPreviewPageTransitionFade, updateActiveA4PageIndex]);

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

    if (resolvedActiveSourceLineScrollMode === "none") {
      return () => {
        nextCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
      };
    }

    if (resolvedActiveSourceLineScrollMode === "page") {
      if (displayMode === "a4") {
        const previewPage = nextCursorTarget.closest<HTMLElement>(".preview-section__page-scale");

        if (previewPage !== null) {
          const previewPages = getA4PreviewPageElements(previewViewport);
          const targetPageIndex = previewPages.indexOf(previewPage);

          if (targetPageIndex >= 0) {
            const currentPageIndex = clamp(
              activeA4PageIndexRef.current,
              0,
              Math.max(0, previewPages.length - 1),
            );

            if (targetPageIndex !== currentPageIndex) {
              startPreviewPageTransitionFade();
              pendingA4NavigationScrollRef.current = true;
            }

            updateActiveA4PageIndex(targetPageIndex);
          }
        }
      }

      return () => {
        nextCursorTarget.classList.remove(PREVIEW_CURSOR_TARGET_CLASS_NAME);
      };
    }

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
  }, [
    activeSourceLine,
    currentDisplayScale,
    currentPreviewPageHtmls,
    displayMode,
    html,
    resolvedActiveSourceLineScrollMode,
    startPreviewPageTransitionFade,
    updateActiveA4PageIndex,
  ]);

  if (displayMode === "a4") {
    return (
      <section className="section section--preview" aria-label="Preview">
        <div
          ref={handlePreviewViewportRef}
          className="preview-section__body preview-section__body--a4"
          data-interactive-pan={enableInteractiveViewportNavigation ? "true" : "false"}
          data-panning={isViewportPanning ? "true" : "false"}
          onAuxClick={handlePreviewClick}
          onClick={handlePreviewClick}
          onContextMenu={handlePreviewContextMenu}
          onDoubleClick={handlePreviewDoubleClick}
          onMouseDown={handlePreviewMouseDown}
          onPointerCancel={handlePreviewPointerEnd}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerEnd}
          onScroll={handlePreviewScroll}
          onSubmit={handlePreviewSubmit}
          onWheel={handlePreviewWheel}
        >
          <div className="preview-section__page-stack">
            {numberedA4DisplayPages.map((page, index) => (
              <div
                key={index}
                className="preview-section__page-scale"
                style={getPreviewPageScaleStyle(page, effectiveA4Scale)}
              >
                <div className="preview-section__page-frame" style={getPreviewPageStyle(getPreviewPageConfig(page))}>
                  {renderPageChromeRegion("header", page.pageChromeConfig.header)}
                  <PreviewHtmlSurface
                    className="preview-section__page kmark-page-body markdown-body markdown-body--a4"
                    element="main"
                    html={page.html}
                  />
                  {renderPageChromeRegion("footer", page.pageChromeConfig.footer)}
                  {page.pageNumberText === null ? null : (
                    <div
                      className={getPageNumberClassName(page.pageNumberConfig.position)}
                      style={getPageNumberStyle(page.pageNumberConfig)}
                    >
                      {page.pageNumberText}
                    </div>
                  )}
                </div>
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
        onAuxClick={handlePreviewClick}
        onClick={handlePreviewClick}
        onContextMenu={handlePreviewContextMenu}
        onDoubleClick={handlePreviewDoubleClick}
        onMouseDown={handlePreviewMouseDown}
        onPointerCancel={handlePreviewPointerEnd}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerEnd}
        onSubmit={handlePreviewSubmit}
        onWheel={handlePreviewWheel}
      >
        <PreviewHtmlSurface
          className="preview-section__standard-content markdown-body"
          element="article"
          html={html}
          style={standardPreviewContentStyle}
        />
      </div>
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);
