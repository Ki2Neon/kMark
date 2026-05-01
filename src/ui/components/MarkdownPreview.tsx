import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { A4_PAGE_HEIGHT_MM, A4_PAGE_WIDTH_MM, CSS_MM_TO_PX, type PreviewDisplayMode } from "../../domain/preview";

const A4_PAGE_WIDTH_FOR_FIT_PX = A4_PAGE_WIDTH_MM * CSS_MM_TO_PX;
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
const A4_PAGINATION_OVERFLOW_TOLERANCE_PX = 1;
const A4_PAGINATION_SOURCE_SEPARATOR = "\x1f";
const A4_PAGINATION_HEADING_TAG_NAMES = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const A4_PAGINATION_INLINE_SPLIT_TAG_NAMES = new Set(["a", "abbr", "b", "cite", "del", "em", "i", "ins", "mark", "small", "span", "strong", "sub", "sup", "u"]);
const A4_PAGINATION_CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;
const A4_PAGINATION_LONG_TEXT_TOKEN_LENGTH = 24;
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

type A4PaginationContext = {
  body: HTMLElement;
  frame: HTMLElement;
  readonly maxContentHeight: number;
  pageHtmls: string[];
  readonly root: HTMLElement;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function createA4PaginationPage(root: HTMLElement): Pick<A4PaginationContext, "body" | "frame" | "maxContentHeight"> {
  const frame = document.createElement("div");
  frame.className = "preview-section__page-frame";

  const body = document.createElement("article");
  body.className = "preview-section__page markdown-body markdown-body--a4";

  frame.append(body);
  root.append(frame);

  const frameStyle = window.getComputedStyle(frame);
  const paddingTop = Number.parseFloat(frameStyle.paddingTop);
  const paddingBottom = Number.parseFloat(frameStyle.paddingBottom);
  const maxContentHeight = Math.max(
    0,
    frame.clientHeight
      - (Number.isFinite(paddingTop) ? paddingTop : 0)
      - (Number.isFinite(paddingBottom) ? paddingBottom : 0),
  );

  return { body, frame, maxContentHeight };
}

function startA4PaginationPage(context: A4PaginationContext): void {
  const page = createA4PaginationPage(context.root);
  context.body = page.body;
  context.frame = page.frame;
}

function hasA4PaginationContent(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some((node) => !isIgnorableA4PaginationNode(node));
}

function commitA4PaginationPage(context: A4PaginationContext): void {
  if (!hasA4PaginationContent(context.body)) {
    return;
  }

  context.pageHtmls.push(context.body.innerHTML);
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
    body.scrollHeight,
    ...Array.from(body.childNodes).map((node) => getA4PaginationNodeBottomOffset(body, node)),
  );
}

function isA4PaginationPageOverflowing(context: A4PaginationContext): boolean {
  return getA4PaginationContentHeight(context.body)
    > context.maxContentHeight + A4_PAGINATION_OVERFLOW_TOLERANCE_PX;
}

function isIgnorableA4PaginationNode(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent?.trim() ?? "") === "";
}

