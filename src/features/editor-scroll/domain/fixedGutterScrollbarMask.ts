export type FixedGutterScrollbarMaskInput = {
  readonly editorLeft: number;
  readonly editorTop: number;
  readonly gutterLeft: number;
  readonly gutterWidth: number;
  readonly scrollerClientHeight: number;
  readonly scrollerOffsetHeight: number;
  readonly scrollerTop: number;
};

export type FixedGutterScrollbarMaskGeometry = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly visible: boolean;
  readonly width: number;
};

export function resolveFixedGutterScrollbarMaskGeometry(
  input: FixedGutterScrollbarMaskInput,
): FixedGutterScrollbarMaskGeometry {
  const width = Math.max(0, input.gutterWidth);
  const height = Math.max(0, input.scrollerOffsetHeight - input.scrollerClientHeight);
  const visible = Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0;

  return {
    height: visible ? height : 0,
    left: visible ? input.gutterLeft - input.editorLeft : 0,
    top: visible ? input.scrollerTop - input.editorTop + input.scrollerClientHeight : 0,
    visible,
    width: visible ? width : 0,
  };
}
