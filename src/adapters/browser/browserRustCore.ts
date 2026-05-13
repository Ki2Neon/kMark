import { type EditorSessionAction } from "../../application/editorSession/editorSessionAction";
import { type StoredEdit, type EditorState, type EditorStats } from "../../domain/editor";
import { type EditorPreferences, type StartupEditMode } from "../../domain/editorPreferences";
import { type PreviewPreferences } from "../../domain/preview";
import { type ThemePreferences } from "../../domain/theme";
import {
  createStartupEditorStateJsonWithWasmSync,
  deriveEditorStatsJsonWithWasmSync,
  formatMarkdownTablesInLineRangesJsonWithWasmSync,
  formatMarkdownTablesJsonWithWasmSync,
  normalizeEditorPreferencesJsonWithWasmSync,
  normalizeMarkdownFileNameWithWasmSync,
  normalizePreviewPreferencesJsonWithWasmSync,
  normalizeThemePreferencesJsonWithWasmSync,
  parseJsonPayload,
  reduceEditorStateJsonWithWasmSync,
  resolveAppFontFamilyWithWasmSync,
  resolveEditFontFamilyWithWasmSync,
  type FormatMarkdownTablesPayload,
  type TableFormatLineRangePayload,
  type TableFormatOptionsPayload,
} from "../../wasm/kmarkWeb";

export function createDefaultThemePreferences(): ThemePreferences {
  return parseJsonPayload<ThemePreferences>(normalizeThemePreferencesJsonWithWasmSync(null));
}

export function normalizeThemePreferences(themePreferences: ThemePreferences): ThemePreferences {
  return parseJsonPayload<ThemePreferences>(
    normalizeThemePreferencesJsonWithWasmSync(JSON.stringify(themePreferences)),
  );
}

export function createDefaultEditorPreferences(): EditorPreferences {
  return parseJsonPayload<EditorPreferences>(normalizeEditorPreferencesJsonWithWasmSync(null));
}

export function normalizeEditorPreferences(editorPreferences: EditorPreferences): EditorPreferences {
  return parseJsonPayload<EditorPreferences>(
    normalizeEditorPreferencesJsonWithWasmSync(JSON.stringify(editorPreferences)),
  );
}

export function createDefaultPreviewPreferences(): PreviewPreferences {
  return parseJsonPayload<PreviewPreferences>(normalizePreviewPreferencesJsonWithWasmSync(null));
}

export function normalizePreviewPreferences(previewPreferences: PreviewPreferences): PreviewPreferences {
  return parseJsonPayload<PreviewPreferences>(
    normalizePreviewPreferencesJsonWithWasmSync(JSON.stringify(previewPreferences)),
  );
}

export function createStartupEditorState(
  startupEditMode: StartupEditMode,
  storedEdit: StoredEdit | null,
): EditorState {
  return parseJsonPayload<EditorState>(
    createStartupEditorStateJsonWithWasmSync(
      startupEditMode,
      storedEdit === null ? null : JSON.stringify(storedEdit),
    ),
  );
}

export function reduceEditorState(state: EditorState, action: EditorSessionAction): EditorState {
  return parseJsonPayload<EditorState>(
    reduceEditorStateJsonWithWasmSync(JSON.stringify(state), JSON.stringify(action)),
  );
}

export function normalizeMarkdownFileName(fileName: string): string {
  return normalizeMarkdownFileNameWithWasmSync(fileName);
}

export function deriveEditorStats(content: string): EditorStats {
  return parseJsonPayload<EditorStats>(deriveEditorStatsJsonWithWasmSync(content));
}

export function formatMarkdownTables(
  content: string,
  options: TableFormatOptionsPayload | null = null,
): FormatMarkdownTablesPayload {
  return parseJsonPayload<FormatMarkdownTablesPayload>(
    formatMarkdownTablesJsonWithWasmSync(content, options),
  );
}

export function formatMarkdownTablesInLineRanges(
  content: string,
  lineRanges: readonly TableFormatLineRangePayload[],
  options: TableFormatOptionsPayload | null = null,
): FormatMarkdownTablesPayload {
  return parseJsonPayload<FormatMarkdownTablesPayload>(
    formatMarkdownTablesInLineRangesJsonWithWasmSync(content, lineRanges, options),
  );
}

export function resolveAppFontFamily(appFontId: string): string {
  return resolveAppFontFamilyWithWasmSync(appFontId);
}

export function resolveEditFontFamily(editFontId: string): string {
  return resolveEditFontFamilyWithWasmSync(editFontId);
}
