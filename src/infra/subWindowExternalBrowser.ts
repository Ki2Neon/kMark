import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";

const OPEN_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "open_sub_window_external_browser";
const RESIZE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "resize_sub_window_external_browser";
const CLOSE_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND = "close_sub_window_external_browser";

export type SubWindowExternalBrowserBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type OpenSubWindowExternalBrowserResponse = {
  readonly browserId: string;
};

export function supportsNativeSubWindowExternalBrowser(): boolean {
  return isTauri();
}

export async function openSubWindowExternalBrowser(url: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("この環境ではサブウィンドウ内ブラウザを開けません。");
  }

  const response = await invokeTauriCommand<OpenSubWindowExternalBrowserResponse>(
    OPEN_SUB_WINDOW_EXTERNAL_BROWSER_COMMAND,
    { url },
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