function getA4PaginationNodes(html: string): readonly Node[] {
  const template = document.createElement("template");
  template.innerHTML = html;

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
  return node instanceof HTMLElement && A4_PAGINATION_INLINE_SPLIT_TAG_NAMES.has(node.tagName.toLowerCase());
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

function shouldMoveA4PaginationHeadingWithNext(
  context: A4PaginationContext,
  heading: HTMLElement,
  nextNode: Node,
): boolean {
  if (!hasA4PaginationContent(context.body)) {
    return false;
  }

  const headingClone = heading.cloneNode(true);
  const nextNodeClone = nextNode.cloneNode(true);

  context.body.append(headingClone, nextNodeClone);
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
    context.body.append(nextElement);
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

function appendSplitListElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const listItems = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "li");

  if (listItems.length === 0) {
    return false;
  }

  let activeList: HTMLElement | null = null;

  const startList = (): HTMLElement => {
    const nextList = cloneA4PaginationElementShell(element);
    context.body.append(nextList);
    activeList = nextList;
    return nextList;
  };

  for (const listItem of listItems) {
    const currentList = activeList ?? startList();
    const listItemClone = listItem.cloneNode(true);
    currentList.append(listItemClone);

    if (!isA4PaginationPageOverflowing(context)) {
      continue;
    }

    currentList.removeChild(listItemClone);

    if (hasA4PaginationContent(currentList)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      startList().append(listItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        activeList = null;
      }
      continue;
    }

    currentList.remove();

    if (hasA4PaginationContent(context.body)) {
      commitA4PaginationPage(context);
      startA4PaginationPage(context);
      startList().append(listItemClone);
      if (isA4PaginationPageOverflowing(context)) {
        commitA4PaginationPage(context);
        startA4PaginationPage(context);
        activeList = null;
      }
      continue;
    }

    startList().append(listItemClone);
    commitA4PaginationPage(context);
    startA4PaginationPage(context);
    activeList = null;
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
    context.body.append(nextTable);
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
      context.body.append(footerOnlyTable);
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
    context.body.append(nextPre);
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

function appendSplitContainerElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const childNodes = Array.from(element.childNodes).filter((node) => !isIgnorableA4PaginationNode(node));

  if (childNodes.length === 0) {
    return false;
  }

  let activeContainer: HTMLElement | null = null;

  const startContainer = (): HTMLElement => {
    const nextContainer = cloneA4PaginationElementShell(element);
    context.body.append(nextContainer);
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

function appendSplittableElementToA4Pages(context: A4PaginationContext, element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

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

function appendNodeToA4Pages(context: A4PaginationContext, node: Node): void {
  const nodeClone = node.cloneNode(true);
  context.body.append(nodeClone);

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

  context.body.append(node.cloneNode(true));
}

function paginateA4HtmlSegment(html: string): readonly string[] {
  const root = createA4PaginationMeasureRoot();
  const firstPage = createA4PaginationPage(root);
  const context: A4PaginationContext = {
    body: firstPage.body,
    frame: firstPage.frame,
    maxContentHeight: firstPage.maxContentHeight,
    pageHtmls: [],
    root,
  };

  try {
    const nodes = getA4PaginationNodes(html);

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

      appendNodeToA4Pages(context, node);
    }

    commitA4PaginationPage(context);

    return context.pageHtmls.length > 0 ? context.pageHtmls : [""];
  } finally {
    root.remove();
  }
}

function paginateA4HtmlSegments(htmlSegments: readonly string[]): readonly string[] {
  return htmlSegments.flatMap((htmlSegment) => [...paginateA4HtmlSegment(htmlSegment)]);
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
  const a4PaginationSourceKey = useMemo(
    () => normalizedPageHtmls.join(A4_PAGINATION_SOURCE_SEPARATOR),
    [normalizedPageHtmls],
  );
  const [paginatedA4PageState, setPaginatedA4PageState] = useState<{
    readonly pageHtmls: readonly string[];
    readonly sourceKey: string;
  }>({
    pageHtmls: [],
    sourceKey: "",
  });
  const a4DisplayPageHtmls = paginatedA4PageState.sourceKey === a4PaginationSourceKey
    ? paginatedA4PageState.pageHtmls
    : normalizedPageHtmls;
  const currentPreviewPageHtmls = displayMode === "a4" ? a4DisplayPageHtmls : normalizedPageHtmls;

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

  const a4PageScaleStyle = useMemo(
    () => ({
      "--a4-scale": effectiveA4Scale,
      width: `${A4_PAGE_WIDTH_MM * effectiveA4Scale}mm`,
      height: `${A4_PAGE_HEIGHT_MM * effectiveA4Scale}mm`,
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
        availableWidth / A4_PAGE_WIDTH_FOR_FIT_PX,
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

      const nextPageHtmls = paginateA4HtmlSegments(normalizedPageHtmls);

      setPaginatedA4PageState((currentState) => {
        if (
          currentState.sourceKey === a4PaginationSourceKey
          && areStringArraysEqual(currentState.pageHtmls, nextPageHtmls)
        ) {
          return currentState;
        }

        return {
          pageHtmls: nextPageHtmls,
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

    scheduleA4Pagination();
    void document.fonts?.ready.then(scheduleA4Pagination);

    const previewImages = previewViewport === null
      ? []
      : Array.from(previewViewport.querySelectorAll<HTMLImageElement>("img"));

    for (const previewImage of previewImages) {
      if (!previewImage.complete) {
        previewImage.addEventListener("load", scheduleA4Pagination);
        previewImage.addEventListener("error", scheduleA4Pagination);
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
    };
  }, [a4PaginationSourceKey, displayMode, normalizedPageHtmls]);

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
  }, [activeSourceLine, currentDisplayScale, currentPreviewPageHtmls, html]);

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
            {a4DisplayPageHtmls.map((pageHtml, index) => (
              <div key={`${index}-${pageHtml.length}`} className="preview-section__page-scale" style={a4PageScaleStyle}>
                <div className="preview-section__page-frame">
                  <article
                    className="preview-section__page markdown-body markdown-body--a4"
                    dangerouslySetInnerHTML={{ __html: pageHtml }}
                  />
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
