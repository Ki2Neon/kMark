export type AnchoredDialogGroupPositionInput = {
  readonly anchorOffsetX: number;
  readonly anchorOffsetY: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly groupHeight: number;
  readonly groupWidth: number;
  readonly margin: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
};

export type AnchoredDialogGroupPosition = {
  readonly left: number;
  readonly top: number;
};

export function resolveAnchoredDialogGroupPosition(
  input: AnchoredDialogGroupPositionInput,
): AnchoredDialogGroupPosition {
  const preferredLeft = input.anchorX - input.anchorOffsetX;
  const preferredTop = input.anchorY - input.anchorOffsetY;
  const maximumLeft = Math.max(input.margin, input.viewportWidth - input.margin - input.groupWidth);
  const maximumTop = Math.max(input.margin, input.viewportHeight - input.margin - input.groupHeight);

  return {
    left: clamp(preferredLeft, input.margin, maximumLeft),
    top: clamp(preferredTop, input.margin, maximumTop),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
