import { type MarkdownAssetImporter } from "../../application/editorSession/editorSessionPorts";
import { importMarkdownAssetData, importMarkdownAssetFiles } from "../../infra/assetTransfer";

export function createBrowserMarkdownAssetImporter(): MarkdownAssetImporter {
  return {
    async importAssetData(request) {
      return importMarkdownAssetData(request.markdownFilePath, request.files);
    },
    async importAssetFiles(request) {
      return importMarkdownAssetFiles(request.markdownFilePath, request.droppedFilePaths);
    },
  };
}
