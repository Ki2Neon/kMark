import { type PreviewWindowViewerRenderer } from "../../application/previewWindowViewer/previewWindowViewerPorts";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";

export function createBrowserPreviewWindowViewerRenderer(): PreviewWindowViewerRenderer {
  return {
    render(content) {
      return renderMarkdown(content);
    },
    renderPages(content) {
      return renderMarkdownPages(content);
    },
  };
}
