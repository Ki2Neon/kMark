export type MultiCursorModifier = "alt" | "ctrlCmd";

export type StartupDraftMode = "start-page" | "blank" | "last-opened-file";

export type AppFontId = string;

export type DraftFontId = string;

export type DraftFontSizePx = number;

export type MultiCursorModifierOption = {
  readonly id: MultiCursorModifier;
  readonly label: string;
};

export type StartupDraftModeOption = {
  readonly id: StartupDraftMode;
  readonly label: string;
};

export type AppFontOption = {
  readonly value: string;
  readonly label: string;
};

export type DraftFontOption = {
  readonly value: string;
  readonly label: string;
};

export type EditorPreferences = {
  readonly appFontId: AppFontId;
  readonly draftFontId: DraftFontId;
  readonly draftFontSizePx: DraftFontSizePx;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly startupDraftMode: StartupDraftMode;
};

const DEFAULT_APP_FONT_FAMILY = '"Aptos", "Segoe UI Variable", "Segoe UI", sans-serif';

const DEFAULT_DRAFT_FONT_FAMILY = '"Iosevka Term", "Cascadia Code", Consolas, monospace';

export const DEFAULT_DRAFT_FONT_SIZE_PX = 15;

export const MIN_DRAFT_FONT_SIZE_PX = 10;

export const MAX_DRAFT_FONT_SIZE_PX = 36;

const APP_FONT_SUGGESTED_FAMILY_BY_NAME: Readonly<Record<string, string>> = {
  aptos: DEFAULT_APP_FONT_FAMILY,
  "segoe ui": '"Segoe UI Variable", "Segoe UI", sans-serif',
  "segoe ui variable": '"Segoe UI Variable", "Segoe UI", sans-serif',
  "yu gothic ui": '"Yu Gothic UI", "Yu Gothic", sans-serif',
  meiryo: '"Meiryo", sans-serif',
  "biz udpgothic": '"BIZ UDPGothic", "Yu Gothic UI", sans-serif',
  "biz udp gothic": '"BIZ UDPGothic", "Yu Gothic UI", sans-serif',
  "noto sans jp": '"Noto Sans JP", sans-serif',
  inter: 'Inter, "Segoe UI Variable", "Segoe UI", sans-serif',
  "sans-serif": 'sans-serif',
  serif: 'serif',
  monospace: 'monospace',
};

const DRAFT_FONT_SUGGESTED_FAMILY_BY_NAME: Readonly<Record<string, string>> = {
  "iosevka term": DEFAULT_DRAFT_FONT_FAMILY,
  "cascadia code": '"Cascadia Code", Consolas, monospace',
  consolas: '"Consolas", "Courier New", monospace',
  aptos: DEFAULT_APP_FONT_FAMILY,
  "yu gothic ui": '"Yu Gothic UI", "Yu Gothic", sans-serif',
  meiryo: '"Meiryo", sans-serif',
  "fira code": '"Fira Code", Consolas, monospace',
  "jetbrains mono": '"JetBrains Mono", Consolas, monospace',
  monospace: 'monospace',
  "sans-serif": 'sans-serif',
};

const APP_FONT_DISPLAY_VALUE_BY_LEGACY_ID: Readonly<Record<string, string>> = {
  aptos: "Aptos",
  "segoe-ui": "Segoe UI",
  "yu-gothic": "Yu Gothic UI",
  meiryo: "Meiryo",
  "biz-udp": "BIZ UDPGothic",
};

const DRAFT_FONT_DISPLAY_VALUE_BY_LEGACY_ID: Readonly<Record<string, string>> = {
  iosevka: "Iosevka Term",
  cascadia: "Cascadia Code",
  consolas: "Consolas",
  aptos: "Aptos",
  "yu-gothic": "Yu Gothic UI",
  meiryo: "Meiryo",
};

export const MULTI_CURSOR_MODIFIER_OPTIONS: readonly MultiCursorModifierOption[] = [
  { id: "alt", label: "Alt + Click" },
  { id: "ctrlCmd", label: "Ctrl + Click" },
] as const;

export const STARTUP_DRAFT_MODE_OPTIONS: readonly StartupDraftModeOption[] = [
  { id: "start-page", label: "スタートページ" },
  { id: "blank", label: "無地" },
  { id: "last-opened-file", label: "前回開いたファイル" },
] as const;

