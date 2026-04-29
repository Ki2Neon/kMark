import { isTauri } from "@tauri-apps/api/core";
import {
  type PreviewWindowEditJumpRequest,
  type PreviewWindowSnapshot,
  type PreviewWindowState,
} from "../domain/previewWindow";
import { createWebJsonStateStore } from "./webStateStore";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";
import { normalizePreviewWindowState } from "./webStateNormalization";

const PREVIEW_WINDOW_QUERY_PARAMETER = "preview-window";
const OPEN_PREVIEW_WINDOW_COMMAND = "open_preview_window";
const GET_PREVIEW_WINDOW_STATE_COMMAND = "get_preview_window_state";
const REQUEST_PREVIEW_WINDOW_EDIT_JUMP_COMMAND = "request_preview_window_edit_jump";
const SYNC_PREVIEW_WINDOW_STATE_COMMAND = "sync_preview_window_state";
const PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT = "preview-window-edit-jump-requested";
const PREVIEW_WINDOW_STATE_UPDATED_EVENT = "preview-window-state-updated";
const PREVIEW_WINDOW_STATE_FILE_NAME = "preview-window-state.json";
const PREVIEW_WINDOW_STATE_STORAGE_KEY = "kmark:state:preview-window-state:v2";
const PREVIEW_WINDOW_EDIT_JUMP_STORAGE_KEY = "kmark:preview-window:edit-jump-request:v2";

let previewWindowRef: Window | null = null;

const previewWindowStateStore = createWebJsonStateStore<PreviewWindowState>({
  fileName: PREVIEW_WINDOW_STATE_FILE_NAME,
  storageKey: PREVIEW_WINDOW_STATE_STORAGE_KEY,
  normalize: normalizePreviewWindowState,
});

function getPreviewWindowUrl(): string {
  if (typeof window === "undefined") {
    return "?preview-window=1";
  }

  const url = new URL(window.location.href);
  url.searchParams.set(PREVIEW_WINDOW_QUERY_PARAMETER, "1");
  return url.toString();
}

function getPreviewWindowFeatures(): string {
  return [
    "popup=no",
    "width=820",
    "height=900",
    "resizable=yes",
  ].join(",");
}

function getPreviewWindowBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  return new BroadcastChannel(PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT);
}

function nextPreviewWindowEditJumpRequestId(): number {
  return Date.now();
}

function emitWebPreviewWindowEditJumpRequest(previewWindowEditJumpRequest: PreviewWindowEditJumpRequest): void {
  const channel = getPreviewWindowBroadcastChannel();

  if (channel !== null) {
    channel.postMessage(previewWindowEditJumpRequest);
    channel.close();
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PREVIEW_WINDOW_EDIT_JUMP_STORAGE_KEY,
    JSON.stringify(previewWindowEditJumpRequest),
  );
}

export function isPreviewWindowMode(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get(PREVIEW_WINDOW_QUERY_PARAMETER) === "1";
}

export async function openPreviewWindow(
  snapshot: PreviewWindowSnapshot,
  activeSourceLine: number | null,
): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      OPEN_PREVIEW_WINDOW_COMMAND,
      {
        snapshot,
        activeSourceLine,
      },
      "プレビューウィンドウを開けませんでした。",
    );
    return;
  }

  await previewWindowStateStore.persist({
    snapshot,
    activeSourceLine,
  });

  if (typeof window === "undefined") {
    throw new Error("この環境ではプレビューウィンドウを開けません。");
  }

  if (previewWindowRef === null || previewWindowRef.closed) {
    previewWindowRef = window.open(
      getPreviewWindowUrl(),
      "kmark-preview-window",
      getPreviewWindowFeatures(),
    );
  } else {
    previewWindowRef.location.replace(getPreviewWindowUrl());
  }

  previewWindowRef?.focus();
}

export async function syncPreviewWindowState(
  snapshot: PreviewWindowSnapshot,
  activeSourceLine: number | null,
): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      SYNC_PREVIEW_WINDOW_STATE_COMMAND,
      {
        snapshot,
        activeSourceLine,
      },
      "プレビュー同期に失敗しました。",
    );
    return;
  }

  await previewWindowStateStore.persist({
    snapshot,
    activeSourceLine,
  });
}

export async function loadPreviewWindowState(): Promise<PreviewWindowState> {
  if (isTauri()) {
    return invokeTauriCommand<PreviewWindowState>(
      GET_PREVIEW_WINDOW_STATE_COMMAND,
      {},
      "プレビュー状態の読込に失敗しました。",
    );
  }

  return previewWindowStateStore.load();
}

export async function requestPreviewWindowEditJump(lineNumber: number): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      REQUEST_PREVIEW_WINDOW_EDIT_JUMP_COMMAND,
      { lineNumber },
      "プレビュー位置の同期に失敗しました。",
    );
    return;
  }

  if (lineNumber <= 0) {
    throw new Error("line number must be greater than 0");
  }

  emitWebPreviewWindowEditJumpRequest({
    lineNumber,
    requestId: nextPreviewWindowEditJumpRequestId(),
  });
}

export async function listenForPreviewWindowStateUpdates(
  callback: (previewWindowState: PreviewWindowState) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<PreviewWindowState>(
      PREVIEW_WINDOW_STATE_UPDATED_EVENT,
      callback,
    );
  }

  return previewWindowStateStore.listen(callback);
}

export async function listenForPreviewWindowEditJumpRequests(
  callback: (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<PreviewWindowEditJumpRequest>(
      PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT,
      callback,
    );
  }

  const channel = getPreviewWindowBroadcastChannel();

  if (channel !== null) {
    const handleMessage = (event: MessageEvent<PreviewWindowEditJumpRequest>) => {
      callback(event.data);
    };

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== PREVIEW_WINDOW_EDIT_JUMP_STORAGE_KEY || event.newValue === null) {
      return;
    }

    callback(JSON.parse(event.newValue) as PreviewWindowEditJumpRequest);
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}
