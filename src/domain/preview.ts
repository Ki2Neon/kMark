export type PreviewDisplayMode = "standard" | "a4";

export type PageNumberPosition =
  | "none"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PageNumberStyle =
  | "decimal"
  | "lower-roman"
  | "upper-roman"
  | "lower-alpha"
  | "upper-alpha";

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
  readonly fontSize: string;
  readonly fontFamily: string;
  readonly headingFontFamily: string;
};

export type PageNumberConfig = {
  readonly position: PageNumberPosition;
  readonly format: string;
  readonly start: number;
  readonly reset: boolean;
  readonly count: boolean;
  readonly visible: boolean;
  readonly style: PageNumberStyle;
  readonly fontSize: string;
  readonly color: string;
  readonly marginTop: string;
  readonly marginBottom: string;
  readonly marginLeft: string;
  readonly marginRight: string;
};

export type PageChromeRegionConfig = {
  readonly enabled: boolean;
  readonly left?: string;
  readonly center?: string;
  readonly right?: string;
  readonly opacity: string;
  readonly offset?: string | null;
  readonly borderSize?: string | null;
  readonly borderColor?: string | null;
  readonly borderStyle?: string | null;
  readonly fontSize?: string | null;
  readonly fontFamily?: string | null;
  readonly fontColor?: string | null;
};

export type PageChromeConfig = {
  readonly header: PageChromeRegionConfig;
  readonly footer: PageChromeRegionConfig;
};

export type RenderedPreviewPage = {
  readonly html: string;
  readonly pageStyle: PageStyle;
  readonly textStyle: PreviewTextStyle;
  readonly pageNumberConfig: PageNumberConfig;
  readonly pageChromeConfig: PageChromeConfig;
};

export const PREVIEW_DISPLAY_MODE_OPTIONS: readonly PreviewDisplayModeOption[] = [
  { id: "standard", label: "通常" },
  { id: "a4", label: "用紙" },
] as const;

export const CSS_MM_TO_PX = 96 / 25.4;

export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;
export const A4_MARGIN_TOP_MM = 16;
export const A4_MARGIN_RIGHT_MM = 16;
export const A4_MARGIN_BOTTOM_MM = 18;
export const A4_MARGIN_LEFT_MM = 16;
export const DEFAULT_PREVIEW_FONT_SIZE = "10.5pt";
export const DEFAULT_PREVIEW_FONT_FAMILY = "BIZ UDPGothic";

export const DEFAULT_PAGE_STYLE: PageStyle = {
  width: `${A4_PAGE_WIDTH_MM}mm`,
  height: `${A4_PAGE_HEIGHT_MM}mm`,
  marginTop: `${A4_MARGIN_TOP_MM}mm`,
  marginRight: `${A4_MARGIN_RIGHT_MM}mm`,
  marginBottom: `${A4_MARGIN_BOTTOM_MM}mm`,
  marginLeft: `${A4_MARGIN_LEFT_MM}mm`,
} as const;

export const DEFAULT_PREVIEW_TEXT_STYLE: PreviewTextStyle = {
  fontSize: DEFAULT_PREVIEW_FONT_SIZE,
  fontFamily: DEFAULT_PREVIEW_FONT_FAMILY,
  headingFontFamily: "",
} as const;

export const DEFAULT_PAGE_NUMBER_CONFIG: PageNumberConfig = {
  position: "none",
  format: "{page}",
  start: 1,
  reset: false,
  count: true,
  visible: true,
  style: "decimal",
  fontSize: "10pt",
  color: "#666",
  marginTop: "8mm",
  marginBottom: "8mm",
  marginLeft: "12mm",
  marginRight: "12mm",
} as const;

export const DEFAULT_PAGE_CHROME_CONFIG: PageChromeConfig = {
  header: {
    enabled: false,
    opacity: "1",
    offset: null,
  },
  footer: {
    enabled: false,
    opacity: "1",
    offset: null,
  },
} as const;

const PREVIEW_DISPLAY_MODE_SET = new Set<PreviewDisplayMode>(
  PREVIEW_DISPLAY_MODE_OPTIONS.map((previewDisplayModeOption) => previewDisplayModeOption.id),
);

export function isPreviewDisplayMode(value: string): value is PreviewDisplayMode {
  return PREVIEW_DISPLAY_MODE_SET.has(value as PreviewDisplayMode);
}
