const WHEEL_DELTA_MODE_LINE = 1;
const WHEEL_DELTA_MODE_PAGE = 2;

export type ShiftWheelHorizontalScrollInput = {
  readonly altKey: boolean;
  readonly clientWidth: number;
  readonly ctrlKey: boolean;
  readonly defaultPrevented: boolean;
  readonly deltaMode: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly lineHeight: number;
  readonly metaKey: boolean;
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly shiftKey: boolean;
};

export type ShiftWheelHorizontalScrollDecision = {
  readonly handled: boolean;
  readonly nextScrollLeft: number;
};

export function resolveShiftWheelHorizontalScroll(
  input: ShiftWheelHorizontalScrollInput,
): ShiftWheelHorizontalScrollDecision {
  if (
    input.defaultPrevented
    || !input.shiftKey
    || input.altKey
    || input.ctrlKey
    || input.metaKey
  ) {
    return createIgnoredDecision(input.scrollLeft);
  }

  const maxScrollLeft = Math.max(0, input.scrollWidth - input.clientWidth);

  if (!Number.isFinite(maxScrollLeft) || maxScrollLeft <= 0) {
    return createIgnoredDecision(input.scrollLeft);
  }

  const dominantDelta = Math.abs(input.deltaX) >= Math.abs(input.deltaY)
    ? input.deltaX
    : input.deltaY;

  if (!Number.isFinite(dominantDelta) || dominantDelta === 0) {
    return createIgnoredDecision(input.scrollLeft);
  }

  const deltaScale = input.deltaMode === WHEEL_DELTA_MODE_LINE
    ? Math.max(1, input.lineHeight)
    : input.deltaMode === WHEEL_DELTA_MODE_PAGE
      ? Math.max(1, input.clientWidth)
      : 1;
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, input.scrollLeft + dominantDelta * deltaScale),
  );

  return {
    handled: true,
    nextScrollLeft,
  };
}

function createIgnoredDecision(scrollLeft: number): ShiftWheelHorizontalScrollDecision {
  return {
    handled: false,
    nextScrollLeft: scrollLeft,
  };
}
