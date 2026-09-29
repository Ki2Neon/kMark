import type { RenderedPreviewPage } from "../../domain/preview";
import { syncA4PageLayout } from "./browserPageLayout";

const OVERFLOW_TOLERANCE_PX = 1;
const INLINE_TAGS = new Set(["a", "abbr", "b", "cite", "del", "em", "i", "ins", "mark", "small", "span", "strong", "sub", "sup", "u"]);
const ATOMIC_INLINE_CLASSES = new Set(["kmark-model-viewer", "kmark-model-error"]);
const CJK_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/u;
const HEADING = /^h[1-6]$/u;

type PageMeasure = {
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  readonly body: HTMLElement;
  readonly height: number;
  readonly html: string[];
  readonly needsPageLayout: boolean;
};

function createMeasure(page: RenderedPreviewPage): PageMeasure {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;overflow:visible";
  const frame = document.createElement("div");
  frame.className = "preview-section__page-frame";
  frame.style.setProperty("--kmark-page-width", page.pageStyle.width);
  frame.style.setProperty("--kmark-page-height", page.pageStyle.height);
  frame.style.setProperty("--kmark-page-margin-top", page.pageStyle.marginTop);
  frame.style.setProperty("--kmark-page-margin-right", page.pageStyle.marginRight);
  frame.style.setProperty("--kmark-page-margin-bottom", page.pageStyle.marginBottom);
  frame.style.setProperty("--kmark-page-margin-left", page.pageStyle.marginLeft);
  frame.style.setProperty("--kmark-font-size", page.textStyle.fontSize);
  if (page.textStyle.fontFamily.trim()) {
    frame.style.setProperty("--kmark-font-family", page.textStyle.fontFamily);
  }
  if (page.textStyle.headingFontFamily.trim()) {
    frame.style.setProperty("--kmark-heading-font-family", page.textStyle.headingFontFamily);
  }
  const body = document.createElement("main");
  body.className = "preview-section__page kmark-page-body markdown-body markdown-body--a4";
  frame.append(body);
  root.append(frame);
  document.body.append(root);
  const style = getComputedStyle(frame);
  const height = frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const needsPageLayout = /data-kmark-page-fit|data-kmark-generated-svg-page-fit|data-page-valign/u.test(page.html);
  return { root, frame, body, height, html: [], needsPageLayout };
}

function contentHeight(body: HTMLElement): number {
  const bodyTop = body.getBoundingClientRect().top;
  const last = body.lastChild;
  let bottom = bodyTop;
  if (last instanceof Element) {
    const style = getComputedStyle(last);
    bottom = last.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0);
  } else if (last?.textContent?.trim()) {
    const range = document.createRange();
    range.selectNode(last);
    bottom = range.getBoundingClientRect().bottom;
  }
  return Math.max(body.scrollHeight, bottom - bodyTop);
}

function overflowing(measure: PageMeasure): boolean {
  // page_fit and page_valign change geometry, so measure their settled layout.
  if (measure.needsPageLayout) syncA4PageLayout(measure.root);
  return contentHeight(measure.body) > measure.height + OVERFLOW_TOLERANCE_PX;
}

function hasContent(element: Element): boolean {
  if (element.matches("pre,code") && Boolean(element.textContent?.length)) return true;
  return Array.from(element.childNodes).some((node) => (
    node.nodeType === Node.TEXT_NODE
      ? Boolean(node.textContent?.trim())
      : node instanceof Element && (node.matches("img,video,svg,br,hr,input") || hasContent(node))
  ));
}

function commit(measure: PageMeasure): void {
  if (!hasContent(measure.body)) {
    measure.body.replaceChildren();
    return;
  }
  // The live preview rebuilds these placement spacers for its own geometry.
  measure.body.querySelectorAll("[data-kmark-page-layout-spacer]").forEach((spacer) => spacer.remove());
  measure.html.push(measure.body.innerHTML);
  measure.body.replaceChildren();
}

function appendWhole(measure: PageMeasure, node: Node): boolean {
  const clone = node.cloneNode(true);
  measure.body.append(clone);
  if (!overflowing(measure)) {
    return true;
  }
  clone.parentNode?.removeChild(clone);
  measure.body.querySelectorAll("[data-kmark-page-layout-spacer]").forEach((spacer) => spacer.remove());
  return false;
}

