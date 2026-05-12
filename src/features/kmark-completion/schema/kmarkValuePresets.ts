export const KMARK_LENGTH_VALUE_PRESETS: readonly string[] = [
  "100",
  "200",
  "300",
  "50%",
  "100%",
  "10mm",
  "20mm",
  "12pt",
  "1rem",
] as const;

export const KMARK_SIZE_VALUE_PRESETS: readonly string[] = [
  "fit",
  "page_fit",
  "page_fit_contain",
  ...KMARK_LENGTH_VALUE_PRESETS,
] as const;

export const KMARK_PAGE_LENGTH_VALUE_PRESETS: readonly string[] = [
  "10mm",
  "15mm",
  "20mm",
  "210mm",
  "297mm",
  "10.5pt",
  "12pt",
] as const;

export const KMARK_COLOR_VALUE_PRESETS: readonly string[] = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "red",
  "blue",
  "green",
  "transparent",
  "currentColor",
] as const;

export const KMARK_BOOLEAN_VALUE_PRESETS: readonly string[] = [
  "true",
  "false",
] as const;
