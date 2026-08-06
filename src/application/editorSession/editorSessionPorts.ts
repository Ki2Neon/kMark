import { type StoredEdit } from "../../domain/editor";
import { type EditorState } from "../../domain/editor";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { type PreviewDisplayMode, type RenderedPreview } from "../../domain/preview";
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
  readonly assetKind: "image" | "video" | "model";
};

export type ImportMarkdownAssetsRequest = {
  readonly markdownFilePath: string;
  readonly droppedFilePaths: readonly string[];
};

export type MarkdownAssetDataFile = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: readonly number[];
};

export type ImportMarkdownAssetDataRequest = {
  readonly markdownFilePath: string;
  readonly files: readonly MarkdownAssetDataFile[];
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
    readonly pages: readonly { readonly html: string }[];
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
  render(
    content: string,
    filePath: string | null,
    displayMode: PreviewDisplayMode,
    options?: PreviewRenderOptions,
  ): Promise<RenderedPreview>;
};

export type PreviewRenderOptions = {
  readonly revision: number;
  readonly documentKey: string;
  readonly plantumlRenderEpoch: number;
  readonly plantumlHttpsHosts: readonly string[];
  readonly activeSourceLine?: number | null;
  readonly signal?: AbortSignal;
  readonly strictGeneratedSvg?: boolean;
  readonly onUpdate?: (preview: RenderedPreview) => void;
};

export type MarkdownDocumentGateway = {
  supportsNativeOpenPicker(): boolean;
  restoreDocumentReference(filePath: string | null): void;
  openDocumentFromPicker(): Promise<LoadedMarkdownDocument | null>;
  openDocumentFromFile(file: File): Promise<LoadedMarkdownDocument>;
  openDocumentFromPath(filePath: string): Promise<LoadedMarkdownDocument>;
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
  importAssetData(request: ImportMarkdownAssetDataRequest): Promise<readonly ImportedMarkdownAsset[]>;
  importAssetFiles(request: ImportMarkdownAssetsRequest): Promise<readonly ImportedMarkdownAsset[]>;
};

export type MarkdownDocumentPrinter = {
  print(request: PrintMarkdownDocumentRequest): Promise<void>;
};
