import { type MarkdownDocumentPrinter } from "../../application/editorSession/editorSessionPorts";
import { createKmarkModelViewerScope, renderKmarkModelViewerNow } from "./browserModelRenderer";
import { printMarkdownDocument } from "../../infra/printDocument";

const PRINT_MODEL_RENDER_TIMEOUT_MS = 10000;
const PRINT_MODEL_CAPTURE_TIMEOUT_MS = 5000;
const PRINT_MODEL_CAPTURE_SAMPLE_SIZE_PX = 32;
const PRINT_MODEL_CAPTURE_VISIBLE_ALPHA_THRESHOLD = 8;
const PRINT_MODEL_CAPTURE_VISIBLE_CHANNEL_THRESHOLD = 245;
const PRINT_MODEL_VIEWER_SELECTOR = ".kmark-model-viewer[data-kmark-model-display-src]";
const PRINT_MODEL_CANVAS_ROOT_SELECTOR = ".kmark-model-canvas";
const PRINT_MODEL_CANVAS_SELECTOR = ".kmark-model-canvas > canvas";

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
    preserveDrawingBuffer: true,
    restoreCameraSnapshots: false,
  });

  scope.sync();
  await waitForPrintModelViewers(modelViewers);
  await waitForAnimationFrames(2);
  await freezePrintModelViewerCanvases(printWindow, modelViewers);
  await waitForAnimationFrames(1, printWindow);

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
      if (modelViewers.every(isPrintModelViewerReady)) {
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

function isPrintModelViewerReady(viewer: HTMLElement): boolean {
  const modelState = viewer.dataset.kmarkModelState ?? "";

  return modelState === "failed"
    || (modelState === "ready" && viewer.dataset.kmarkModelFrameState === "rendered");
}

async function freezePrintModelViewerCanvases(
  printWindow: Window,
  modelViewers: readonly HTMLElement[],
): Promise<void> {
  await Promise.all(modelViewers.map((viewer) => freezePrintModelViewerCanvas(printWindow, viewer)));
}

async function freezePrintModelViewerCanvas(printWindow: Window, viewer: HTMLElement): Promise<void> {
  if ((viewer.dataset.kmarkModelState ?? "") === "failed") {
    return;
  }

  const canvasRoot = viewer.querySelector<HTMLElement>(PRINT_MODEL_CANVAS_ROOT_SELECTOR);
  const canvas = viewer.querySelector<HTMLCanvasElement>(PRINT_MODEL_CANVAS_SELECTOR);

  if (canvasRoot === null || canvas === null || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error("3Dモデル印刷画像の生成に失敗しました。");
  }

  const dataUrl = await capturePrintModelCanvasDataUrl(printWindow, viewer, canvas);

  const image = viewer.ownerDocument.createElement("img");
  image.alt = viewer.dataset.kmarkModelAlt ?? viewer.getAttribute("aria-label") ?? "";
  image.decoding = "sync";
  image.src = dataUrl;
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "contain";
  image.style.objectPosition = "center center";
  image.style.pointerEvents = "none";
  image.style.userSelect = "none";

  canvasRoot.replaceChildren(image);
  await waitForPrintImage(image);
  viewer.dataset.kmarkModelFrameState = "frozen";
}

async function capturePrintModelCanvasDataUrl(
  printWindow: Window,
  viewer: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<string> {
  const startedAt = performance.now();

  do {
    renderKmarkModelViewerNow(viewer);
    await waitForAnimationFrames(1, printWindow);

    if (isCanvasVisiblyPainted(canvas)) {
      try {
        const dataUrl = canvas.toDataURL("image/png");

        if (dataUrl !== "data:,") {
          return dataUrl;
        }
      } catch {
        throw new Error("3Dモデル印刷画像の生成に失敗しました。");
      }
    }

    await waitForAnimationFrames(1);
  } while (performance.now() - startedAt < PRINT_MODEL_CAPTURE_TIMEOUT_MS);

  throw new Error("3Dモデル印刷画像が空白のままです。");
}

function isCanvasVisiblyPainted(canvas: HTMLCanvasElement): boolean {
  const width = Math.max(1, Math.min(PRINT_MODEL_CAPTURE_SAMPLE_SIZE_PX, canvas.width));
  const height = Math.max(1, Math.min(PRINT_MODEL_CAPTURE_SAMPLE_SIZE_PX, canvas.height));
  const sampleCanvas = canvas.ownerDocument.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    return false;
  }

  try {
    context.clearRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const requiredVisiblePixels = Math.max(2, Math.floor((width * height) * 0.003));
    let visiblePixels = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;

      if (alpha <= PRINT_MODEL_CAPTURE_VISIBLE_ALPHA_THRESHOLD) {
        continue;
      }

      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;

      if (
        alpha < 255
        || red < PRINT_MODEL_CAPTURE_VISIBLE_CHANNEL_THRESHOLD
        || green < PRINT_MODEL_CAPTURE_VISIBLE_CHANNEL_THRESHOLD
        || blue < PRINT_MODEL_CAPTURE_VISIBLE_CHANNEL_THRESHOLD
      ) {
        visiblePixels += 1;
      }

      if (visiblePixels >= requiredVisiblePixels) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

async function waitForPrintImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return;
  }

  try {
    await image.decode();
  } catch {
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      return;
    }

    throw new Error("3Dモデル印刷画像の生成に失敗しました。");
  }
}

function waitForAnimationFrames(frameCount: number, targetWindow: Window = window): Promise<void> {
  return new Promise((resolve) => {
    let remainingFrames = Math.max(0, frameCount);

    const tick = () => {
      remainingFrames -= 1;

      if (remainingFrames <= 0) {
        resolve();
        return;
      }

      targetWindow.requestAnimationFrame(tick);
    };

    targetWindow.requestAnimationFrame(tick);
  });
}
