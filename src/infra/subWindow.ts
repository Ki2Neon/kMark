import {
  SUB_WINDOW_STATE_VERSION,
  type SubWindowSourceLineSelectionRequest,
  type SubWindowState,
} from "../application/subWindow/subWindowPorts";
import { isPreviewDisplayMode } from "../domain/preview";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

const OPEN_SUB_WINDOW_COMMAND = "open_sub_window";
const GET_SUB_WINDOW_STATE_COMMAND = "get_sub_window_state";
const PUBLISH_SUB_WINDOW_STATE_COMMAND = "publish_sub_window_state";
const REQUEST_SUB_WINDOW_SOURCE_LINE_SELECTION_COMMAND = "request_sub_window_source_line_selection";
const SUB_WINDOW_STATE_UPDATED_EVENT = "subwindow-state-updated";
const SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT = "subwindow-source-line-selection-requested";
const SUB_WINDOW_QUERY_KEY = "kmarkWindow";
const SUB_WINDOW_QUERY_VALUE = "subwindow";
const SUB_WINDOW_STATE_QUERY_KEY = "stateKey";
const SUB_WINDOW_STATE_STORAGE_PREFIX = "kmark:subwindow:state:";
const SUB_WINDOW_STATE_CHANNEL_NAME = "kmark:subwindow:state";
const SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME = "kmark:subwindow:source-line-selection";
const SUB_WINDOW_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type SubWindowGlobal = Window & typeof globalThis & {
  readonly __KMARK_WINDOW_KIND__?: unknown;
};

type SubWindowStateMessage = {
  readonly type: "state-updated";
};

type SubWindowSourceLineSelectionMessage = {
  readonly request: SubWindowSourceLineSelectionRequest;
  readonly type: "source-line-selection-requested";
};

export type SubWindowTarget = {
  readonly stateKey: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringFields(value: unknown, fieldNames: readonly string[]): boolean {
  return isRecord(value) && fieldNames.every((fieldName) => typeof value[fieldName] === "string");
}

function isPageStyle(value: unknown): boolean {
  return hasStringFields(value, [
    "width",
    "height",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ]);
}

function isPreviewTextStyle(value: unknown): boolean {
  return hasStringFields(value, [
    "fontSize",
    "fontFamily",
    "headingFontFamily",
  ]);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSubWindowState(value: unknown): value is SubWindowState {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === SUB_WINDOW_STATE_VERSION
    && typeof value.revision === "number"
    && Number.isFinite(value.revision)
    && typeof value.updatedAtEpochMs === "number"
    && Number.isFinite(value.updatedAtEpochMs)
    && typeof value.title === "string"
    && typeof value.displayMode === "string"
    && isPreviewDisplayMode(value.displayMode)
    && typeof value.html === "string"
    && isStringArray(value.pageHtmls)
    && Array.isArray(value.pages)
    && isPageStyle(value.defaultPageStyle)
    && isPreviewTextStyle(value.defaultTextStyle)
    && (
      value.activeSourceLine === null
      || (
        typeof value.activeSourceLine === "number"
        && Number.isFinite(value.activeSourceLine)
      )
    );
}

function isSubWindowSourceLineSelectionRequest(value: unknown): value is SubWindowSourceLineSelectionRequest {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.lineNumber === "number"
    && Number.isInteger(value.lineNumber)
    && value.lineNumber > 0
    && typeof value.requestId === "number"
    && Number.isInteger(value.requestId)
    && value.requestId > 0
    && typeof value.requestedAtEpochMs === "number"
    && Number.isFinite(value.requestedAtEpochMs);
}

function isSubWindowSourceLineSelectionMessage(value: unknown): value is SubWindowSourceLineSelectionMessage {
  return isRecord(value)
    && value.type === "source-line-selection-requested"
    && isSubWindowSourceLineSelectionRequest(value.request);
}

function getStorageKey(stateKey: string): string {
  return `${SUB_WINDOW_STATE_STORAGE_PREFIX}${stateKey}`;
}

function createRandomStateKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);

    return `${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cleanupExpiredStates(now: number): void {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key === null || !key.startsWith(SUB_WINDOW_STATE_STORAGE_PREFIX)) {
      continue;
    }

    const text = window.localStorage.getItem(key);

    if (text === null) {
      continue;
    }

    try {
      const parsed = JSON.parse(text) as unknown;

      if (
        !isRecord(parsed)
        || typeof parsed.updatedAtEpochMs !== "number"
        || now - parsed.updatedAtEpochMs > SUB_WINDOW_STATE_MAX_AGE_MS
      ) {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

function createBrowserSubWindowUrl(stateKey: string): string {
  const url = new URL(window.location.href);

  url.search = "";
  url.hash = "";
  url.searchParams.set(SUB_WINDOW_QUERY_KEY, SUB_WINDOW_QUERY_VALUE);
  url.searchParams.set(SUB_WINDOW_STATE_QUERY_KEY, stateKey);

  return url.toString();
}

function publishBrowserStateUpdated(): void {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_STATE_CHANNEL_NAME);
    channel.postMessage({ type: "state-updated" } satisfies SubWindowStateMessage);
    channel.close();
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${SUB_WINDOW_STATE_CHANNEL_NAME}:ping`, `${Date.now()}`);
  }
}

