export type LayoutMode = "desktop" | "mobile";

export type EditorState = {
  readonly content: string;
  readonly fileName: string;
  readonly isDirty: boolean;
  readonly lastSavedAt: number | null;
  readonly errorMessage: string | null;
};

export type EditorStats = {
  readonly words: number;
  readonly characters: number;
  readonly lines: number;
  readonly readingMinutes: number;
};

export type StoredEdit = {
  readonly content: string;
  readonly fileName: string;
  readonly filePath: string | null;
  readonly savedAt: number | null;
};

export const DEFAULT_FILE_NAME = "untitled.md";

export const DEFAULT_MARKDOWN = `## 操作説明

- 左で書く
- 右で読む
- Ctrl / Cmd + S で保存
- Ctrl / Cmd + O で開く
- Ctrl / Cmd + Shift + B でメニューを開閉
- Ctrl / Cmd + P で印刷`;

export function selectStartupLayoutMode(options: {
  readonly isMobileDevice: boolean;
}): LayoutMode {
  if (options.isMobileDevice) {
    return "mobile";
  }

  return "desktop";
}
