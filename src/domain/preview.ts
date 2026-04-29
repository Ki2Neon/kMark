export type PreviewDisplayMode = "standard" | "a4";

export type PreviewDisplayModeOption = {
  readonly id: PreviewDisplayMode;
  readonly label: string;
};

export type PreviewPreferences = {
  readonly previewDisplayMode: PreviewDisplayMode;
  readonly isPreviewVisible: boolean;
};

export const PREVIEW_DISPLAY_MODE_OPTIONS: readonly PreviewDisplayModeOption[] = [
  { id: "standard", label: "通常" },
  { id: "a4", label: "A4" },
] as const;

export const CSS_MM_TO_PX = 96 / 25.4;

export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;
export const A4_MARGIN_TOP_MM = 16;
export const A4_MARGIN_RIGHT_MM = 16;
export const A4_MARGIN_BOTTOM_MM = 18;
export const A4_MARGIN_LEFT_MM = 16;

export const A4_PAGE_WIDTH_PX = A4_PAGE_WIDTH_MM * CSS_MM_TO_PX;
export const A4_PAGE_HEIGHT_PX = A4_PAGE_HEIGHT_MM * CSS_MM_TO_PX;
export const A4_CONTENT_WIDTH_PX = A4_PAGE_WIDTH_PX - ((A4_MARGIN_LEFT_MM + A4_MARGIN_RIGHT_MM) * CSS_MM_TO_PX);
export const A4_CONTENT_HEIGHT_PX = A4_PAGE_HEIGHT_PX - ((A4_MARGIN_TOP_MM + A4_MARGIN_BOTTOM_MM) * CSS_MM_TO_PX);

const PREVIEW_DISPLAY_MODE_SET = new Set<PreviewDisplayMode>(
  PREVIEW_DISPLAY_MODE_OPTIONS.map((previewDisplayModeOption) => previewDisplayModeOption.id),
);

export function isPreviewDisplayMode(value: string): value is PreviewDisplayMode {
  return PREVIEW_DISPLAY_MODE_SET.has(value as PreviewDisplayMode);
}
