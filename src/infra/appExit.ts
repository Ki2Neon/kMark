import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

const APP_EXIT_REQUESTED_EVENT = "app-exit-requested";
const WINDOW_CLOSE_REQUESTED_EVENT = "window-close-requested";

export type ExitRequestKind = "app-exit" | "window-close";

export async function completeAppExit(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    "complete_app_exit",
    {},
    "アプリの終了に失敗しました。",
  );
}

export async function completeWindowClose(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    "complete_window_close",
    {},
    "ウィンドウを閉じられませんでした。",
  );
}

export async function listenForAppExitRequests(callback: () => void): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }

  return listenTauriEvent<unknown>(APP_EXIT_REQUESTED_EVENT, callback);
}

export async function listenForWindowCloseRequests(callback: () => void): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }

  return listenTauriEvent<unknown>(WINDOW_CLOSE_REQUESTED_EVENT, callback);
}
