import {
  type PageStyle,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../domain/preview";

type KmarkWebModule = typeof import("./pkg/kmark_web");

let loadedModule: KmarkWebModule | null = null;
let pendingModule: Promise<KmarkWebModule> | null = null;

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
};

export type TableFormatOptionsPayload = {
  readonly inferNumericAlignment?: boolean;
  readonly minSeparatorWidth?: number;
  readonly tabWidth?: number;
  readonly preserveLineEnding?: boolean;
};

export type TableFormatLineRangePayload = {
  readonly startLine: number;
  readonly endLine: number;
};

export type TableDiagnosticKind =
  | "invalidLeftMerge"
  | "invalidUpMerge"
  | "nonRectangularMerge"
  | "columnCountMismatch";

export type SourceRangePayload = {
  readonly start: number;
  readonly end: number;
};

export type TableDiagnosticPayload = {
  readonly kind: TableDiagnosticKind;
  readonly message: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly range: SourceRangePayload | null;
};

export type FormatMarkdownTablesPayload = {
  readonly text: string;
  readonly diagnostics: readonly TableDiagnosticPayload[];
};

export function parseJsonPayload<T>(json: string): T {
  return JSON.parse(json) as T;
}

function loadKmarkWebModuleSync(): KmarkWebModule {
  if (loadedModule === null) {
    throw new Error("kmark wasm module is not initialized");
  }

  return loadedModule;
}

export async function initializeKmarkWeb(): Promise<void> {
  if (loadedModule !== null) {
    return;
  }

  if (pendingModule === null) {
    pendingModule = import("./pkg/kmark_web").then(async (module) => {
      await module.default();
      loadedModule = module;
      return module;
    });
  }

  try {
    await pendingModule;
  } catch (error) {
    pendingModule = null;
    throw error;
  }
}

export async function renderMarkdownPreviewWithWasm(
  content: string,
  filePath?: string | null,
): Promise<RenderedMarkdownPreviewPayload> {
  await initializeKmarkWeb();
  return parseJsonPayload<RenderedMarkdownPreviewPayload>(
    loadKmarkWebModuleSync().render_markdown_preview_json(content, filePath ?? null),
  );
}

export function normalizeThemePreferencesJsonWithWasmSync(input: string | null): string {
  return loadKmarkWebModuleSync().normalize_theme_preferences_json(input);
}

export async function normalizeThemePreferencesWithWasm(input: string | null): Promise<string> {
  await initializeKmarkWeb();
  return normalizeThemePreferencesJsonWithWasmSync(input);
}

export function normalizeEditorPreferencesJsonWithWasmSync(input: string | null): string {
  return loadKmarkWebModuleSync().normalize_editor_preferences_json(input);
}

export async function normalizeEditorPreferencesWithWasm(input: string | null): Promise<string> {
  await initializeKmarkWeb();
  return normalizeEditorPreferencesJsonWithWasmSync(input);
}

export function normalizeDesktopLayoutPreferencesJsonWithWasmSync(input: string | null): string {
  return loadKmarkWebModuleSync().normalize_desktop_layout_preferences_json(input);
}

export async function normalizeDesktopLayoutPreferencesWithWasm(input: string | null): Promise<string> {
  await initializeKmarkWeb();
  return normalizeDesktopLayoutPreferencesJsonWithWasmSync(input);
}

export function normalizePreviewPreferencesJsonWithWasmSync(input: string | null): string {
  return loadKmarkWebModuleSync().normalize_preview_preferences_json(input);
}

export async function normalizePreviewPreferencesWithWasm(input: string | null): Promise<string> {
  await initializeKmarkWeb();
  return normalizePreviewPreferencesJsonWithWasmSync(input);
}

export function normalizeEditorDraftJsonWithWasmSync(input: string | null): string | null {
  return loadKmarkWebModuleSync().normalize_editor_draft_json(input) ?? null;
}

export async function normalizeEditorDraftWithWasm(input: string | null): Promise<string | null> {
  await initializeKmarkWeb();
  return normalizeEditorDraftJsonWithWasmSync(input);
}

export function createStartupEditorStateJsonWithWasmSync(
  startupEditMode: string | null,
  storedEditJson: string | null,
): string {
  return loadKmarkWebModuleSync().create_startup_editor_state_json(startupEditMode, storedEditJson);
}

export function reduceEditorStateJsonWithWasmSync(
  currentStateJson: string,
  actionJson: string,
): string {
  return loadKmarkWebModuleSync().reduce_editor_state_json(currentStateJson, actionJson);
}

export function normalizeMarkdownFileNameWithWasmSync(fileName: string): string {
  return loadKmarkWebModuleSync().normalize_markdown_file_name_json(fileName);
}

export function resolveAppFontFamilyWithWasmSync(appFontId: string): string {
  return loadKmarkWebModuleSync().resolve_app_font_family_json(appFontId);
}

export function resolveEditFontFamilyWithWasmSync(editFontId: string): string {
  return loadKmarkWebModuleSync().resolve_edit_font_family_json(editFontId);
}

export function deriveEditorStatsJsonWithWasmSync(content: string): string {
  return loadKmarkWebModuleSync().derive_editor_stats_json(content);
}

export function formatMarkdownTablesJsonWithWasmSync(
  content: string,
  options: TableFormatOptionsPayload | null,
): string {
  return loadKmarkWebModuleSync().format_markdown_tables_json(
    content,
    options === null ? null : JSON.stringify(options),
  );
}

export function formatMarkdownTablesInLineRangesJsonWithWasmSync(
  content: string,
  lineRanges: readonly TableFormatLineRangePayload[],
  options: TableFormatOptionsPayload | null,
): string {
  return loadKmarkWebModuleSync().format_markdown_tables_in_line_ranges_json(
    content,
    JSON.stringify(lineRanges),
    options === null ? null : JSON.stringify(options),
  );
}
