import { type StoredEdit } from "../../domain/editor";
import { type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PreviewDisplayMode } from "../../domain/preview";
import { type EditorSessionAction } from "./editorSessionAction";

export type LoadedMarkdownDocument = {
  readonly fileName: string;
  readonly content: string;
};

export type SavedMarkdownDocument = {
  readonly fileName: string;
};

export type PrintMarkdownDocumentRequest = {
  readonly displayMode: PreviewDisplayMode;
  readonly title: string;
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

export type Clock = {
  now(): number;
};

export type EditorStateRules = {
  createStartupState(startupEditMode: StartupEditMode, storedEdit: StoredEdit | null): EditorState;
  reduce(state: EditorState, action: EditorSessionAction): EditorState;
};

export type DraftStore = {
  load(): Promise<StoredEdit | null>;
  persist(edit: StoredEdit): Promise<void>;
};

export type MarkdownRenderer = {
  render(content: string): Promise<{
    readonly html: string;
    readonly pageHtmls: readonly string[];
  }>;
};

export type MarkdownDocumentGateway = {
  supportsNativeOpenPicker(): boolean;
  openDocumentFromPicker(): Promise<LoadedMarkdownDocument | null>;
  openDocumentFromFile(file: File): Promise<LoadedMarkdownDocument>;
  loadExternalDocument(document: ExternalMarkdownDocument): LoadedMarkdownDocument;
  saveDocument(fileName: string, content: string): Promise<SavedMarkdownDocument | null>;
  saveDocumentAs(fileName: string, content: string): Promise<SavedMarkdownDocument | null>;
  takePendingExternalDocuments(): Promise<readonly ExternalMarkdownDocument[]>;
  clearPendingExternalDocuments(): Promise<void>;
  listenForExternalDocumentRequests(callback: () => void): Promise<() => void>;
  reset(): void;
};

export type MarkdownDocumentPrinter = {
  print(request: PrintMarkdownDocumentRequest): Promise<void>;
};
