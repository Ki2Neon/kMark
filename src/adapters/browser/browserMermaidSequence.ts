const MESSAGE_VISIBLE_GAP = 8;
const LOOP_TITLE_TO_FIRST_MESSAGE_GAP = 28;
const DEFAULT_SEQUENCE_MESSAGE_FONT_SIZE_PX = 16;
const VERTICAL_POINT_ATTRIBUTES = ["y", "y1", "y2", "cy"] as const;

export function tightenMermaidSequenceMessageSpacing(svgElement: SVGElement): void {
  const messageTexts: Array<{ readonly element: SVGGraphicsElement; readonly y: number }> = [];

  for (const element of Array.from(svgElement.querySelectorAll<SVGGraphicsElement>(
    ".messageText, .messageLine0, .messageLine1",
  ))) {
    if (element.classList.contains("messageText")) {
      const y = readNumericAttribute(element, "y");
      if (y !== undefined) {
        messageTexts.push({ element, y });
      }
      continue;
    }

    const lineY = readNumericAttribute(element, "y1");
    const lastText = messageTexts[messageTexts.length - 1];
    if (lineY !== undefined && lastText !== undefined) {
      const currentGap = lineY - lastText.y;
      const targetGap = resolveTextDyPx(lastText.element) + MESSAGE_VISIBLE_GAP;
      const offset = Math.max(0, currentGap - targetGap);

      for (const text of messageTexts) {
        text.element.setAttribute("y", `${text.y + offset}`);
      }
    }

    messageTexts.length = 0;
  }

  compactLoopContents(svgElement);
}

function compactLoopContents(svgElement: SVGElement): void {
  const textElements = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>(".messageText"));
  const allControlStructures = Array.from(svgElement.querySelectorAll<SVGGElement>('g[data-et="control-structure"]'));
  const loops = allControlStructures
    .filter((structure) => structure.querySelector(".labelText")?.textContent?.trim().toLowerCase() === "loop")
    .sort((left, right) => (resolveFrameBounds(left)?.top ?? Infinity) - (resolveFrameBounds(right)?.top ?? Infinity));

  for (const loop of loops) {
    const bounds = resolveFrameBounds(loop);
    if (bounds === undefined) {
      continue;
    }

    const title = loop.querySelector<SVGGraphicsElement>(".loopText");
    const titleY = title === null ? undefined : readNumericAttribute(title, "y");
    const firstText = textElements
      .map((element) => ({ element, y: readNumericAttribute(element, "y") }))
      .filter((entry): entry is { readonly element: SVGGraphicsElement; readonly y: number } => (
        entry.y !== undefined && entry.y > bounds.top && entry.y < bounds.bottom
      ))
      .sort((left, right) => left.y - right.y)[0];

    if (titleY === undefined || firstText === undefined) {
      continue;
    }
    const nestedStructureStartsFirst = allControlStructures.some((structure) => {
      if (structure === loop) {
        return false;
      }
      const nestedBounds = resolveFrameBounds(structure);

      return nestedBounds !== undefined
        && nestedBounds.top > bounds.top
        && nestedBounds.top < firstText.y;
    });
    if (nestedStructureStartsFirst) {
      continue;
    }

    const firstTextY = firstText.y + resolveTextDyPx(firstText.element);
    const offset = Math.max(0, firstTextY - titleY - LOOP_TITLE_TO_FIRST_MESSAGE_GAP);
    if (offset === 0) {
      continue;
    }

    collapseVerticalBand(svgElement, firstText.y, offset);
  }
}

function resolveFrameBounds(structure: SVGGElement): { readonly top: number; readonly bottom: number } | undefined {
  const horizontalYs = Array.from(structure.querySelectorAll<SVGGraphicsElement>(".loopLine"))
    .map((line) => [readNumericAttribute(line, "y1"), readNumericAttribute(line, "y2")] as const)
    .filter((y): y is readonly [number, number] => y[0] !== undefined && y[0] === y[1])
    .map((y) => y[0]);
  if (horizontalYs.length < 2) {
    return undefined;
  }

  return { top: Math.min(...horizontalYs), bottom: Math.max(...horizontalYs) };
}

function collapseVerticalBand(svgElement: SVGElement, cutY: number, offset: number): void {
  for (const element of Array.from(svgElement.querySelectorAll<SVGGraphicsElement>("*"))) {
    if (element.closest?.("defs") != null) {
      continue;
    }

    shrinkSpanningHeight(element, cutY, offset);
    for (const attribute of VERTICAL_POINT_ATTRIBUTES) {
      shiftNumericAttributeAtOrAfter(element, attribute, cutY, offset);
    }
    shiftPointListAtOrAfter(element, cutY, offset);
  }

  const viewBox = svgElement.getAttribute("viewBox")?.trim().split(/\s+/u).map(Number);
  if (viewBox?.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    return;
  }

  viewBox[3] -= offset;
  svgElement.setAttribute("viewBox", viewBox.join(" "));
}

function shrinkSpanningHeight(element: SVGGraphicsElement, cutY: number, offset: number): void {
  const y = readNumericAttribute(element, "y");
  const height = readNumericAttribute(element, "height");
  if (y !== undefined && height !== undefined && y < cutY && y + height >= cutY) {
    element.setAttribute("height", `${Math.max(0, height - offset)}`);
  }
}

function shiftPointListAtOrAfter(element: SVGGraphicsElement, cutY: number, offset: number): void {
  const points = element.getAttribute("points")?.trim();
  if (points === undefined || points.length === 0) {
    return;
  }

  const shifted = points.split(/\s+/u).map((point) => {
    const [x, rawY] = point.split(",");
    const y = Number(rawY);

    return x !== undefined && Number.isFinite(y) && y >= cutY ? `${x},${y - offset}` : point;
  });
  element.setAttribute("points", shifted.join(" "));
}

function resolveTextDyPx(element: SVGGraphicsElement): number {
  const rawDy = element.getAttribute("dy")?.trim();
  const value = Number.parseFloat(rawDy ?? "");
  if (!Number.isFinite(value)) {
    return 0;
  }

  const fontSize = Number.parseFloat(element.style.fontSize) || DEFAULT_SEQUENCE_MESSAGE_FONT_SIZE_PX;
  return rawDy?.toLowerCase().endsWith("em") === true ? value * fontSize : value;
}

function readNumericAttribute(element: SVGGraphicsElement, name: string): number | undefined {
  const rawValue = element.getAttribute(name);
  if (rawValue === null || rawValue.trim().length === 0) {
    return undefined;
  }

  const value = Number(rawValue);

  return Number.isFinite(value) ? value : undefined;
}

function shiftNumericAttributeAtOrAfter(
  element: SVGGraphicsElement,
  name: string,
  cutY: number,
  offset: number,
): void {
  const value = readNumericAttribute(element, name);
  if (value !== undefined && value >= cutY) {
    element.setAttribute(name, `${value - offset}`);
  }
}
