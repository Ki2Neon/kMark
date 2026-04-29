import { isTauri } from "@tauri-apps/api/core";
import { invokeTauriCommand } from "./tauriCommand";

const OPEN_EXTERNAL_LINK_COMMAND = "open_external_link";
const EXTERNAL_LINK_SCHEME_PATTERN = /^(https?:|mailto:|tel:)/iu;

export function isSupportedExternalLink(url: string): boolean {
  return EXTERNAL_LINK_SCHEME_PATTERN.test(url.trim());
}

export async function openExternalLink(url: string): Promise<void> {
  const normalizedUrl = url.trim();

  if (!isSupportedExternalLink(normalizedUrl)) {
    throw new Error("未対応の外部リンクです。");
  }

  if (isTauri()) {
    await invokeTauriCommand<void>(
      OPEN_EXTERNAL_LINK_COMMAND,
      { url: normalizedUrl },
      "外部リンクを開けませんでした。",
    );
    return;
  }

  if (typeof window === "undefined") {
    throw new Error("この環境では外部リンクを開けません。");
  }

  const openedWindow = window.open(normalizedUrl, "_blank", "noopener,noreferrer");

  if (openedWindow === null) {
    throw new Error("外部リンクを開けませんでした。");
  }
}
