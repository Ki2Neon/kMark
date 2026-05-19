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

  async isFullscreen() {
    return typeof document !== "undefined" && document.fullscreenElement !== null;
  },

  async listen() {
    return () => {};
  },

  async onDragDropEvent() {
    return () => {};
  },

  async setFullscreen(isFullscreen) {
    if (typeof document === "undefined") {
      return;
    }

    if (isFullscreen) {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
      }

      return;
    }

    if (document.fullscreenElement !== null) {
      await document.exitFullscreen();
    }
  },

  async setWindowTitle(title) {
    if (typeof document !== "undefined") {
      document.title = title;
    }
  },
};
