import { type EditorSessionAction } from "../../application/editorSession/editorSessionAction";
import {
  type EditorStateActionPayload,
  type EditorStatePayload,
} from "../../contracts/generated";
import { type StoredEdit, type EditorDocumentState, type EditorState, type EditorStats } from "../../domain/editor";
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
  resolveDocumentFileStemWithWasmSync,
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
): EditorDocumentState {
  return parseJsonPayload<EditorDocumentState>(
    createStartupEditorStateJsonWithWasmSync(
      startupEditMode,
      storedEdit === null ? null : JSON.stringify(storedEdit),
    ),
  );
}

export function reduceEditorState(state: EditorState, action: EditorSessionAction): EditorState {
  if (action.type === "editor/documentMutated") {
    return { ...state, isDirty: true, errorMessage: null };
  }
  const contractState: EditorStatePayload = { ...state, content: "" };
  const contractAction = toEditorStateActionPayload(action);
  const result = parseJsonPayload<EditorStatePayload>(
    reduceEditorStateJsonWithWasmSync(JSON.stringify(contractState), JSON.stringify(contractAction)),
  );
  return {
    fileName: result.fileName,
    filePath: result.filePath,
    isDirty: result.isDirty,
    lastSavedAt: result.lastSavedAt,
    errorMessage: result.errorMessage,
  };
}

function toEditorStateActionPayload(action: EditorSessionAction): EditorStateActionPayload {
  switch (action.type) {
    case "editor/bootstrapLoaded":
      return {
        type: action.type,
        state: {
          content: null,
          fileName: action.state.fileName,
          filePath: action.state.filePath,
          isDirty: action.state.isDirty,
          lastSavedAt: action.state.lastSavedAt,
          errorMessage: action.state.errorMessage,
        },
      };
    case "editor/documentLoaded":
    case "editor/documentReset":
    case "editor/saveSucceeded":
    case "editor/errorRaised":
    case "editor/errorCleared":
      return action;
    case "editor/documentMutated":
      throw new Error("documentMutated must be reduced without WASM serialization");
  }
}

export function normalizeMarkdownFileName(fileName: string): string {
  return normalizeMarkdownFileNameWithWasmSync(fileName);
}

export function resolveDocumentFileStem(fileName: string): string {
  return resolveDocumentFileStemWithWasmSync(fileName);
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
