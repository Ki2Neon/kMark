import { type StartupDraftMode } from "./editorPreferences";

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

export type StoredDraft = {
  readonly content: string;
  readonly fileName: string;
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

export function createInitialEditorState(): EditorState {
  return {
    content: DEFAULT_MARKDOWN,
    fileName: DEFAULT_FILE_NAME,
    isDirty: false,
    lastSavedAt: null,
    errorMessage: null,
  };
}

export function createBlankEditorState(): EditorState {
  return {
    content: "",
    fileName: DEFAULT_FILE_NAME,
    isDirty: false,
    lastSavedAt: null,
    errorMessage: null,
  };
}

export function createStartupEditorState(options: {
  readonly startupDraftMode: StartupDraftMode;
  readonly storedDraft: StoredDraft | null;
}): EditorState {
  if (options.startupDraftMode === "last-opened-file" && options.storedDraft !== null) {
    return {
      content: options.storedDraft.content,
      fileName: ensureMarkdownExtension(options.storedDraft.fileName),
      isDirty: false,
      lastSavedAt: options.storedDraft.savedAt,
      errorMessage: null,
    };
  }

  if (options.startupDraftMode === "blank") {
    return createBlankEditorState();
  }

  return createInitialEditorState();
}

export function selectStartupLayoutMode(options: {
  readonly isMobileDevice: boolean;
}): LayoutMode {
  if (options.isMobileDevice) {
    return "mobile";
  }

  return "desktop";
}

export function ensureMarkdownExtension(fileName: string): string {
  const trimmedFileName = fileName.trim();
  const normalizedFileName = trimmedFileName.length > 0 ? trimmedFileName : DEFAULT_FILE_NAME;
  const sanitizedFileName = normalizedFileName.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-");

  return /\.(md|markdown|mdown|mkd|txt)$/iu.test(sanitizedFileName)
    ? sanitizedFileName
    : `${sanitizedFileName}.md`;
}

export function deriveEditorStats(content: string): EditorStats {
  const trimmedContent = content.trim();
  const words = trimmedContent.length > 0 ? trimmedContent.split(/\s+/u).length : 0;
  const characters = content.length;
  const lines = content.length > 0 ? content.split(/\r?\n/u).length : 1;

  return {
    words,
    characters,
    lines,
    readingMinutes: words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0,
  };
}