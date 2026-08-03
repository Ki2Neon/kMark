import {
  type OpenSubWindowExternalBrowserResponsePayload,
  type SubWindowBrowserBoundsPayload,
} from "../contracts/generated";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";

const OPEN_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "open_sub_window_external_browser";
const RESIZE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "resize_sub_window_external_browser";
const BEGIN_SUB_WINDOW_EXTERNAL_BROWSER_CLOSE_COMMAND = "begin_sub_window_external_browser_close";
const SHOW_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "show_sub_window_external_browser";
const CLOSE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "close_sub_window_external_browser";

export type SubWindowExternalBrowserBounds = Readonly<SubWindowBrowserBoundsPayload>;

export function supportsNativeSubWindowExternalBrowser(): boolean {
  return isTauri();
}

export async function openSubWindowExternalBrowser(url: string, fadeMs: number): Promise<string> {
  if (!isTauri()) {
    throw new Error("この環境ではサブウィンドウ内ブラウザを開けません。");
  }

  const response = await invokeTauriCommand<OpenSubWindowExternalBrowserResponsePayload>(
    OPEN_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND,
    { fadeMs, url },
    "サブウィンドウ内ブラウザを開けませんでした。",
  );

  return response.browserId;
}

export async function resizeSubWindowExternalBrowser(
  browserId: string,
  bounds: SubWindowExternalBrowserBounds,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    RESIZE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND,
    { bounds, browserId },
    "サブウィンドウ内ブラウザをリサイズできませんでした。",
  );
}

export async function beginSubWindowExternalBrowserClose(browserId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    BEGIN_SUB_WINDOW_EXTERNAL_BROWSER_CLOSE_COMMAND,
    { browserId },
    "サブウィンドウ内ブラウザの閉じる演出を開始できませんでした。",
  );
}

export async function showSubWindowExternalBrowser(browserId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    SHOW_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND,
    { browserId },
    "サブウィンドウ内ブラウザを表示できませんでした。",
  );
}

export async function closeSubWindowExternalBrowser(browserId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    CLOSE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND,
    { browserId },
    "サブウィンドウ内ブラウザを閉じられませんでした。",
  );
}
