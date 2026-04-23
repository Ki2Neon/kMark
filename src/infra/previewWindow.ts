import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WebviewWindow as TauriWebviewWindow } from "@tauri-apps/api/webviewWindow";

const PREVIEW_WINDOW_LABEL = "preview-window";
const PREVIEW_WINDOW_QUERY_PARAMETER = "preview-window";
const PREVIEW_WINDOW_INSTANCE_QUERY_PARAMETER = "preview-instance";
const APP_INSTANCE_ID_COMMAND = "current_app_instance_id";
const APP_INSTANCE_SESSION_STORAGE_KEY = "kmark:app-instance-id:v1";
const PREVIEW_WINDOW_TITLE = "kMark Preview";

let cachedAppInstanceId: string | null = null;
let pendingAppInstanceIdPromise: Promise<string> | null = null;

function createFallbackAppInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePreviewWindowInstanceId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function buildPreviewWindowUrl(instanceId: string): string {
  const previewWindowUrl = new URL(window.location.href);

  previewWindowUrl.searchParams.set(PREVIEW_WINDOW_QUERY_PARAMETER, "1");
  previewWindowUrl.searchParams.set(PREVIEW_WINDOW_INSTANCE_QUERY_PARAMETER, instanceId);

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

export function resolvePreviewWindowInstanceId(
  search = typeof window === "undefined" ? "" : window.location.search,
): string | null {
  return normalizePreviewWindowInstanceId(
    new URLSearchParams(search).get(PREVIEW_WINDOW_INSTANCE_QUERY_PARAMETER),
  );
}

function getOrCreateFallbackAppInstanceId(): string {
  const fallbackInstanceId = createFallbackAppInstanceId();

  if (typeof window === "undefined") {
    return fallbackInstanceId;
  }

  try {
    const storedInstanceId = normalizePreviewWindowInstanceId(
      window.sessionStorage.getItem(APP_INSTANCE_SESSION_STORAGE_KEY),
    );

    if (storedInstanceId !== null) {
      return storedInstanceId;
    }

    window.sessionStorage.setItem(APP_INSTANCE_SESSION_STORAGE_KEY, fallbackInstanceId);
  } catch {
    return fallbackInstanceId;
  }

  return fallbackInstanceId;
}

export async function resolveAppInstanceId(): Promise<string> {
  if (cachedAppInstanceId !== null) {
    return cachedAppInstanceId;
  }

  if (pendingAppInstanceIdPromise !== null) {
    return pendingAppInstanceIdPromise;
  }

  pendingAppInstanceIdPromise = (async () => {
    if (isTauri()) {
      try {
        const appInstanceId = normalizePreviewWindowInstanceId(
          await invoke<string>(APP_INSTANCE_ID_COMMAND),
        );

        if (appInstanceId !== null) {
          cachedAppInstanceId = appInstanceId;
          return appInstanceId;
        }
      } catch {
        // Fall back to a per-window session id when the Tauri command is unavailable.
      }
    }

    const fallbackInstanceId = getOrCreateFallbackAppInstanceId();
    cachedAppInstanceId = fallbackInstanceId;

    return fallbackInstanceId;
  })();

  try {
    return await pendingAppInstanceIdPromise;
  } finally {
    pendingAppInstanceIdPromise = null;
  }
}

export async function openPreviewWindow(instanceId: string): Promise<void> {
  const previewWindowUrl = buildPreviewWindowUrl(instanceId);

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