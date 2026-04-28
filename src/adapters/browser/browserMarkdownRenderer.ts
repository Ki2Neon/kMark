import { type MarkdownRenderer } from "../../application/editorSession/editorSessionPorts";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";

export function createBrowserMarkdownRenderer(): MarkdownRenderer {
  return {
    render(content) {
      return renderMarkdown(content);
    },
    renderPages(content) {
      return renderMarkdownPages(content);
    },
  };
}
