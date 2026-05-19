export type SubWindowMode = "preview-sync" | "presentation";

export type SubWindowModeOption = {
  readonly id: SubWindowMode;
  readonly label: string;
};

export const DEFAULT_SUB_WINDOW_MODE: SubWindowMode = "preview-sync";

export const SUB_WINDOW_MODE_OPTIONS: readonly SubWindowModeOption[] = [
  { id: "preview-sync", label: "プレビュー同期" },
  { id: "presentation", label: "プレゼン" },
] as const;

const SUB_WINDOW_MODE_SET = new Set<SubWindowMode>(
  SUB_WINDOW_MODE_OPTIONS.map((subWindowModeOption) => subWindowModeOption.id),
);

export function isSubWindowMode(value: string): value is SubWindowMode {
  return SUB_WINDOW_MODE_SET.has(value as SubWindowMode);
}