function textTokens(text: string): string[] {
  return (text.match(/\s+|[^\s]+/gu) ?? []).flatMap((token) => (
    CJK_TEXT.test(token) || Array.from(token).length > 24 ? Array.from(token) : [token]
  ));
}

function inlineUnits(element: Element): Node[] {
  return Array.from(element.childNodes).flatMap((node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      return textTokens(node.textContent ?? "").map((text) => document.createTextNode(text));
    }
    if (node instanceof Element && INLINE_TAGS.has(node.tagName.toLowerCase())
      && !Array.from(ATOMIC_INLINE_CLASSES).some((name) => node.classList.contains(name))) {
      const children = inlineUnits(node);
      return children.length > 0 ? children.map((child, index) => {
        const shell = node.cloneNode(false);
        if (index > 0 && shell instanceof Element) shell.removeAttribute("id");
        shell.appendChild(child);
        return shell;
      }) : [node.cloneNode(true)];
    }
    return [node.cloneNode(true)];
  });
}

type Shell = { readonly root: HTMLElement; readonly slot: HTMLElement };

function appendUnits(
  measure: PageMeasure,
  units: readonly Node[],
  makeShell: (continuation: boolean) => Shell,
): void {
  let continuation = false;
  let shell: Shell | null = null;
  for (const unit of units) {
    if (shell === null) {
      shell = makeShell(continuation);
      measure.body.append(shell.root);
    }
    const clone = unit.cloneNode(true);
    shell.slot.append(clone);
    if (!overflowing(measure)) {
      continue;
    }
    clone.parentNode?.removeChild(clone);
    if (!hasContent(shell.slot)) {
      shell.root.remove();
    }
    if (hasContent(measure.body)) {
      commit(measure);
    }
    continuation = true;
    shell = makeShell(true);
    measure.body.append(shell.root);
    shell.slot.append(clone);
    if (overflowing(measure)) {
      // An indivisible unit larger than a page must remain visible once.
      commit(measure);
      shell = null;
    }
  }
}

function splitParagraph(measure: PageMeasure, element: HTMLElement): void {
  appendUnits(measure, inlineUnits(element), (continuation) => {
    const root = element.cloneNode(false) as HTMLElement;
    if (continuation) root.removeAttribute("id");
    return { root, slot: root };
  });
}

function listItems(element: Element): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI");
}

type ListItemUnit = { readonly paragraph: HTMLElement | null; readonly node: Node };

function listItemUnits(item: HTMLElement): ListItemUnit[] {
  return Array.from(item.childNodes).flatMap((child): ListItemUnit[] => {
    if (child.nodeType === Node.TEXT_NODE) {
      return textTokens(child.textContent ?? "").map((text) => ({ paragraph: null, node: document.createTextNode(text) }));
    }
    if (child instanceof HTMLElement && child.tagName === "P") {
      return inlineUnits(child).map((node) => ({ paragraph: child, node }));
    }
    if (child instanceof Element && INLINE_TAGS.has(child.tagName.toLowerCase())) {
      return inlineUnits(child).map((node, index) => {
        const shell = child.cloneNode(false);
        if (index > 0 && shell instanceof Element) shell.removeAttribute("id");
        shell.appendChild(node);
        return { paragraph: null, node: shell };
      });
    }
    return [{ paragraph: null, node: child.cloneNode(true) }];
  });
}

