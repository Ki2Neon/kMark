import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

export type WatchedMarkdownDocument = {
  readonly path: string;
  readonly content: string;
  readonly version: string;
  readonly changed: boolean;
  readonly generation: number;
};

export type ExternalMarkdownFileChange = {
  readonly path: string;
  readonly content: string;
  readonly version: string;
};

export function readWatchedMarkdownDocument(path: string): Promise<ExternalMarkdownFileChange> {
  return invokeTauriCommand(
    "read_watched_markdown_document",
    { path },
    "Markdownファイルの変更を確認できませんでした。",
  );
}

export function watchMarkdownDocument(path: string, knownContent: string | null): Promise<WatchedMarkdownDocument> {
  return invokeTauriCommand(
    "watch_markdown_document",
    { path, knownContent },
    "Markdownファイルの変更監視を開始できませんでした。",
  );
}

export function unwatchMarkdownDocument(path: string, generation: number): Promise<void> {
  return invokeTauriCommand(
    "unwatch_markdown_document",
    { path, generation },
    "Markdownファイルの変更監視を終了できませんでした。",
  );
}

export function listenForExternalMarkdownFileChange(
  callback: (change: ExternalMarkdownFileChange) => void,
): Promise<() => void> {
  return listenTauriEvent("markdown-document-external-change", callback);
}
