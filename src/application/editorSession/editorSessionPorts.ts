import { type StoredEdit } from "../../domain/editor";
import { type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PageStyle, type PreviewTextStyle, type RenderedPreviewPage } from "../../domain/preview";
import { type RecentFile } from "../../domain/recentFiles";
import { type EditorSessionAction } from "./editorSessionAction";

export type LoadedMarkdownDocument = {
  readonly fileName: string;
  readonly filePath: string | null;
  readonly content: string;
};

export type SavedMarkdownDocument = {
  readonly fileName: string;
  readonly filePath: string | null;
};

export type ImportedMarkdownAsset = {
  readonly originalPath: string;
  readonly copiedPath: string;
  readonly relativePath: string;
  readonly markdownText: string;
  readonly assetKind: "image";
};

export type ImportMarkdownAssetsRequest = {
  readonly markdownFilePath: string;
  readonly droppedFilePaths: readonly string[];
};

export type PrintMarkdownDocumentRequest =
  | {
    readonly displayMode: "standard";
    readonly title: string;
    readonly html: string;
  }
  | {
    readonly displayMode: "a4";
    readonly title: string;
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

export type RecentFileStore = {
  load(): Promise<readonly RecentFile[]>;
  record(recentFile: RecentFile): Promise<readonly RecentFile[]>;
};

export type MarkdownRenderer = {
  render(content: string, filePath?: string | null): Promise<{
    readonly html: string;
    readonly pageHtmls: readonly string[];
    readonly pages: readonly RenderedPreviewPage[];
    readonly defaultPageStyle: PageStyle;
    readonly defaultTextStyle: PreviewTextStyle;
  }>;
};

export type MarkdownDocumentGateway = {
  supportsNativeOpenPicker(): boolean;
  restoreDocumentReference(filePath: string | null): void;
  openDocumentFromPicker(): Promise<LoadedMarkdownDocument | null>;
  openDocumentFromFile(file: File): Promise<LoadedMarkdownDocument>;
  openDocumentFolder(filePath: string): Promise<void>;
  loadExternalDocument(document: ExternalMarkdownDocument): LoadedMarkdownDocument;
  saveDocument(fileName: string, content: string): Promise<SavedMarkdownDocument | null>;
  saveDocumentAs(fileName: string, content: string): Promise<SavedMarkdownDocument | null>;
  takePendingExternalDocuments(): Promise<readonly ExternalMarkdownDocument[]>;
  clearPendingExternalDocuments(): Promise<void>;
  listenForExternalDocumentRequests(callback: () => void): Promise<() => void>;
  reset(): void;
};

export type MarkdownAssetImporter = {
  importAssets(request: ImportMarkdownAssetsRequest): Promise<readonly ImportedMarkdownAsset[]>;
};

export type MarkdownDocumentPrinter = {
  print(request: PrintMarkdownDocumentRequest): Promise<void>;
};
