export type ExternalMarkdownDocument = {
  readonly fileName: string;
  readonly filePath: string;
  readonly content: string;
};

export function selectMostRecentExternalMarkdownDocument(
  documents: readonly ExternalMarkdownDocument[],
): ExternalMarkdownDocument | null {
  return documents.length > 0 ? documents[documents.length - 1] ?? null : null;
}