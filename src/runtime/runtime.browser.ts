import { type RuntimeApi } from "./runtime";

function unsupportedTauriRuntime(): never {
  throw new Error("Tauri 環境が必要です。");
}

export const runtimeBrowser: RuntimeApi = {
  kind: "browser",

  convertFileSrc(filePath) {
    return filePath;
  },

  async invoke() {
    unsupportedTauriRuntime();
  },

  async listen() {
    return () => {};
  },

  async onDragDropEvent() {
    return () => {};
  },

  async setWindowTitle(title) {
    if (typeof document !== "undefined") {
      document.title = title;
    }
  },
};