export const APP_FONT_OPTIONS: readonly AppFontOption[] = [
  { value: "Aptos", label: "Aptos" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Yu Gothic UI", label: "Yu Gothic UI" },
  { value: "Meiryo", label: "Meiryo" },
  { value: "BIZ UDPGothic", label: "BIZ UDPGothic" },
  { value: "Noto Sans JP", label: "Noto Sans JP" },
  { value: 'Inter, "Segoe UI Variable", "Segoe UI", sans-serif', label: "Inter + Segoe UI" },
] as const;

export const DRAFT_FONT_OPTIONS: readonly DraftFontOption[] = [
  { value: "Iosevka Term", label: "Iosevka Term" },
  { value: "Cascadia Code", label: "Cascadia Code" },
  { value: "Consolas", label: "Consolas" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Aptos", label: "Aptos" },
  { value: "Yu Gothic UI", label: "Yu Gothic UI" },
  { value: "Meiryo", label: "Meiryo" },
] as const;

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  appFontId: "Aptos",
  draftFontId: "Iosevka Term",
  draftFontSizePx: DEFAULT_DRAFT_FONT_SIZE_PX,
  multiCursorModifier: "alt",
  showLineNumbers: false,
  startupDraftMode: "last-opened-file",
};

const MULTI_CURSOR_MODIFIER_SET = new Set<MultiCursorModifier>(
  MULTI_CURSOR_MODIFIER_OPTIONS.map((modifierOption) => modifierOption.id),
);

const STARTUP_DRAFT_MODE_SET = new Set<StartupDraftMode>(
  STARTUP_DRAFT_MODE_OPTIONS.map((startupDraftModeOption) => startupDraftModeOption.id),
);

export function isMultiCursorModifier(value: string): value is MultiCursorModifier {
  return MULTI_CURSOR_MODIFIER_SET.has(value as MultiCursorModifier);
}

export function isStartupDraftMode(value: string): value is StartupDraftMode {
  return STARTUP_DRAFT_MODE_SET.has(value as StartupDraftMode);
}

export function clampDraftFontSizePx(value: number): DraftFontSizePx {
  if (!Number.isFinite(value)) {
    return DEFAULT_DRAFT_FONT_SIZE_PX;
  }

  return Math.min(MAX_DRAFT_FONT_SIZE_PX, Math.max(MIN_DRAFT_FONT_SIZE_PX, Math.round(value)));
}

function sanitizeFontPreference(value: string): string {
  return value.replace(/[\u0000-\u001f;]/gu, " ").replace(/\s+/gu, " ").trim();
}

function normalizeFontFamily(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("'")) {
    return value;
  }

  return /\s/u.test(value) ? `"${value}"` : value;
}

function resolveKnownFontFamily(value: string, knownFamilies: Readonly<Record<string, string>>, fallback: string): string {
  const sanitizedValue = sanitizeFontPreference(value);

  if (sanitizedValue.length === 0) {
    return fallback;
  }

  return knownFamilies[sanitizedValue.toLowerCase()] ?? normalizeFontFamily(sanitizedValue);
}

export function deserializeAppFontId(value: unknown): AppFontId {
  if (typeof value !== "string") {
    return DEFAULT_EDITOR_PREFERENCES.appFontId;
  }

  const sanitizedValue = sanitizeFontPreference(value);

  if (sanitizedValue.length === 0) {
    return DEFAULT_EDITOR_PREFERENCES.appFontId;
  }

  return APP_FONT_DISPLAY_VALUE_BY_LEGACY_ID[sanitizedValue.toLowerCase()] ?? sanitizedValue;
}

export function deserializeDraftFontId(value: unknown): DraftFontId {
  if (typeof value !== "string") {
    return DEFAULT_EDITOR_PREFERENCES.draftFontId;
  }

  const sanitizedValue = sanitizeFontPreference(value);

  if (sanitizedValue.length === 0) {
    return DEFAULT_EDITOR_PREFERENCES.draftFontId;
  }

  return DRAFT_FONT_DISPLAY_VALUE_BY_LEGACY_ID[sanitizedValue.toLowerCase()] ?? sanitizedValue;
}

export function deserializeDraftFontSizePx(value: unknown): DraftFontSizePx {
  if (typeof value !== "number") {
    return DEFAULT_EDITOR_PREFERENCES.draftFontSizePx;
  }

  return clampDraftFontSizePx(value);
}

export function deserializeShowLineNumbers(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_EDITOR_PREFERENCES.showLineNumbers;
}

export function resolveAppFontFamily(appFontId: AppFontId): string {
  return resolveKnownFontFamily(appFontId, APP_FONT_SUGGESTED_FAMILY_BY_NAME, DEFAULT_APP_FONT_FAMILY);
}

export function resolveDraftFontFamily(draftFontId: DraftFontId): string {
  return resolveKnownFontFamily(draftFontId, DRAFT_FONT_SUGGESTED_FAMILY_BY_NAME, DEFAULT_DRAFT_FONT_FAMILY);
}