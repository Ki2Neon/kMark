import {
  resolveA4PageContentRect,
  resolveA4PageFitAvailableSize,
  resolveA4PageFitContainSize,
  resolveA4PageValignSpacerHeight,
  type A4PageFitRect,
  type A4PageInsets,
} from "../../domain/a4PageFit";

const PAGE_LAYOUT_SPACER_ATTRIBUTE = "data-kmark-page-layout-spacer";
const intrinsicRatios = new WeakMap<Element, number>();

function cssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function frameInsets(style: CSSStyleDeclaration, prefix: "border" | "padding"): A4PageInsets {
  const suffix = prefix === "border" ? "-width" : "";
  return {
    top: cssPx(style.getPropertyValue(`${prefix}-top${suffix}`)),
    right: cssPx(style.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: cssPx(style.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: cssPx(style.getPropertyValue(`${prefix}-left${suffix}`)),
  };
}

function pageFrameGeometry(frame: HTMLElement): { bounds: A4PageFitRect; scale: number } | null {
  const rect = frame.getBoundingClientRect();
  const style = frame.ownerDocument.defaultView?.getComputedStyle(frame);
  if (style === undefined || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const unscaledWidth = cssPx(style.width) || frame.offsetWidth;
  const scale = rect.width / unscaledWidth;
  const bounds = resolveA4PageContentRect(
    rect,
    frameInsets(style, "border"),
    frameInsets(style, "padding"),
    scale,
  );
  return bounds === null ? null : { bounds, scale };
}

type PageFitTarget = { readonly element: Element; readonly contain: boolean };

function pageFitElements(body: HTMLElement): PageFitTarget[] {
  const targets = Array.from(body.querySelectorAll("[data-kmark-page-fit]"))
    .map((element) => ({
      element,
      contain: element.getAttribute("data-kmark-page-fit") === "contain",
    }));
  for (const block of body.querySelectorAll<HTMLElement>("[data-kmark-generated-svg-page-fit]")) {
    const svg = block.querySelector(".kmark-generated-svg-rendered svg");
    if (svg !== null) {
      targets.push({
        element: svg,
        contain: block.dataset.kmarkGeneratedSvgPageFit === "contain",
      });
    }
  }
  return targets;
}

function intrinsicAspectRatio(element: Element, rect: DOMRect): number {
  const tag = element.tagName.toLowerCase();
  if (tag === "img") {
    const image = element as HTMLImageElement;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      return image.naturalWidth / image.naturalHeight;
    }
  }
  if (tag === "video") {
    const video = element as HTMLVideoElement;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return video.videoWidth / video.videoHeight;
    }
  }
  if (tag === "svg") {
    const viewBox = element.getAttribute("viewBox")?.trim().split(/[\s,]+/u).map(Number);
    if (viewBox?.length === 4 && (viewBox[2] ?? 0) > 0 && (viewBox[3] ?? 0) > 0) {
      return (viewBox[2] ?? 0) / (viewBox[3] ?? 1);
    }
  }

  const cached = intrinsicRatios.get(element);
  if (cached !== undefined) {
    return cached;
  }

  const ratio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : Number.NaN;
  if (Number.isFinite(ratio) && ratio > 0) {
    intrinsicRatios.set(element, ratio);
  }
  return ratio;
}

function setCssLength(style: CSSStyleDeclaration, name: string, value: number): void {
  const cssValue = `${Math.round(value * 1_000) / 1_000}px`;
  if (style.getPropertyValue(name) !== cssValue) {
    style.setProperty(name, cssValue);
  }
}

function syncPageFit(body: HTMLElement, bounds: A4PageFitRect, scale: number): void {
  for (const { element, contain } of pageFitElements(body)) {
    const style = (element as HTMLElement | SVGElement).style;
    const rect = element.getBoundingClientRect();
    const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
    const available = resolveA4PageFitAvailableSize(
      bounds,
      rect,
      scale,
      cssPx(computed?.marginRight ?? ""),
      cssPx(computed?.marginBottom ?? ""),
    );
    const aspectRatio = contain ? intrinsicAspectRatio(element, rect) : Number.NaN;

    setCssLength(style, "--kmark-page-fit-width", available.width);
    setCssLength(style, "--kmark-page-fit-height", available.height);

    if (!contain) {
      continue;
    }

    const contained = resolveA4PageFitContainSize(aspectRatio, available.width, available.height);
    if (contained === null) {
      style.removeProperty("--kmark-page-fit-contain-width");
      style.removeProperty("--kmark-page-fit-contain-height");
      continue;
    }
    setCssLength(style, "--kmark-page-fit-contain-width", contained.width);
    setCssLength(style, "--kmark-page-fit-contain-height", contained.height);
  }
}

function pageValignTargets(body: HTMLElement): HTMLElement[] {
  return Array.from(body.children).filter((child): child is HTMLElement => (
    child.getAttribute("data-page-valign") === "center"
    || child.getAttribute("data-page-valign") === "bottom"
  ));
}

function resetPageValignSpacers(body: HTMLElement): void {
  for (const child of Array.from(body.children)) {
    if (child.hasAttribute(PAGE_LAYOUT_SPACER_ATTRIBUTE)) {
      (child as HTMLElement).style.height = "0px";
    }
  }
}

function syncPageValign(body: HTMLElement, bounds: A4PageFitRect, scale: number): void {
  for (const target of pageValignTargets(body)) {
    const valign = target.dataset.pageValign as "center" | "bottom";
    let spacer = target.previousElementSibling;
    if (spacer === null || !spacer.hasAttribute(PAGE_LAYOUT_SPACER_ATTRIBUTE)) {
      spacer = body.ownerDocument.createElement("div");
      spacer.setAttribute(PAGE_LAYOUT_SPACER_ATTRIBUTE, "");
      spacer.setAttribute("aria-hidden", "true");
      (spacer as HTMLElement).style.cssText = "display:block;min-height:0;margin:0;padding:0;border:0;height:0px;pointer-events:none";
      target.before(spacer);
    }

    const rect = target.getBoundingClientRect();
    const marginBottom = cssPx(target.ownerDocument.defaultView?.getComputedStyle(target).marginBottom ?? "");
    const height = resolveA4PageValignSpacerHeight(valign, bounds.bottom, rect.bottom, scale, marginBottom);
    setCssLength((spacer as HTMLElement).style, "height", height);
  }
}

/** Applies only page-local sizing and placement; never creates another page. */
export function syncA4PageLayout(root: ParentNode): void {
  for (const frame of root.querySelectorAll<HTMLElement>(".preview-section__page-frame")) {
    const body = frame.querySelector<HTMLElement>(":scope > .preview-section__page");
    if (body === null || body.querySelector("[data-kmark-page-fit], [data-kmark-generated-svg-page-fit], [data-page-valign]") === null) {
      continue;
    }
    const geometry = pageFrameGeometry(frame);
    if (geometry === null) {
      continue;
    }

    resetPageValignSpacers(body);
    syncPageFit(body, geometry.bounds, geometry.scale);
    syncPageValign(body, geometry.bounds, geometry.scale);
    syncPageFit(body, geometry.bounds, geometry.scale);
  }
}
