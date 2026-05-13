export type RuntimeUnlisten = () => void;

export type RuntimeDragDropPosition = {
  readonly x: number;
  readonly y: number;
};

export type RuntimeDragDropPayload =
  | {
    readonly paths: readonly string[];
    readonly position: RuntimeDragDropPosition;
    readonly type: "drop" | "enter" | "over";
  }
  | {
    readonly paths?: readonly string[];
    readonly position?: RuntimeDragDropPosition;
    readonly type: "leave";
  };

export type RuntimeDragDropEvent = {
  readonly payload: RuntimeDragDropPayload;
};

export type RuntimeApi = {
  readonly kind: "browser" | "tauri";
  convertFileSrc(filePath: string): string;
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  listen<T>(eventName: string, callback: (payload: T) => void): Promise<RuntimeUnlisten>;
  onDragDropEvent(callback: (event: RuntimeDragDropEvent) => void): Promise<RuntimeUnlisten>;
  setWindowTitle(title: string): Promise<void>;
};

type TauriRuntimeModule = {
  readonly runtimeTauri: RuntimeApi;
};

type TauriWindow = Window & typeof globalThis & {
  readonly __TAURI_INTERNALS__?: unknown;
};

let pendingTauriRuntime: Promise<RuntimeApi> | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}

async function loadRuntime(): Promise<RuntimeApi> {
  if (!isTauri()) {
    const { runtimeBrowser } = await import("./runtime.browser");
    return runtimeBrowser;
  }

  if (pendingTauriRuntime === null) {
    pendingTauriRuntime = import("./runtime.tauri").then((module: TauriRuntimeModule) => module.runtimeTauri);
  }

  return pendingTauriRuntime;
}

export async function invokeRuntimeCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  return (await loadRuntime()).invoke<T>(command, args);
}

export async function listenRuntimeEvent<T>(
  eventName: string,
  callback: (payload: T) => void,
): Promise<RuntimeUnlisten> {
  return (await loadRuntime()).listen<T>(eventName, callback);
}

export async function convertRuntimeFileSrc(filePath: string): Promise<string> {
  return (await loadRuntime()).convertFileSrc(filePath);
}

export async function setRuntimeWindowTitle(title: string): Promise<void> {
  await (await loadRuntime()).setWindowTitle(title);
}

export async function listenRuntimeDragDropEvent(
  callback: (event: RuntimeDragDropEvent) => void,
): Promise<RuntimeUnlisten> {
  return (await loadRuntime()).onDragDropEvent(callback);
}
