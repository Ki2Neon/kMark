export type MultiCursorModifier = "alt" | "ctrlCmd";

export type StartupEditMode = "start-page" | "blank";

export type AppFontId = string;

export type EditFontId = string;

export type EditFontSizePx = number;

export type SystemFontSizePx = number;

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
  readonly systemFontSizePx: SystemFontSizePx;
  readonly editFontSizePx: EditFontSizePx;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly lineWrappingEnabled: boolean;
  readonly showLineNumbers: boolean;
  readonly startupEditMode: StartupEditMode;
  readonly windowsStartupTrayResidentEnabled: boolean;
};

export const DEFAULT_EDIT_FONT_SIZE_PX = 15;

export const MIN_EDIT_FONT_SIZE_PX = 10;

export const MAX_EDIT_FONT_SIZE_PX = 36;

export const DEFAULT_SYSTEM_FONT_SIZE_PX = 16;

export const MIN_SYSTEM_FONT_SIZE_PX = 11;

export const MAX_SYSTEM_FONT_SIZE_PX = 24;


export const MULTI_CURSOR_MODIFIER_OPTIONS: readonly MultiCursorModifierOption[] = [
  { id: "alt", label: "Alt + Click" },
  { id: "ctrlCmd", label: "Ctrl + Click" },
] as const;

export const STARTUP_EDIT_MODE_OPTIONS: readonly StartupEditModeOption[] = [
  { id: "start-page", label: "スタートページ" },
  { id: "blank", label: "無地" },
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
