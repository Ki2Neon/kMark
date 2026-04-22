import { isTauri } from "@tauri-apps/api/core";
import type { WebviewWindow as TauriWebviewWindow } from "@tauri-apps/api/webviewWindow";

const PREVIEW_WINDOW_LABEL = "preview-window";
const PREVIEW_WINDOW_QUERY_PARAMETER = "preview-window";
const PREVIEW_WINDOW_TITLE = "kMark Preview";

function buildPreviewWindowUrl(): string {
  const previewWindowUrl = new URL(window.location.href);

  previewWindowUrl.searchParams.set(PREVIEW_WINDOW_QUERY_PARAMETER, "1");

  return previewWindowUrl.toString();
}

function toPreviewWindowErrorMessage(payload: unknown): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }

  return "プレビューウィンドウを開けませんでした。";
}

function waitForPreviewWindowCreation(previewWindow: TauriWebviewWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanupCallbacks: Array<() => void> = [];

    const settle = (callback: () => void) => {
      while (cleanupCallbacks.length > 0) {
        cleanupCallbacks.pop()?.();
      }

      callback();
    };

    void previewWindow
      .once("tauri://created", () => {
        settle(() => {
          resolve();
        });
      })
      .then(
        (unlisten) => {
          cleanupCallbacks.push(unlisten);
        },
        (error) => {
          settle(() => {
            reject(error);
          });
        },
      );

    void previewWindow
      .once("tauri://error", (event) => {
        settle(() => {
          reject(new Error(toPreviewWindowErrorMessage(event.payload)));
        });
      })
      .then(
        (unlisten) => {
          cleanupCallbacks.push(unlisten);
        },
        (error) => {
          settle(() => {
            reject(error);
          });
        },
      );
  });
}

export function isPreviewWindowMode(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get(PREVIEW_WINDOW_QUERY_PARAMETER) === "1";
}

export async function openPreviewWindow(): Promise<void> {
  const previewWindowUrl = buildPreviewWindowUrl();

  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existingWindow = await WebviewWindow.getByLabel(PREVIEW_WINDOW_LABEL);

    if (existingWindow !== null) {
      await existingWindow.show();
      await existingWindow.setFocus();
      return;
    }

    const previewWindow = new WebviewWindow(PREVIEW_WINDOW_LABEL, {
      title: PREVIEW_WINDOW_TITLE,
      url: previewWindowUrl,
      width: 820,
      height: 900,
      minWidth: 50,
      minHeight: 50,
      center: true,
      resizable: true,
    });

    await waitForPreviewWindowCreation(previewWindow);
    return;
  }

  const previewWindow = window.open(
    previewWindowUrl,
    PREVIEW_WINDOW_LABEL,
    "width=820,height=900,resizable=yes,scrollbars=yes",
  );

  if (previewWindow === null) {
    throw new Error("プレビューウィンドウを開けませんでした。ブラウザのポップアップ設定を確認してください。");
  }

  previewWindow.focus();
}