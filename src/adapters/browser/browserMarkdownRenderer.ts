import { type MarkdownRenderer } from "../../application/editorSession/editorSessionPorts";
import { renderMarkdownPreview } from "./browserMarkdownPreviewRenderer";

export function createBrowserMarkdownRenderer(): MarkdownRenderer {
  return {
    async render(content, filePath, displayMode, options) {
      return renderMarkdownPreview(content, filePath, displayMode, options);
    },
  };
}