function publishBrowserSourceLineSelectionRequest(request: SubWindowSourceLineSelectionRequest): void {
  const message = {
    request,
    type: "source-line-selection-requested",
  } satisfies SubWindowSourceLineSelectionMessage;

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME,
      JSON.stringify(message),
    );
  }
}

export function resolveSubWindowTarget(): SubWindowTarget | null {
  if (typeof window === "undefined") {
    return null;
  }

  if ((window as SubWindowGlobal).__KMARK_WINDOW_KIND__ === SUB_WINDOW_QUERY_VALUE) {
    return { stateKey: null };
  }

  const searchParams = new URLSearchParams(window.location.search);

  if (searchParams.get(SUB_WINDOW_QUERY_KEY) !== SUB_WINDOW_QUERY_VALUE) {
    return null;
  }

  const stateKey = searchParams.get(SUB_WINDOW_STATE_QUERY_KEY)?.trim() ?? "";

  return stateKey.length > 0 ? { stateKey } : null;
}

export async function openSubWindow(state: SubWindowState): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("この環境ではサブウィンドウを開けません。");
  }

  if (isTauri()) {
    await invokeTauriCommand<void>(
      OPEN_SUB_WINDOW_COMMAND,
      { state },
      "サブウィンドウを開けませんでした。",
    );
    return;
  }

  const stateKey = createRandomStateKey();

  cleanupExpiredStates(state.updatedAtEpochMs);
  window.localStorage.setItem(getStorageKey(stateKey), JSON.stringify(state));

  const openedWindow = window.open(
    createBrowserSubWindowUrl(stateKey),
    `kmark-subwindow-${stateKey}`,
    "popup,width=1280,height=860",
  );

  if (openedWindow === null) {
    throw new Error("サブウィンドウを開けませんでした。");
  }

  openedWindow.focus();
}

export function loadSubWindowState(stateKey: string): SubWindowState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const text = window.localStorage.getItem(getStorageKey(stateKey));

  if (text === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    return isSubWindowState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadTauriSubWindowState(): Promise<SubWindowState | null> {
  const state = await invokeTauriCommand<SubWindowState>(
    GET_SUB_WINDOW_STATE_COMMAND,
    {},
    "サブウィンドウデータを読込めませんでした。",
  );

  return isSubWindowState(state) ? state : null;
}

export async function publishSubWindowState(state: SubWindowState): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      PUBLISH_SUB_WINDOW_STATE_COMMAND,
      { state },
      "サブウィンドウ同期に失敗しました。",
    );
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  cleanupExpiredStates(state.updatedAtEpochMs);

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key !== null && key.startsWith(SUB_WINDOW_STATE_STORAGE_PREFIX)) {
      window.localStorage.setItem(key, JSON.stringify(state));
    }
  }

  publishBrowserStateUpdated();
}

export async function requestSubWindowSourceLineSelection(
  request: SubWindowSourceLineSelectionRequest,
): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      REQUEST_SUB_WINDOW_SOURCE_LINE_SELECTION_COMMAND,
      { request },
      "サブウィンドウから編集行を選択できませんでした。",
    );
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  publishBrowserSourceLineSelectionRequest(request);
}

export async function listenForSubWindowStateChanged(
  stateKey: string | null,
  callback: (state: SubWindowState) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<SubWindowState>(
      SUB_WINDOW_STATE_UPDATED_EVENT,
      (state) => {
        if (isSubWindowState(state)) {
          callback(state);
        }
      },
    );
  }

  if (typeof window === "undefined" || stateKey === null) {
    return () => {};
  }

  const handleStateUpdated = () => {
    const state = loadSubWindowState(stateKey);

    if (state !== null) {
      callback(state);
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_STATE_CHANNEL_NAME);
    channel.addEventListener("message", handleStateUpdated);

    return () => {
      channel.removeEventListener("message", handleStateUpdated);
      channel.close();
    };
  }

  const pingKey = `${SUB_WINDOW_STATE_CHANNEL_NAME}:ping`;
  const storageKey = getStorageKey(stateKey);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === pingKey) {
      handleStateUpdated();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}

export async function listenForSubWindowSourceLineSelection(
  callback: (request: SubWindowSourceLineSelectionRequest) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<SubWindowSourceLineSelectionRequest>(
      SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT,
      (request) => {
        if (isSubWindowSourceLineSelectionRequest(request)) {
          callback(request);
        }
      },
    );
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const handleMessage = (value: unknown) => {
    if (isSubWindowSourceLineSelectionMessage(value)) {
      callback(value.request);
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      handleMessage(event.data);
    });

    return () => {
      channel.close();
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME || event.newValue === null) {
      return;
    }

    try {
      handleMessage(JSON.parse(event.newValue) as unknown);
    } catch {
      return;
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}
