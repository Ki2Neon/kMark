import { type MarkdownDocumentPrinter } from "../../application/editorSession/editorSessionPorts";
import { createKmarkModelViewerScope } from "./browserModelRenderer";
import { printMarkdownDocument } from "../../infra/printDocument";

const PRINT_MODEL_RENDER_TIMEOUT_MS = 10000;
const PRINT_MODEL_VIEWER_SELECTOR = ".kmark-model-viewer[data-kmark-model-display-src]";
const PRINT_MODEL_TERMINAL_STATES = new Set(["failed", "ready"]);

export function createBrowserMarkdownDocumentPrinter(): MarkdownDocumentPrinter {
  return {
    async print(request) {
      await printMarkdownDocument(request, {
        preparePrintWindow: preparePrintWindowModelViewers,
      });
    },
  };
}

async function preparePrintWindowModelViewers(printWindow: Window): Promise<() => void> {
  const printDocument = printWindow.document;
  const modelViewers = Array.from(
    printDocument.querySelectorAll<HTMLElement>(PRINT_MODEL_VIEWER_SELECTOR),
  );

  if (modelViewers.length === 0) {
    return () => {};
  }

  const scope = createKmarkModelViewerScope(printDocument.body, {
    forceEagerLoading: true,
    persistCameraSnapshots: false,
    restoreCameraSnapshots: false,
  });

  scope.sync();
  await waitForPrintModelViewers(modelViewers);
  await waitForAnimationFrames(2);

  return () => {
    scope.dispose();
  };
}

function waitForPrintModelViewers(modelViewers: readonly HTMLElement[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let animationFrameId: number | null = null;
    const startedAt = performance.now();

    const cleanup = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };

    const check = () => {
      if (modelViewers.every((viewer) => PRINT_MODEL_TERMINAL_STATES.has(viewer.dataset.kmarkModelState ?? ""))) {
        cleanup();
        resolve();
        return;
      }

      if (performance.now() - startedAt >= PRINT_MODEL_RENDER_TIMEOUT_MS) {
        cleanup();
        reject(new Error("3Dモデル印刷描画の準備に時間がかかりすぎています。"));
        return;
      }

      animationFrameId = window.requestAnimationFrame(check);
    };

    check();
  });
}

function waitForAnimationFrames(frameCount: number): Promise<void> {
  return new Promise((resolve) => {
    let remainingFrames = Math.max(0, frameCount);

    const tick = () => {
      remainingFrames -= 1;

      if (remainingFrames <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });
}
