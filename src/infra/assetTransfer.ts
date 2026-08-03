import {
  type ImportedMarkdownAssetPayload as ContractImportedMarkdownAssetPayload,
  type MarkdownAssetDataPayload as ContractMarkdownAssetDataPayload,
} from "../contracts/generated";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";

const IMPORT_MARKDOWN_ASSET_FILES_COMMAND = "import_markdown_asset_files";
const IMPORT_MARKDOWN_ASSET_DATA_COMMAND = "import_markdown_asset_data";

export type ImportedMarkdownAssetPayload = Readonly<ContractImportedMarkdownAssetPayload>;
export type MarkdownAssetDataPayload = Readonly<
  Omit<ContractMarkdownAssetDataPayload, "bytes">
  & { readonly bytes: readonly number[] }
>;

export async function importMarkdownAssetFiles(
  markdownFilePath: string,
  droppedFilePaths: readonly string[],
): Promise<readonly ImportedMarkdownAssetPayload[]> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみアセットを取り込めます。");
  }

  return invokeTauriCommand<ImportedMarkdownAssetPayload[]>(
    IMPORT_MARKDOWN_ASSET_FILES_COMMAND,
    {
      markdownFilePath,
      droppedFilePaths,
    },
    "アセットの取り込みに失敗しました。",
  );
}

export async function importMarkdownAssetData(
  markdownFilePath: string,
  files: readonly MarkdownAssetDataPayload[],
): Promise<readonly ImportedMarkdownAssetPayload[]> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみアセットを取り込めます。");
  }

  return invokeTauriCommand<ImportedMarkdownAssetPayload[]>(
    IMPORT_MARKDOWN_ASSET_DATA_COMMAND,
    {
      markdownFilePath,
      files,
    },
    "アセットの取り込みに失敗しました。",
  );
}
