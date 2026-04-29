import { type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PreviewDisplayMode } from "../../domain/preview";
import { type EditorSessionAction } from "./editorSessionAction";
import {
  type Clock,
  type DraftStore,
  type EditorStateRules,
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
};

type EditorSessionControllerDependencies = {
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
  readonly #clock: Clock;
  readonly #draftStore: DraftStore;
  readonly #documentGateway: MarkdownDocumentGateway;
  readonly #printer: MarkdownDocumentPrinter;
  readonly #renderer: MarkdownRenderer;
  readonly #rules: EditorStateRules;

  constructor(dependencies: EditorSessionControllerDependencies) {
    this.#clock = dependencies.clock;
    this.#draftStore = dependencies.draftStore;
    this.#documentGateway = dependencies.documentGateway;
    this.#printer = dependencies.printer;
    this.#renderer = dependencies.renderer;
    this.#rules = dependencies.rules;
  }

  createInitialState(startupEditMode: StartupEditMode): EditorSessionBootstrap {
    return {
      initialState: this.#rules.createStartupState(startupEditMode, null),
      shouldSkipInitialPersist: false,
    };
  }

  async bootstrap(startupEditMode: StartupEditMode): Promise<EditorSessionBootstrap> {
    const storedEdit = await this.#draftStore.load();

    return {
      initialState: this.#rules.createStartupState(startupEditMode, storedEdit),
      shouldSkipInitialPersist: startupEditMode !== "last-opened-file" && storedEdit !== null,
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
      savedAt: state.lastSavedAt,
    });
  }

  async renderPreview(content: string): Promise<RenderedPreview> {
    return this.#renderer.render(content);
  }

  changeContent(store: EditorSessionStore, content: string): void {
    store.dispatch({ type: "editor/contentChanged", content });
  }

  async openDocumentFromPicker(store: EditorSessionStore): Promise<void> {
    const result = await this.#documentGateway.openDocumentFromPicker();

    if (result === null) {
      return;
    }

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      content: result.content,
      loadedAt: null,
    });
  }

  async openDocumentFromFile(store: EditorSessionStore, file: File): Promise<void> {
    const result = await this.#documentGateway.openDocumentFromFile(file);

    store.dispatch({
      type: "editor/documentLoaded",
      fileName: result.fileName,
      content: result.content,
      loadedAt: null,
    });
  }

  loadExternalDocument(store: EditorSessionStore, document: ExternalMarkdownDocument): void {
    const loadedDocument = this.#documentGateway.loadExternalDocument(document);

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
    const renderedPreview = await this.renderPreview(state.content);

    await this.#printer.print({
      displayMode: previewDisplayMode,
      title: state.fileName,
      html: renderedPreview.html,
      pageHtmls: renderedPreview.pageHtmls,
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
