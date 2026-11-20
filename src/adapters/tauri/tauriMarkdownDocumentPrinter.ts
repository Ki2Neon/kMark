import { type MarkdownDocumentPrinter } from "../../application/editorSession/editorSessionPorts";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { printPreparedDocumentInMainWindow } from "../../infra/topLevelPrintDocument";
import { createBrowserMarkdownDocumentPrinter } from "../browser/browserMarkdownDocumentPrinter";

/** DOM preparation stays in the renderer; the desktop adapter opens the native print UI. */
export function createTauriMarkdownDocumentPrinter(): MarkdownDocumentPrinter {
  return createBrowserMarkdownDocumentPrinter({
    printWindow: (sourceWindow) => printPreparedDocumentInMainWindow(sourceWindow, () =>
      invokeTauriCommand<void>("show_print_dialog", {}, "印刷画面を開けませんでした。")),
  });
}
