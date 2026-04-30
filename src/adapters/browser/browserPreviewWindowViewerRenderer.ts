import { type PreviewWindowViewerRenderer } from "../../application/previewWindowViewer/previewWindowViewerPorts";
import { renderMarkdownPreview } from "./browserMarkdownPreviewRenderer";

export function createBrowserPreviewWindowViewerRenderer(): PreviewWindowViewerRenderer {
  return {
    async render(content, filePath) {
      return renderMarkdownPreview(content, filePath);
    },
  };
}