function splitList(measure: PageMeasure, element: HTMLElement): void {
  const items = listItems(element);
  let activeList: HTMLElement | null = null;
  let continuation = false;
  let completedItems = 0;
  let continuingItem = false;
  const originalStart = Number.parseInt(element.getAttribute("start") ?? "", 10);
  const reversed = element.hasAttribute("reversed");
  const firstNumber = Number.isFinite(originalStart) ? originalStart : reversed ? items.length : 1;
  const list = (): HTMLElement => {
    if (activeList !== null) return activeList;
    activeList = element.cloneNode(false) as HTMLElement;
    if (continuation) {
      activeList.classList.add("kmark-list-continuation");
      activeList.removeAttribute("id");
      if (activeList.tagName === "OL") {
        activeList.setAttribute("start", String(firstNumber + (reversed ? -completedItems : completedItems)));
      }
    }
    measure.body.append(activeList);
    return activeList;
  };
  const breakPage = (): void => {
    commit(measure);
    activeList = null;
    continuation = true;
  };

  for (const item of items) {
    const whole = item.cloneNode(true);
    list().append(whole);
    if (!overflowing(measure)) {
      completedItems += 1;
      continue;
    }
    whole.parentNode?.removeChild(whole);

    const units = listItemUnits(item);
    if (units.length < 2) {
      if (hasContent(measure.body)) breakPage();
      list().append(item.cloneNode(true));
      if (overflowing(measure)) breakPage();
      completedItems += 1;
      continue;
    }

    let activeItem: HTMLElement | null = null;
    let activeParagraph: HTMLElement | null = null;
    let paragraphSource: HTMLElement | null = null;
    const itemShell = (): HTMLElement => {
      if (activeItem !== null) return activeItem;
      activeItem = item.cloneNode(false) as HTMLElement;
      if (continuation) {
        activeItem.classList.add("kmark-li-continuation");
        activeItem.removeAttribute("id");
        if (continuingItem) activeItem.style.listStyleType = "none";
      }
      list().append(activeItem);
      activeParagraph = null;
      paragraphSource = null;
      return activeItem;
    };
    const appendUnit = (unit: ListItemUnit): Node => {
      let slot = itemShell();
      if (unit.paragraph !== null) {
        if (paragraphSource !== unit.paragraph || activeParagraph === null) {
          activeParagraph = unit.paragraph.cloneNode(false) as HTMLElement;
          activeParagraph.removeAttribute("id");
          slot.append(activeParagraph);
          paragraphSource = unit.paragraph;
        }
        slot = activeParagraph;
      } else {
        activeParagraph = null;
        paragraphSource = null;
      }
      const clone = unit.node.cloneNode(true);
      slot.appendChild(clone);
      return clone;
    };

    for (const unit of units) {
      const added = appendUnit(unit);
      if (!overflowing(measure)) continue;
      added.parentNode?.removeChild(added);
      const currentParagraph = activeParagraph as HTMLElement | null;
      const currentItem = activeItem as HTMLElement | null;
      if (currentParagraph !== null && !hasContent(currentParagraph)) currentParagraph.remove();
      if (currentItem !== null && !hasContent(currentItem)) currentItem.remove();
      continuingItem = currentItem !== null && hasContent(currentItem);
      breakPage();
      activeItem = null;
      activeParagraph = null;
      paragraphSource = null;
      appendUnit(unit);
      if (overflowing(measure)) {
        breakPage();
        activeItem = null;
        activeParagraph = null;
        paragraphSource = null;
      }
    }
    completedItems += 1;
    continuingItem = false;
  }
}

function splitTable(measure: PageMeasure, table: HTMLElement): void {
  const headers = Array.from(table.children).filter((child) => /^(CAPTION|COLGROUP|THEAD)$/u.test(child.tagName));
  const footers = Array.from(table.children).filter((child) => child.tagName === "TFOOT");
  const rows = Array.from(table.children)
    .filter((child) => child.tagName === "TBODY")
    .flatMap((body) => Array.from(body.children).filter((row): row is HTMLElement => row instanceof HTMLElement && row.tagName === "TR"));
  if (rows.length === 0) {
    appendAtomic(measure, table);
    return;
  }
  appendUnits(measure, rows, (continuation) => {
    const root = table.cloneNode(false) as HTMLElement;
    if (continuation) root.removeAttribute("id");
    for (const header of headers) root.append(header.cloneNode(true));
    const slot = document.createElement("tbody");
    root.append(slot);
    return { root, slot };
  });
  if (footers.length === 0) return;
  const activeTable = measure.body.lastElementChild;
  if (activeTable?.tagName !== "TABLE") {
    const footerTable = table.cloneNode(false) as HTMLElement;
    for (const footer of footers) footerTable.append(footer.cloneNode(true));
    measure.body.append(footerTable);
    return;
  }
  for (const footer of footers) activeTable.append(footer.cloneNode(true));
  if (overflowing(measure)) {
    activeTable.querySelectorAll(":scope > tfoot").forEach((footer) => footer.remove());
    commit(measure);
    const footerTable = table.cloneNode(false) as HTMLElement;
    for (const footer of footers) footerTable.append(footer.cloneNode(true));
    measure.body.append(footerTable);
  }
}

function codeLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  return lines.flatMap((line, index) => index < lines.length - 1 ? [`${line}\n`] : line ? [line] : []);
}

function splitPre(measure: PageMeasure, pre: HTMLElement): void {
  const code = pre.querySelector(":scope > code");
  const lines = codeLines(code?.textContent ?? pre.textContent ?? "");
  appendUnits(measure, lines.map((line) => document.createTextNode(line)), (continuation) => {
    const root = pre.cloneNode(false) as HTMLElement;
    if (continuation) root.removeAttribute("id");
    const slot = code?.cloneNode(false) as HTMLElement | undefined ?? document.createElement("code");
    if (continuation) slot.removeAttribute("id");
    root.append(slot);
    return { root, slot };
  });
}

function splitToc(measure: PageMeasure, toc: HTMLElement): void {
  const sourceList = Array.from(toc.children).find((child) => child.matches("ul,ol"));
  let rowIndex = 0;
  const items = Array.from(toc.querySelectorAll<HTMLElement>(".kmark-toc__item"), (item) => {
    const flatItem = item.cloneNode(false) as HTMLElement;
    const depth = Number(item.dataset.tocNestDepth ?? item.dataset.tocDepth ?? "0");
    const indent = Number.isFinite(depth) ? Math.max(0, depth) * 1.25 : 0;
    const row = Array.from(item.children).find((child) => child.classList.contains("kmark-toc__row"));
    let flatRow: HTMLElement | null = null;
    if (row) {
      flatRow = row.cloneNode(true) as HTMLElement;
    } else {
      const label = Array.from(item.children).find((child) => child.matches(".kmark-toc__link,.kmark-toc__text"));
      const directText = Array.from(item.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("").trim();
      if (label || directText) {
        flatRow = document.createElement("div");
        flatRow.className = "kmark-toc__row";
        if (label) {
          flatRow.append(label.cloneNode(true));
        } else {
          const text = document.createElement("span");
          text.className = "kmark-toc__text";
          text.textContent = directText;
          flatRow.append(text);
        }
        const page = document.createElement("span");
        page.className = "kmark-toc__page";
        flatRow.append(page);
      }
    }
    if (flatRow) {
      flatRow.classList.remove("kmark-toc__row--odd", "kmark-toc__row--even");
      flatRow.classList.add(rowIndex % 2 === 0 ? "kmark-toc__row--odd" : "kmark-toc__row--even");
      flatRow.style.setProperty("--kmark-toc-row-indent", `${indent.toFixed(2)}em`);
      flatItem.append(flatRow);
    }
    rowIndex += 1;
    return flatItem;
  });
  if (sourceList === undefined || items.length === 0) {
    appendAtomic(measure, toc);
    return;
  }
  appendUnits(measure, items, (continuation) => {
    const root = toc.cloneNode(false) as HTMLElement;
    if (continuation) {
      root.classList.add("kmark-toc--continuation");
      root.removeAttribute("id");
    } else {
      const title = toc.querySelector(":scope > .kmark-toc__title");
      const header = toc.querySelector(":scope > .kmark-toc__header");
      if (title) root.append(title.cloneNode(true));
      if (header) {
        root.append(header.cloneNode(true));
      } else {
        const createdHeader = document.createElement("div");
        createdHeader.className = "kmark-toc__header";
        createdHeader.innerHTML = '<span class="kmark-toc__header-item">項目名</span><span class="kmark-toc__header-page">ページ番号</span>';
        root.append(createdHeader);
      }
    }
    const slot = sourceList.cloneNode(false) as HTMLElement;
    if (continuation) {
      slot.classList.add("kmark-list-continuation");
      slot.removeAttribute("id");
    }
    root.append(slot);
    return { root, slot };
  });
}

function splitContainer(measure: PageMeasure, element: HTMLElement): void {
  const children = Array.from(element.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
  appendUnits(measure, children, (continuation) => {
    const root = element.cloneNode(false) as HTMLElement;
    if (continuation) root.removeAttribute("id");
    return { root, slot: root };
  });
}

function appendAtomic(measure: PageMeasure, node: Node): void {
  if (hasContent(measure.body)) commit(measure);
  measure.body.append(node.cloneNode(true));
  if (overflowing(measure)) commit(measure);
}

function appendNode(measure: PageMeasure, node: Node): void {
  if (appendWhole(measure, node)) return;
  if (!(node instanceof HTMLElement)) {
    appendAtomic(measure, node);
    return;
  }
  if (node.classList.contains("kmark-toc")) {
    splitToc(measure, node);
  } else if (node.tagName === "P") {
    splitParagraph(measure, node);
  } else if (node.matches("ul,ol")) {
    splitList(measure, node);
  } else if (node.tagName === "TABLE") {
    splitTable(measure, node);
  } else if (node.tagName === "PRE") {
    splitPre(measure, node);
  } else if (node.matches("blockquote,section,article") || (node.tagName === "DIV" && !node.hasAttribute("data-kmark-scope"))) {
    splitContainer(measure, node);
  } else {
    appendAtomic(measure, node);
  }
}

function minimumNextNode(node: Node): Node {
  if (!(node instanceof HTMLElement)) return node.cloneNode(true);
  if (node.tagName === "P") {
    const shell = node.cloneNode(false);
    const first = inlineUnits(node)[0];
    if (first) shell.appendChild(first);
    return shell;
  }
  if (node.matches("ul,ol")) {
    const shell = node.cloneNode(false);
    const first = listItems(node)[0];
    if (first) shell.appendChild(first.cloneNode(true));
    return shell;
  }
  if (node.tagName === "TABLE") {
    const shell = node.cloneNode(false);
    const first = node.querySelector("tbody > tr");
    if (first) {
      const body = document.createElement("tbody");
      body.append(first.cloneNode(true));
      shell.appendChild(body);
    }
    return shell;
  }
  if (node.tagName === "PRE") {
    const shell = document.createElement("pre");
    shell.textContent = codeLines(node.textContent ?? "")[0] ?? "";
    return shell;
  }
  return node.cloneNode(true);
}

function headingNeedsNextPage(measure: PageMeasure, heading: HTMLElement, next: Node): boolean {
  if (!hasContent(measure.body)) return false;
  const headingClone = heading.cloneNode(true);
  const nextClone = minimumNextNode(next);
  measure.body.append(headingClone, nextClone);
  const needsNextPage = overflowing(measure);
  headingClone.parentNode?.removeChild(headingClone);
  nextClone.parentNode?.removeChild(nextClone);
  measure.body.querySelectorAll("[data-kmark-page-layout-spacer]").forEach((spacer) => spacer.remove());
  return needsNextPage;
}

/**
 * Browser measurement adapter. Explicit Rust pages remain the boundaries;
 * only overflow within one explicit page produces continuation pages.
 */
export function paginateA4RenderedPage(page: RenderedPreviewPage): readonly RenderedPreviewPage[] {
  const measure = createMeasure(page);
  try {
    const template = document.createElement("template");
    template.innerHTML = page.html;
    const nodes = Array.from(template.content.childNodes)
      .filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node === undefined) continue;
      const next = nodes[index + 1];
      if (node instanceof HTMLElement && HEADING.test(node.tagName.toLowerCase())
        && next !== undefined && headingNeedsNextPage(measure, node, next)) {
        commit(measure);
      }
      appendNode(measure, node);
      const valign = node instanceof HTMLElement ? node.dataset.pageValign : undefined;
      const nextValign = next instanceof HTMLElement ? next.dataset.pageValign : undefined;
      if ((valign === "center" || valign === "bottom")
        && !(valign === "center" && nextValign === "bottom")) {
        commit(measure);
      }
    }
    commit(measure);
    const pages = measure.html.length > 0 ? measure.html : [""];
    return pages.map((html, index) => ({
      ...page,
      html,
      pageNumberConfig: index === 0 ? page.pageNumberConfig : { ...page.pageNumberConfig, reset: false },
    }));
  } finally {
    measure.root.remove();
  }
}
