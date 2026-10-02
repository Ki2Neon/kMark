export type PreviewNativeDragPolicyInput = {
  readonly interactionEnabled: boolean;
  readonly pendingPanPointerId: number | null;
};

/** Native dragging yields to an accepted preview pan candidate, regardless of renderer. */
export function shouldSuppressPreviewNativeDrag({
  interactionEnabled,
  pendingPanPointerId,
}: PreviewNativeDragPolicyInput): boolean {
  return interactionEnabled && pendingPanPointerId !== null;
}
