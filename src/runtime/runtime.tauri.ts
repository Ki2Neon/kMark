import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type RuntimeApi, type RuntimeDragDropEvent } from "./runtime";

export const runtimeTauri: RuntimeApi = {
  kind: "tauri",

  convertFileSrc(filePath) {
    return convertFileSrc(filePath);
  },

  invoke<T>(command: string, args: Record<string, unknown>) {
    return invoke<T>(command, args);
  },

  listen<T>(eventName: string, callback: (payload: T) => void) {
    return getCurrentWindow().listen<T>(eventName, (event) => {
      callback(event.payload);
    });
  },

  onDragDropEvent(callback) {
    return getCurrentWebview().onDragDropEvent((event) => {
      callback(event as RuntimeDragDropEvent);
    });
  },

  async setWindowTitle(title) {
    await getCurrentWindow().setTitle(title);
  },
};
