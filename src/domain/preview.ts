export type PreviewDisplayMode = "standard" | "a4";

export type PreviewDisplayModeOption = {
  readonly id: PreviewDisplayMode;
  readonly label: string;
};

export type PreviewPreferences = {
  readonly previewDisplayMode: PreviewDisplayMode;
  readonly isPreviewVisible: boolean;
};

export type PageStyle = {
  readonly width: string;
  readonly height: string;
  readonly marginTop: string;
  readonly marginRight: string;
  readonly marginBottom: string;
  readonly marginLeft: string;
};

export type PreviewTextStyle = {
  readonly baseFontSize: string;
};

export type RenderedPreviewPage = {
  readonly html: string;
  readonly pageStyle: PageStyle;
  readonly textStyle: PreviewTextStyle;
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
export const DEFAULT_PREVIEW_FONT_SIZE = "16px";

export const DEFAULT_PAGE_STYLE: PageStyle = {
  width: `${A4_PAGE_WIDTH_MM}mm`,
  height: `${A4_PAGE_HEIGHT_MM}mm`,
  marginTop: `${A4_MARGIN_TOP_MM}mm`,
  marginRight: `${A4_MARGIN_RIGHT_MM}mm`,
  marginBottom: `${A4_MARGIN_BOTTOM_MM}mm`,
  marginLeft: `${A4_MARGIN_LEFT_MM}mm`,
} as const;

export const DEFAULT_PREVIEW_TEXT_STYLE: PreviewTextStyle = {
  baseFontSize: DEFAULT_PREVIEW_FONT_SIZE,
} as const;

const PREVIEW_DISPLAY_MODE_SET = new Set<PreviewDisplayMode>(
  PREVIEW_DISPLAY_MODE_OPTIONS.map((previewDisplayModeOption) => previewDisplayModeOption.id),
);

export function isPreviewDisplayMode(value: string): value is PreviewDisplayMode {
  return PREVIEW_DISPLAY_MODE_SET.has(value as PreviewDisplayMode);
}
