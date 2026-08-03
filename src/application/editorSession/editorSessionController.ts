import { DEFAULT_FILE_NAME, type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PreviewDisplayMode, type RenderedPreview } from "../../domain/preview";
import { type RecentFile } from "../../domain/recentFiles";
import { type EditorSessionAction } from "./editorSessionAction";
import {
  type Clock,
  type DraftStore,
  type EditorStateRules,
  type LoadedMarkdownDocument,
  type MarkdownAssetDataFile,
  type MarkdownAssetImporter,
  type MarkdownDocumentGateway,
  type MarkdownDocumentPrinter,
  type MarkdownRenderer,
  type RecentFileStore,
} from "./editorSessionPorts";

export type EditorSessionStore = {
  dispatch(action: EditorSessionAction): void;
  getState(): EditorState;
};

export type EditorSessionBootstrap = {
  readonly initialState: EditorState;
  readonly shouldSkipInitialPersist: boolean;
};

type EditorSessionControllerDependencies = {
  readonly assetImporter: MarkdownAssetImporter;
  readonly clock: Clock;
  readonly draftStore: DraftStore;
  readonly documentGateway: MarkdownDocumentGateway;
  readonly printer: MarkdownDocumentPrinter;
  readonly recentFileStore: RecentFileStore;
  readonly renderer: MarkdownRenderer;
  readonly rules: EditorStateRules;
};

export function toEditorSessionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "処理に失敗しました。もう一度試してください。";
}

export class EditorSessionController {
  readonly #assetImporter: MarkdownAssetImporter;
  readonly #clock: Clock;
  readonly #draftStore: DraftStore;
  readonly #documentGateway: MarkdownDocumentGateway;
  readonly #printer: MarkdownDocumentPrinter;
  readonly #recentFileStore: RecentFileStore;
  readonly #renderer: MarkdownRenderer;
  readonly #rules: EditorStateRules;

  constructor(dependencies: EditorSessionControllerDependencies) {
    this.#assetImporter = dependencies.assetImporter;
    this.#clock = dependencies.clock;
    this.#draftStore = dependencies.draftStore;
    this.#documentGateway = dependencies.documentGateway;
    this.#printer = dependencies.printer;
    this.#recentFileStore = dependencies.recentFileStore;
    this.#renderer = dependencies.renderer;
    this.#rules = dependencies.rules;
  }

  createInitialState(startupEditMode: StartupEditMode): EditorSessionBootstrap {
    this.#documentGateway.restoreDocumentReference(null);
    return {
      initialState: this.#rules.createStartupState(startupEditMode, null),
      shouldSkipInitialPersist: false,
    };
  }

  async bootstrap(startupEditMode: StartupEditMode): Promise<EditorSessionBootstrap> {
    const storedEdit = await this.#draftStore.load();
    this.#documentGateway.restoreDocumentReference(null);

    return {
      initialState: this.#rules.createStartupState(startupEditMode, null),
      shouldSkipInitialPersist: storedEdit !== null,
    };
  }

  async bootstrapNewUntitled(startupEditMode: StartupEditMode): Promise<EditorSessionBootstrap> {
    const storedEdit = await this.#draftStore.load();
    const startupState = this.#rules.createStartupState(startupEditMode, null);

    this.#documentGateway.restoreDocumentReference(null);

    return {
      initialState: {
        ...startupState,
        fileName: DEFAULT_FILE_NAME,
        filePath: null,
        lastSavedAt: null,
      },
      shouldSkipInitialPersist: storedEdit !== null,
    };
  }

  reduceState(state: EditorState, action: EditorSessionAction): EditorState {
    return this.#rules.reduce(state, action);
  }

  supportsNativeOpenPicker(): boolean {
    return this.#documentGateway.supportsNativeOpenPicker();
  }

