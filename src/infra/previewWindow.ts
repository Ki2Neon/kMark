import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

const PREVIEW_WINDOW_QUERY_PARAMETER = "preview-window";
const OPEN_PREVIEW_WINDOW_COMMAND = "open_preview_window";
const GET_PREVIEW_WINDOW_STATE_COMMAND = "get_preview_window_state";
const REQUEST_PREVIEW_WINDOW_EDIT_JUMP_COMMAND = "request_preview_window_edit_jump";
const SYNC_PREVIEW_WINDOW_STATE_COMMAND = "sync_preview_window_state";
const PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT = "preview-window-edit-jump-requested";
const PREVIEW_WINDOW_STATE_UPDATED_EVENT = "preview-window-state-updated";

export type PreviewWindowSnapshot = {
  readonly content: string;
  readonly fileName: string;
};

export type PreviewWindowState = {
  readonly activeSourceLine: number | null;
  readonly snapshot: PreviewWindowSnapshot;
};

export type PreviewWindowEditJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};

export function isPreviewWindowMode(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get(PREVIEW_WINDOW_QUERY_PARAMETER) === "1";
}

export async function openPreviewWindow(
  snapshot: PreviewWindowSnapshot,
  activeSourceLine: number | null,
): Promise<void> {
  await invokeTauriCommand<void>(
    OPEN_PREVIEW_WINDOW_COMMAND,
    {
      snapshot,
      activeSourceLine,
    },
    "プレビューウィンドウを開けませんでした。",
  );
}

export async function syncPreviewWindowState(
  snapshot: PreviewWindowSnapshot,
  activeSourceLine: number | null,
): Promise<void> {
  await invokeTauriCommand<void>(
    SYNC_PREVIEW_WINDOW_STATE_COMMAND,
    {
      snapshot,
      activeSourceLine,
    },
    "プレビュー同期に失敗しました。",
  );
}

export async function loadPreviewWindowState(): Promise<PreviewWindowState> {
  return invokeTauriCommand<PreviewWindowState>(
    GET_PREVIEW_WINDOW_STATE_COMMAND,
    {},
    "プレビュー状態の読込に失敗しました。",
  );
}

export async function requestPreviewWindowEditJump(lineNumber: number): Promise<void> {
  await invokeTauriCommand<void>(
    REQUEST_PREVIEW_WINDOW_EDIT_JUMP_COMMAND,
    { lineNumber },
    "プレビュー位置の同期に失敗しました。",
  );
}

export async function listenForPreviewWindowStateUpdates(
  callback: (previewWindowState: PreviewWindowState) => void,
): Promise<() => void> {
  return listenTauriEvent<PreviewWindowState>(
    PREVIEW_WINDOW_STATE_UPDATED_EVENT,
    callback,
  );
}

export async function listenForPreviewWindowEditJumpRequests(
  callback: (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => void,
): Promise<() => void> {
  return listenTauriEvent<PreviewWindowEditJumpRequest>(
    PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT,
    callback,
  );
}
