import { emit } from "@tauri-apps/api/event";
import "./App.css";
import { renderMarkdownPreview } from "./adapters/browser/browserMarkdownPreviewRenderer";

declare global {
  interface Window {
    __KMARK_CAPTURE_CONTENT__?: string;
    __KMARK_CAPTURE_CSS__?: string;
    __KMARK_CAPTURE_DOCUMENT_KEY__?: string;
    __KMARK_CAPTURE_FILE_PATH__?: string | null;
    __KMARK_CAPTURE_READY_EVENT__?: string;
    __KMARK_CAPTURE_REVISION__?: number;
  }
}

type CaptureReadyPayload = {
  readonly error: string | null;
  readonly html: string | null;
  readonly ok: boolean;
};

async function publishResult(payload: CaptureReadyPayload): Promise<void> {
  const eventName = window.__KMARK_CAPTURE_READY_EVENT__;
  if (eventName !== undefined) {
    await emit(eventName, payload);
  }
}

async function renderCapture(): Promise<void> {
  const main = document.querySelector<HTMLElement>("main");
  if (main === null) {
    await publishResult({ error: "preview capture root is missing", html: null, ok: false });
    return;
  }

  const style = document.createElement("style");
  style.textContent = window.__KMARK_CAPTURE_CSS__ ?? "";
  document.head.appendChild(style);

  try {
    const rendered = await renderMarkdownPreview(
      window.__KMARK_CAPTURE_CONTENT__ ?? "",
      window.__KMARK_CAPTURE_FILE_PATH__ ?? null,
      "standard",
      {
        documentKey: window.__KMARK_CAPTURE_DOCUMENT_KEY__ ?? "preview-capture",
        plantumlHttpsHosts: [],
        plantumlRenderEpoch: 0,
        revision: window.__KMARK_CAPTURE_REVISION__ ?? 0,
        strictGeneratedSvg: true,
      },
    );
    if (rendered.mode !== "standard") {
      throw new Error("preview capture requires standard display mode");
    }
    main.innerHTML = rendered.html;
    document.documentElement.dataset.ready = "true";
    await publishResult({ error: null, html: rendered.html, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    main.textContent = message;
    document.documentElement.dataset.ready = "error";
    await publishResult({ error: message, html: null, ok: false });
  }
}

void renderCapture();
