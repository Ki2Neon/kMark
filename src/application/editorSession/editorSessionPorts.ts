import { type StoredEdit } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type PreviewDisplayMode } from "../../domain/preview";

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

export type DraftStore = {
  load(): StoredEdit | null;
  persist(edit: StoredEdit): void;
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
