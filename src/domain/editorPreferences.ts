export type MultiCursorModifier = "alt" | "ctrlCmd";

export type StartupEditMode = "start-page" | "blank" | "last-opened-file";

export type AppFontId = string;

export type EditFontId = string;

export type EditFontSizePx = number;

export type MultiCursorModifierOption = {
  readonly id: MultiCursorModifier;
  readonly label: string;
};

export type StartupEditModeOption = {
  readonly id: StartupEditMode;
  readonly label: string;
};

export type AppFontOption = {
  readonly value: string;
  readonly label: string;
};

export type EditFontOption = {
  readonly value: string;
  readonly label: string;
};

export type EditorPreferences = {
  readonly appFontId: AppFontId;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly startupEditMode: StartupEditMode;
  readonly windowsStartupTrayResidentEnabled: boolean;
};

const DEFAULT_APP_FONT_FAMILY = '"Aptos", "Segoe UI Variable", "Segoe UI", sans-serif';

const DEFAULT_EDIT_FONT_FAMILY = '"Iosevka Term", "Cascadia Code", Consolas, monospace';

export const DEFAULT_EDIT_FONT_SIZE_PX = 15;

export const MIN_EDIT_FONT_SIZE_PX = 10;

export const MAX_EDIT_FONT_SIZE_PX = 36;

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

const EDIT_FONT_SUGGESTED_FAMILY_BY_NAME: Readonly<Record<string, string>> = {
  "iosevka term": DEFAULT_EDIT_FONT_FAMILY,
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

const EDIT_FONT_DISPLAY_VALUE_BY_LEGACY_ID: Readonly<Record<string, string>> = {
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

export const STARTUP_EDIT_MODE_OPTIONS: readonly StartupEditModeOption[] = [
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

export const EDIT_FONT_OPTIONS: readonly EditFontOption[] = [
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
  editFontId: "Iosevka Term",
  editFontSizePx: DEFAULT_EDIT_FONT_SIZE_PX,
  multiCursorModifier: "alt",
  showLineNumbers: false,
  startupEditMode: "last-opened-file",
  windowsStartupTrayResidentEnabled: true,
};

const MULTI_CURSOR_MODIFIER_SET = new Set<MultiCursorModifier>(
  MULTI_CURSOR_MODIFIER_OPTIONS.map((modifierOption) => modifierOption.id),
);

const STARTUP_EDIT_MODE_SET = new Set<StartupEditMode>(
  STARTUP_EDIT_MODE_OPTIONS.map((startupEditModeOption) => startupEditModeOption.id),
);

export function isMultiCursorModifier(value: string): value is MultiCursorModifier {
  return MULTI_CURSOR_MODIFIER_SET.has(value as MultiCursorModifier);
}

export function isStartupEditMode(value: string): value is StartupEditMode {
  return STARTUP_EDIT_MODE_SET.has(value as StartupEditMode);
}

export function clampEditFontSizePx(value: number): EditFontSizePx {
  if (!Number.isFinite(value)) {
    return DEFAULT_EDIT_FONT_SIZE_PX;
  }

  return Math.min(MAX_EDIT_FONT_SIZE_PX, Math.max(MIN_EDIT_FONT_SIZE_PX, Math.round(value)));
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

export function deserializeEditFontId(value: unknown): EditFontId {
  if (typeof value !== "string") {
    return DEFAULT_EDITOR_PREFERENCES.editFontId;
  }

  const sanitizedValue = sanitizeFontPreference(value);

  if (sanitizedValue.length === 0) {
    return DEFAULT_EDITOR_PREFERENCES.editFontId;
  }

  return EDIT_FONT_DISPLAY_VALUE_BY_LEGACY_ID[sanitizedValue.toLowerCase()] ?? sanitizedValue;
}

export function deserializeEditFontSizePx(value: unknown): EditFontSizePx {
  if (typeof value !== "number") {
    return DEFAULT_EDITOR_PREFERENCES.editFontSizePx;
  }

  return clampEditFontSizePx(value);
}

export function deserializeShowLineNumbers(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_EDITOR_PREFERENCES.showLineNumbers;
}

export function deserializeWindowsStartupTrayResidentEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_EDITOR_PREFERENCES.windowsStartupTrayResidentEnabled;
}

export function resolveAppFontFamily(appFontId: AppFontId): string {
  return resolveKnownFontFamily(appFontId, APP_FONT_SUGGESTED_FAMILY_BY_NAME, DEFAULT_APP_FONT_FAMILY);
}

export function resolveEditFontFamily(editFontId: EditFontId): string {
  return resolveKnownFontFamily(editFontId, EDIT_FONT_SUGGESTED_FAMILY_BY_NAME, DEFAULT_EDIT_FONT_FAMILY);
}