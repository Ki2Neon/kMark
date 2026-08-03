import {
  renderMarkdownPreviewWithWasm,
  type RenderedMarkdownPreviewPayload,
} from "../../wasm/kmarkWeb";
import { type PreviewDisplayMode } from "../../domain/preview";

export type BrowserMarkdownPreviewWorkerRequest = {
  readonly content: string;
  readonly displayMode: PreviewDisplayMode;
  readonly filePath: string | null;
  readonly id: number;
};

export type BrowserMarkdownPreviewWorkerResponse =
  | {
    readonly id: number;
    readonly renderedPreview: RenderedMarkdownPreviewPayload;
    readonly type: "rendered";
  }
  | {
    readonly id: number;
    readonly message: string;
    readonly type: "failed";
  };

type WorkerScope = {
  onmessage: ((event: MessageEvent<BrowserMarkdownPreviewWorkerRequest>) => void) | null;
  postMessage(message: BrowserMarkdownPreviewWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  void renderMarkdownPreviewInWorker(event.data);
};

async function renderMarkdownPreviewInWorker(request: BrowserMarkdownPreviewWorkerRequest): Promise<void> {
  try {
    const renderedPreview = await renderMarkdownPreviewWithWasm(
      request.content,
      request.filePath,
      request.displayMode,
    );

    workerScope.postMessage({
      id: request.id,
      renderedPreview,
      type: "rendered",
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      message: error instanceof Error ? error.message : "プレビュー描画に失敗しました。",
      type: "failed",
    });
  }
}
