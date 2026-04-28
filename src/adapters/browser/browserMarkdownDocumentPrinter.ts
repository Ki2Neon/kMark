import { type MarkdownDocumentPrinter } from "../../application/editorSession/editorSessionPorts";
import { printMarkdownDocument } from "../../infra/printDocument";

export function createBrowserMarkdownDocumentPrinter(): MarkdownDocumentPrinter {
  return {
    async print(request) {
      await printMarkdownDocument(request);
    },
  };
}