  async persistDraft(state: EditorState): Promise<void> {
    await this.#draftStore.persist({
      fileName: state.fileName,
      content: state.content,
      filePath: state.filePath,
      savedAt: state.lastSavedAt,
    });
  }

  async loadRecentFiles(): Promise<readonly RecentFile[]> {
    return this.#recentFileStore.load();
  }

  async recordRecentFile(
    fileName: string,
    filePath: string | null,
  ): Promise<readonly RecentFile[] | null> {
    if (filePath === null) {
      return null;
    }

    return this.#recentFileStore.record({ fileName, filePath });
  }

  async renderPreview(
    content: string,
    filePath: string | null,
    displayMode: PreviewDisplayMode,
  ): Promise<RenderedPreview> {
    return this.#renderer.render(content, filePath, displayMode);
  }

  changeContent(store: EditorSessionStore, content: string): void {
    store.dispatch({ type: "editor/contentChanged", content });
  }

  async openDocumentFromPicker(store: EditorSessionStore): Promise<LoadedMarkdownDocument | null> {
    const result = await this.#documentGateway.openDocumentFromPicker();

    if (result === null) {
      return null;
    }

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      filePath: result.filePath,
      content: result.content,
      loadedAt: null,
    });

    return result;
  }

  async openDocumentFromFile(store: EditorSessionStore, file: File): Promise<LoadedMarkdownDocument> {
    const result = await this.#documentGateway.openDocumentFromFile(file);

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      filePath: result.filePath,
      content: result.content,
      loadedAt: null,
    });

    return result;
  }

  async openDocumentFromRecentFile(store: EditorSessionStore, recentFile: RecentFile): Promise<LoadedMarkdownDocument> {
    const result = await this.#documentGateway.openDocumentFromPath(recentFile.filePath);

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      filePath: result.filePath,
      content: result.content,
      loadedAt: null,
    });

    return result;
  }

  async openCurrentDocumentFolder(store: EditorSessionStore): Promise<void> {
    const filePath = store.getState().filePath;
    if (filePath === null) {
      throw new Error("保存済みMarkdownファイルのフォルダーがありません。");
    }

    await this.#documentGateway.openDocumentFolder(filePath);
  }

  async importDroppedAssets(
    store: EditorSessionStore,
    droppedFilePaths: readonly string[],
  ): Promise<string> {
    const filePath = store.getState().filePath;
    if (filePath === null) {
      throw new Error("アセットを取り込むには、先にMarkdownファイルを保存してください。");
    }

    const importedAssets = await this.#assetImporter.importAssetFiles({
      markdownFilePath: filePath,
      droppedFilePaths,
    });

    return importedAssets
      .map((asset) => asset.markdownText)
      .join("\n\n");
  }

  async importPastedAssets(
    store: EditorSessionStore,
    files: readonly MarkdownAssetDataFile[],
  ): Promise<string> {
    const filePath = store.getState().filePath;
    if (filePath === null) {
      throw new Error("アセットを取り込むには、先にMarkdownファイルを保存してください。");
    }

    const importedAssets = await this.#assetImporter.importAssetData({
      markdownFilePath: filePath,
      files,
    });

    return importedAssets
      .map((asset) => asset.markdownText)
      .join("\n\n");
  }

  loadExternalDocument(store: EditorSessionStore, document: ExternalMarkdownDocument): LoadedMarkdownDocument {
    const loadedDocument = this.#documentGateway.loadExternalDocument(document);

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: loadedDocument.fileName,
      filePath: loadedDocument.filePath,
      content: loadedDocument.content,
      loadedAt: null,
    });

    return loadedDocument;
  }

  async overwriteSaveDocument(store: EditorSessionStore): Promise<boolean> {
    const state = store.getState();
    const result = await this.#documentGateway.saveDocument(state.fileName, state.content);

    if (result === null) {
      return false;
    }

    store.dispatch({
      type: "editor/saveSucceeded",
      fileName: result.fileName,
      filePath: result.filePath,
      savedAt: this.#clock.now(),
    });

    return true;
  }

  async saveDocumentAs(store: EditorSessionStore): Promise<boolean> {
    const state = store.getState();
    const result = await this.#documentGateway.saveDocumentAs(state.fileName, state.content);

    if (result === null) {
      return false;
    }

    store.dispatch({
      type: "editor/saveSucceeded",
      fileName: result.fileName,
      filePath: result.filePath,
      savedAt: this.#clock.now(),
    });

    return true;
  }

  async takePendingExternalDocuments(): Promise<readonly ExternalMarkdownDocument[]> {
    return this.#documentGateway.takePendingExternalDocuments();
  }

  async clearPendingExternalDocuments(): Promise<void> {
    await this.#documentGateway.clearPendingExternalDocuments();
  }

  subscribeToExternalDocumentRequests(callback: () => void): Promise<() => void> {
    return this.#documentGateway.listenForExternalDocumentRequests(callback);
  }

  async printDocument(
    store: EditorSessionStore,
    previewDisplayMode: PreviewDisplayMode,
  ): Promise<void> {
    const state = store.getState();

    if (previewDisplayMode === "a4") {
      await this.#printer.print({
        displayMode: "a4",
        title: state.fileName,
      });
      return;
    }

    const renderedPreview = await this.renderPreview(
      state.content,
      state.filePath,
      "standard",
    );

    if (renderedPreview.mode !== "standard") {
      throw new Error("標準Previewの生成結果が不正です。");
    }

    await this.#printer.print({
      displayMode: "standard",
      title: state.fileName,
      html: renderedPreview.html,
    });
  }

  resetDocument(store: EditorSessionStore): void {
    this.#documentGateway.reset();
    store.dispatch({ type: "editor/documentReset" });
  }

  raiseError(store: EditorSessionStore, message: string): void {
    store.dispatch({ type: "editor/errorRaised", message });
  }

  clearError(store: EditorSessionStore): void {
    store.dispatch({ type: "editor/errorCleared" });
  }
}
