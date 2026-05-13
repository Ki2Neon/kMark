import { DEFAULT_FILE_NAME, type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PageStyle, type PreviewDisplayMode, type PreviewTextStyle, type RenderedPreviewPage } from "../../domain/preview";
import { type EditorSessionAction } from "./editorSessionAction";
import {
  type Clock,
  type DraftStore,
  type EditorStateRules,
  type MarkdownAssetImporter,
  type MarkdownDocumentGateway,
  type MarkdownDocumentPrinter,
  type MarkdownRenderer,
} from "./editorSessionPorts";

export type EditorSessionStore = {
  dispatch(action: EditorSessionAction): void;
  getState(): EditorState;
};

export type EditorSessionBootstrap = {
  readonly initialState: EditorState;
  readonly shouldSkipInitialPersist: boolean;
};

export type RenderedPreview = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
};

type EditorSessionControllerDependencies = {
  readonly assetImporter: MarkdownAssetImporter;
  readonly clock: Clock;
  readonly draftStore: DraftStore;
  readonly documentGateway: MarkdownDocumentGateway;
  readonly printer: MarkdownDocumentPrinter;
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
  readonly #renderer: MarkdownRenderer;
  readonly #rules: EditorStateRules;
  #currentDocumentFilePath: string | null;

  constructor(dependencies: EditorSessionControllerDependencies) {
    this.#assetImporter = dependencies.assetImporter;
    this.#clock = dependencies.clock;
    this.#draftStore = dependencies.draftStore;
    this.#documentGateway = dependencies.documentGateway;
    this.#printer = dependencies.printer;
    this.#renderer = dependencies.renderer;
    this.#rules = dependencies.rules;
    this.#currentDocumentFilePath = null;
  }

  createInitialState(startupEditMode: StartupEditMode): EditorSessionBootstrap {
    this.#currentDocumentFilePath = null;
    this.#documentGateway.restoreDocumentReference(null);
    return {
      initialState: this.#rules.createStartupState(startupEditMode, null),
      shouldSkipInitialPersist: false,
    };
  }

  async bootstrap(startupEditMode: StartupEditMode): Promise<EditorSessionBootstrap> {
    const storedEdit = await this.#draftStore.load();
    this.#currentDocumentFilePath = startupEditMode === "last-opened-file"
      ? storedEdit?.filePath ?? null
      : null;
    this.#documentGateway.restoreDocumentReference(this.#currentDocumentFilePath);

    return {
      initialState: this.#rules.createStartupState(startupEditMode, storedEdit),
      shouldSkipInitialPersist: startupEditMode !== "last-opened-file" && storedEdit !== null,
    };
  }

  async bootstrapNewUntitled(startupEditMode: StartupEditMode): Promise<EditorSessionBootstrap> {
    const storedEdit = await this.#draftStore.load();
    const startupState = this.#rules.createStartupState(
      startupEditMode,
      startupEditMode === "last-opened-file" ? storedEdit : null,
    );

    this.#currentDocumentFilePath = null;
    this.#documentGateway.restoreDocumentReference(null);

    return {
      initialState: {
        ...startupState,
        fileName: DEFAULT_FILE_NAME,
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
      filePath: this.#currentDocumentFilePath,
      savedAt: state.lastSavedAt,
    });
  }

  async renderPreview(content: string): Promise<RenderedPreview> {
    return this.#renderer.render(content, this.#currentDocumentFilePath);
  }

  getCurrentDocumentFilePath(): string | null {
    return this.#currentDocumentFilePath;
  }

  changeContent(store: EditorSessionStore, content: string): void {
    store.dispatch({ type: "editor/contentChanged", content });
  }

  async openDocumentFromPicker(store: EditorSessionStore): Promise<void> {
    const result = await this.#documentGateway.openDocumentFromPicker();

    if (result === null) {
      return;
    }

    this.#currentDocumentFilePath = result.filePath;
    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      content: result.content,
      loadedAt: null,
    });
  }

  async openDocumentFromFile(store: EditorSessionStore, file: File): Promise<void> {
    const result = await this.#documentGateway.openDocumentFromFile(file);

    this.#currentDocumentFilePath = result.filePath;
    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      content: result.content,
      loadedAt: null,
    });
  }

  async openCurrentDocumentFolder(): Promise<void> {
    if (this.#currentDocumentFilePath === null) {
      throw new Error("保存済みMarkdownファイルのフォルダーがありません。");
    }

    await this.#documentGateway.openDocumentFolder(this.#currentDocumentFilePath);
  }

  async importDroppedAssets(droppedFilePaths: readonly string[]): Promise<string> {
    if (this.#currentDocumentFilePath === null) {
      throw new Error("アセットを取り込むには、先にMarkdownファイルを保存してください。");
    }

    const importedAssets = await this.#assetImporter.importAssets({
      markdownFilePath: this.#currentDocumentFilePath,
      droppedFilePaths,
    });

    return importedAssets
      .map((asset) => asset.markdownText)
      .join("\n\n");
  }

  loadExternalDocument(store: EditorSessionStore, document: ExternalMarkdownDocument): void {
    const loadedDocument = this.#documentGateway.loadExternalDocument(document);

    this.#currentDocumentFilePath = loadedDocument.filePath;
    store.dispatch({
      type: "editor/documentLoaded",
      fileName: loadedDocument.fileName,
      content: loadedDocument.content,
      loadedAt: null,
    });
  }

  async overwriteSaveDocument(store: EditorSessionStore): Promise<void> {
    const state = store.getState();
    const result = await this.#documentGateway.saveDocument(state.fileName, state.content);

    if (result === null) {
      return;
    }

    this.#currentDocumentFilePath = result.filePath;
    store.dispatch({
      type: "editor/saveSucceeded",
      fileName: result.fileName,
      savedAt: this.#clock.now(),
    });
  }

  async saveDocumentAs(store: EditorSessionStore): Promise<void> {
    const state = store.getState();
    const result = await this.#documentGateway.saveDocumentAs(state.fileName, state.content);

    if (result === null) {
      return;
    }

    this.#currentDocumentFilePath = result.filePath;
    store.dispatch({
      type: "editor/saveSucceeded",
      fileName: result.fileName,
      savedAt: this.#clock.now(),
    });
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

    const renderedPreview = await this.renderPreview(state.content);

    await this.#printer.print({
      displayMode: "standard",
      title: state.fileName,
      html: renderedPreview.html,
    });
  }

  resetDocument(store: EditorSessionStore): void {
    this.#documentGateway.reset();
    this.#currentDocumentFilePath = null;
    store.dispatch({ type: "editor/documentReset" });
  }

  raiseError(store: EditorSessionStore, message: string): void {
    store.dispatch({ type: "editor/errorRaised", message });
  }

  clearError(store: EditorSessionStore): void {
    store.dispatch({ type: "editor/errorCleared" });
  }
}
