export type EditorMode = "split" | "write" | "preview";

export type EditorState = {
  readonly content: string;
  readonly fileName: string;
  readonly mode: EditorMode;
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

export const DEFAULT_FILE_NAME = "love-note.md";

export const DEFAULT_MARKDOWN = `# kMark

軽く書いて、すぐ整う Markdown エディターです。

## Start

- 左で書く
- 右で読む
- Ctrl / Cmd + S で書き出す

> 小さく、速く、気持ちよく。`;

export function createInitialEditorState(): EditorState {
  return {
    content: DEFAULT_MARKDOWN,
    fileName: DEFAULT_FILE_NAME,
    mode: "split",
    isDirty: false,
    lastSavedAt: null,
    errorMessage: null,
  };
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