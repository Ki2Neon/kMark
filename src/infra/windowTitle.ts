import { isTauri } from "@tauri-apps/api/core";

let pendingNativeWindowModule: Promise<typeof import("@tauri-apps/api/window")> | null = null;

function loadWindowModule() {
  if (pendingNativeWindowModule !== null) {
    return pendingNativeWindowModule;
  }

  pendingNativeWindowModule = import("@tauri-apps/api/window");

  return pendingNativeWindowModule;
}

export function syncWindowTitle(title: string) {
  document.title = title;

  if (!isTauri()) {
    return;
  }

  void loadWindowModule()
    .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
    .catch(() => {
      // Ignore title-sync failures and keep the document title updated.
    });
}