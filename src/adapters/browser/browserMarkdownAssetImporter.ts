import { type MarkdownAssetImporter } from "../../application/editorSession/editorSessionPorts";
import { importMarkdownAssetFiles } from "../../infra/assetTransfer";

export function createBrowserMarkdownAssetImporter(): MarkdownAssetImporter {
  return {
    async importAssets(request) {
      return importMarkdownAssetFiles(request.markdownFilePath, request.droppedFilePaths);
    },
  };
}
