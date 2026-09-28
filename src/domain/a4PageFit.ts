export type A4PageFitRect = {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
};

export type A4PageFitSize = {
  readonly height: number;
  readonly width: number;
};

export type A4PageInsets = {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
};

/** A fixed page content box in viewport coordinates, independent of document overflow. */
export function resolveA4PageContentRect(
  frameRect: A4PageFitRect,
  border: A4PageInsets,
  padding: A4PageInsets,
  displayScale: number,
): A4PageFitRect | null {
  if (!Number.isFinite(displayScale) || displayScale <= 0) {
    return null;
  }

  const left = frameRect.left + (border.left + padding.left) * displayScale;
  const top = frameRect.top + (border.top + padding.top) * displayScale;
  const right = frameRect.right - (border.right + padding.right) * displayScale;
  const bottom = frameRect.bottom - (border.bottom + padding.bottom) * displayScale;

  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return null;
  }

  return { left, top, right, bottom };
}

function resolveNonNegativeLength(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resolveA4PageFitAvailableSize(
  contentRect: A4PageFitRect,
  elementRect: A4PageFitRect,
  displayScale: number,
  marginRight = 0,
  marginBottom = 0,
): A4PageFitSize {
  const normalizedScale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;

  return {
    width: resolveNonNegativeLength((contentRect.right - elementRect.left) / normalizedScale - marginRight),
    height: resolveNonNegativeLength((contentRect.bottom - elementRect.top) / normalizedScale - marginBottom),
  };
}

export function resolveA4PageValignSpacerHeight(
  valign: "center" | "bottom",
  contentBottom: number,
  elementBottom: number,
  displayScale: number,
  marginBottom = 0,
): number {
  if (!Number.isFinite(displayScale) || displayScale <= 0) {
    return 0;
  }

  const remaining = resolveNonNegativeLength((contentBottom - elementBottom) / displayScale - marginBottom);
  return valign === "center" ? remaining / 2 : remaining;
}

export function resolveA4PageFitContainSize(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number,
): A4PageFitSize | null {
  const normalizedMaxWidth = resolveNonNegativeLength(maxWidth);
  const normalizedMaxHeight = resolveNonNegativeLength(maxHeight);

  if (normalizedMaxWidth === 0 || normalizedMaxHeight === 0) {
    return { width: 0, height: 0 };
  }

  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }

  const heightFromWidth = normalizedMaxWidth / aspectRatio;

  if (heightFromWidth <= normalizedMaxHeight) {
    return {
      width: normalizedMaxWidth,
      height: heightFromWidth,
    };
  }

  return {
    width: normalizedMaxHeight * aspectRatio,
    height: normalizedMaxHeight,
  };
}
