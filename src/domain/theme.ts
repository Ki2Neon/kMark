export type AppThemeId =
  | "vscode-dark"
  | "vscode-light"
  | "github-dark"
  | "github-light"
  | "dracula"
  | "night-owl"
  | "monokai"
  | "paper";

export type AppThemeOption = {
  readonly id: AppThemeId;
  readonly label: string;
};

export type ThemePreferences = {
  readonly appThemeId: AppThemeId;
  readonly previewThemeId: string | null;
  readonly previewUsesAppThemeColors: boolean;
};

export const APP_THEME_OPTIONS: readonly AppThemeOption[] = [
  { id: "vscode-dark", label: "VS Code Dark" },
  { id: "vscode-light", label: "VS Code Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "github-light", label: "GitHub Light" },
  { id: "dracula", label: "Dracula" },
  { id: "night-owl", label: "Night Owl" },
  { id: "monokai", label: "Monokai" },
  { id: "paper", label: "Paper" },
] as const;

const APP_THEME_ID_SET = new Set<AppThemeId>(APP_THEME_OPTIONS.map((themeOption) => themeOption.id));

export function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEME_ID_SET.has(value as AppThemeId);
}
