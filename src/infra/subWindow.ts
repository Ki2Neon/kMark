import {
  SUB_WINDOW_STATE_VERSION,
  type SubWindowResolvedSourceState,
  type SubWindowSelection,
  type SubWindowSourceStateChanged,
  type SubWindowSourcesSnapshot,
  type SubWindowSourceLineSelectionRequest,
  type SubWindowSourceSummary,
  type SubWindowState,
} from "../application/subWindow/subWindowPorts";
import { isPreviewDisplayMode } from "../domain/preview";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

const OPEN_SUB_WINDOW_COMMAND = "open_sub_window";
const ACTIVATE_SUB_WINDOW_SOURCE_COMMAND = "activate_sub_window_source";
const GET_SUB_WINDOW_SOURCE_STATE_COMMAND = "get_sub_window_source_state";
const GET_SUB_WINDOW_SOURCES_COMMAND = "get_sub_window_sources";
const PUBLISH_SUB_WINDOW_SOURCE_STATE_COMMAND = "publish_sub_window_source_state";
const REGISTER_SUB_WINDOW_SOURCE_COMMAND = "register_sub_window_source";
const REQUEST_SUB_WINDOW_SOURCE_LINE_SELECTION_COMMAND = "request_sub_window_source_line_selection";
const TAKE_SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTS_COMMAND = "take_sub_window_source_line_selection_requests";
const UNREGISTER_SUB_WINDOW_SOURCE_COMMAND = "unregister_sub_window_source";
const SUB_WINDOW_SOURCES_UPDATED_EVENT = "subwindow-sources-updated";
const SUB_WINDOW_SOURCE_STATE_UPDATED_EVENT = "subwindow-source-state-updated";
const SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT = "subwindow-source-line-selection-requested";
const SUB_WINDOW_QUERY_KEY = "kmarkWindow";
const SUB_WINDOW_QUERY_VALUE = "subwindow";
const SUB_WINDOW_STATE_QUERY_KEY = "stateKey";
const SUB_WINDOW_SOURCE_STORAGE_PREFIX = "kmark:subwindow:source:";
const SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY = "kmark:subwindow:active-source";
const SUB_WINDOW_SOURCE_CHANNEL_NAME = "kmark:subwindow:source";
const SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME = "kmark:subwindow:source-line-selection";
const SUB_WINDOW_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TAURI_SUB_WINDOW_POLL_INTERVAL_MS = 500;
const TAURI_LINE_SELECTION_POLL_INTERVAL_MS = 250;
const BROWSER_SOURCE_ID_STORAGE_KEY = "kmark:subwindow:browser-source-id";

type SubWindowGlobal = Window & typeof globalThis & {
  readonly __KMARK_WINDOW_KIND__?: unknown;
};

type BrowserStoredSource = {
  readonly sourceId: string;
  readonly state: SubWindowState;
};

type BrowserSourceMessage =
  | {
    readonly type: "sources-updated";
  }
  | {
    readonly change: SubWindowSourceStateChanged;
    readonly type: "source-state-updated";
  };

type SubWindowSourceLineSelectionMessage = {
  readonly request: SubWindowSourceLineSelectionRequest;
  readonly type: "source-line-selection-requested";
};

export type SubWindowTarget = {
  readonly stateKey: string | null;
};

type RegisterSubWindowSourceResponse = {
  readonly sourceId: string;
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

function isSubWindowSourceSummary(value: unknown): value is SubWindowSourceSummary {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.isActive === "boolean"
    && typeof value.title === "string"
    && typeof value.updatedAtEpochMs === "number"
    && Number.isFinite(value.updatedAtEpochMs);
}

function isSubWindowSourcesSnapshot(value: unknown): value is SubWindowSourcesSnapshot {
  return isRecord(value)
    && (value.activeSourceId === null || typeof value.activeSourceId === "string")
    && Array.isArray(value.sources)
    && value.sources.every(isSubWindowSourceSummary);
}

function isSubWindowResolvedSourceState(value: unknown): value is SubWindowResolvedSourceState {
  return isRecord(value)
    && (value.sourceId === null || typeof value.sourceId === "string")
    && (value.state === null || isSubWindowState(value.state));
}

function isSubWindowSourceStateChanged(value: unknown): value is SubWindowSourceStateChanged {
  return isRecord(value)
    && typeof value.sourceId === "string"
    && isSubWindowState(value.state);
}

function isSubWindowSelection(value: unknown): value is SubWindowSelection {
  return isRecord(value)
    && (
      value.mode === "auto"
      || (
        value.mode === "source"
        && typeof value.sourceId === "string"
        && value.sourceId.length > 0
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
    && Number.isFinite(value.requestedAtEpochMs)
    && typeof value.sourceId === "string"
    && value.sourceId.length > 0;
}

function isSubWindowSourceLineSelectionRequests(
  value: unknown,
): value is readonly SubWindowSourceLineSelectionRequest[] {
  return Array.isArray(value) && value.every(isSubWindowSourceLineSelectionRequest);
}

function isSubWindowSourceLineSelectionMessage(value: unknown): value is SubWindowSourceLineSelectionMessage {
  return isRecord(value)
    && value.type === "source-line-selection-requested"
    && isSubWindowSourceLineSelectionRequest(value.request);
}

function isBrowserStoredSource(value: unknown): value is BrowserStoredSource {
  return isRecord(value)
    && typeof value.sourceId === "string"
    && isSubWindowState(value.state);
}

function isBrowserSourceMessage(value: unknown): value is BrowserSourceMessage {
  return isRecord(value)
    && (
      value.type === "sources-updated"
      || (
        value.type === "source-state-updated"
        && isSubWindowSourceStateChanged(value.change)
      )
    );
}

function createRandomKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);

    return `${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSourceStorageKey(sourceId: string): string {
  return `${SUB_WINDOW_SOURCE_STORAGE_PREFIX}${sourceId}`;
}

function getBrowserSourceId(): string {
  const currentSourceId = window.sessionStorage.getItem(BROWSER_SOURCE_ID_STORAGE_KEY)?.trim() ?? "";

  if (currentSourceId.length > 0) {
    return currentSourceId;
  }

  const nextSourceId = `browser-${createRandomKey()}`;
  window.sessionStorage.setItem(BROWSER_SOURCE_ID_STORAGE_KEY, nextSourceId);

  return nextSourceId;
}

function cleanupExpiredBrowserSources(now: number): void {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key === null || !key.startsWith(SUB_WINDOW_SOURCE_STORAGE_PREFIX)) {
      continue;
    }

    const storedSource = readBrowserStoredSourceByKey(key);

    if (storedSource === null || now - storedSource.state.updatedAtEpochMs > SUB_WINDOW_STATE_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
    }
  }
}

function readBrowserStoredSourceByKey(key: string): BrowserStoredSource | null {
  const text = window.localStorage.getItem(key);

  if (text === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    return isBrowserStoredSource(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readBrowserStoredSource(sourceId: string): BrowserStoredSource | null {
  return readBrowserStoredSourceByKey(getSourceStorageKey(sourceId));
}

function writeBrowserStoredSource(sourceId: string, state: SubWindowState): void {
  window.localStorage.setItem(
    getSourceStorageKey(sourceId),
    JSON.stringify({ sourceId, state } satisfies BrowserStoredSource),
  );
}

function readBrowserActiveSourceId(): string | null {
  const sourceId = window.localStorage.getItem(SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY)?.trim() ?? "";

  return sourceId.length > 0 && readBrowserStoredSource(sourceId) !== null ? sourceId : null;
}

function writeBrowserActiveSourceId(sourceId: string | null): void {
  if (sourceId === null) {
    window.localStorage.removeItem(SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY, sourceId);
}

function postBrowserSourceMessage(message: BrowserSourceMessage): void {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_SOURCE_CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
    return;
  }

  window.localStorage.setItem(`${SUB_WINDOW_SOURCE_CHANNEL_NAME}:ping`, JSON.stringify({
    message,
    now: Date.now(),
  }));
}

function getBrowserSourcesSnapshot(): SubWindowSourcesSnapshot {
  cleanupExpiredBrowserSources(Date.now());

  const activeSourceId = readBrowserActiveSourceId();
  const sources: SubWindowSourceSummary[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key === null || !key.startsWith(SUB_WINDOW_SOURCE_STORAGE_PREFIX)) {
      continue;
    }

    const storedSource = readBrowserStoredSourceByKey(key);

    if (storedSource === null) {
      continue;
    }

    sources.push({
      id: storedSource.sourceId,
      isActive: storedSource.sourceId === activeSourceId,
      title: storedSource.state.title,
      updatedAtEpochMs: storedSource.state.updatedAtEpochMs,
    });
  }

  sources.sort((left, right) => left.title.localeCompare(right.title, "ja") || left.id.localeCompare(right.id));

  return {
    activeSourceId,
    sources,
  };
}

function createSourcesSnapshotSignature(snapshot: SubWindowSourcesSnapshot): string {
  return JSON.stringify({
    activeSourceId: snapshot.activeSourceId,
    sources: snapshot.sources.map((source) => ({
      id: source.id,
      isActive: source.isActive,
      title: source.title,
      updatedAtEpochMs: source.updatedAtEpochMs,
    })),
  });
}

function resolveBrowserSelectionSourceId(selection: SubWindowSelection): string | null {
  if (selection.mode === "source") {
    return selection.sourceId;
  }

  return readBrowserActiveSourceId();
}

function getBrowserResolvedSourceState(selection: SubWindowSelection): SubWindowResolvedSourceState {
  const sourceId = resolveBrowserSelectionSourceId(selection);

  if (sourceId === null) {
    return { sourceId: null, state: null };
  }

  return {
    sourceId,
    state: readBrowserStoredSource(sourceId)?.state ?? null,
  };
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

  window.localStorage.setItem(
    SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME,
    JSON.stringify({ message, now: Date.now() }),
  );
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

export async function openSubWindow(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("この環境ではサブウィンドウを開けません。");
  }

  if (isTauri()) {
    await invokeTauriCommand<void>(
      OPEN_SUB_WINDOW_COMMAND,
      {},
      "サブウィンドウを開けませんでした。",
    );
    return;
  }

  const stateKey = createRandomKey();
  const url = new URL(window.location.href);

  url.search = "";
  url.hash = "";
  url.searchParams.set(SUB_WINDOW_QUERY_KEY, SUB_WINDOW_QUERY_VALUE);
  url.searchParams.set(SUB_WINDOW_STATE_QUERY_KEY, stateKey);

  const openedWindow = window.open(
    url.toString(),
    `kmark-subwindow-${stateKey}`,
    "popup,width=1280,height=860",
  );

  if (openedWindow === null) {
    throw new Error("サブウィンドウを開けませんでした。");
  }

  openedWindow.focus();
}

export async function activateSubWindowSource(sourceId: string): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      ACTIVATE_SUB_WINDOW_SOURCE_COMMAND,
      { sourceId },
      "サブウィンドウ表示元の切替に失敗しました。",
    );
    return;
  }

  if (typeof window === "undefined" || readBrowserStoredSource(sourceId) === null) {
    return;
  }

  writeBrowserActiveSourceId(sourceId);
  postBrowserSourceMessage({ type: "sources-updated" });
}

export async function getSubWindowSources(): Promise<SubWindowSourcesSnapshot> {
  if (isTauri()) {
    const snapshot = await invokeTauriCommand<SubWindowSourcesSnapshot>(
      GET_SUB_WINDOW_SOURCES_COMMAND,
      {},
      "サブウィンドウ表示元を読込めませんでした。",
    );

    return isSubWindowSourcesSnapshot(snapshot) ? snapshot : { activeSourceId: null, sources: [] };
  }

  if (typeof window === "undefined") {
    return { activeSourceId: null, sources: [] };
  }

  return getBrowserSourcesSnapshot();
}

export async function getSubWindowSourceState(
  selection: SubWindowSelection,
): Promise<SubWindowResolvedSourceState> {
  if (!isSubWindowSelection(selection)) {
    return { sourceId: null, state: null };
  }

  if (isTauri()) {
    const resolvedState = await invokeTauriCommand<SubWindowResolvedSourceState>(
      GET_SUB_WINDOW_SOURCE_STATE_COMMAND,
      { selection },
      "サブウィンドウデータを読込めませんでした。",
    );

    return isSubWindowResolvedSourceState(resolvedState) ? resolvedState : { sourceId: null, state: null };
  }

  if (typeof window === "undefined") {
    return { sourceId: null, state: null };
  }

  return getBrowserResolvedSourceState(selection);
}

export async function registerSubWindowSource(state: SubWindowState): Promise<string> {
  if (isTauri()) {
    const response = await invokeTauriCommand<RegisterSubWindowSourceResponse>(
      REGISTER_SUB_WINDOW_SOURCE_COMMAND,
      { state },
      "サブウィンドウ表示元を登録できませんでした。",
    );

    return response.sourceId;
  }

  if (typeof window === "undefined") {
    throw new Error("この環境ではサブウィンドウ表示元を登録できません。");
  }

  const sourceId = getBrowserSourceId();

  writeBrowserStoredSource(sourceId, state);

  if (document.hasFocus() || readBrowserActiveSourceId() === null) {
    writeBrowserActiveSourceId(sourceId);
  }

  postBrowserSourceMessage({
    change: { sourceId, state },
    type: "source-state-updated",
  });
  postBrowserSourceMessage({ type: "sources-updated" });

  return sourceId;
}

export async function publishSubWindowSourceState(sourceId: string, state: SubWindowState): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      PUBLISH_SUB_WINDOW_SOURCE_STATE_COMMAND,
      { sourceId, state },
      "サブウィンドウ同期に失敗しました。",
    );
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStoredSource(sourceId, state);
  postBrowserSourceMessage({
    change: { sourceId, state },
    type: "source-state-updated",
  });
  postBrowserSourceMessage({ type: "sources-updated" });
}

export async function unregisterSubWindowSource(sourceId: string): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<void>(
      UNREGISTER_SUB_WINDOW_SOURCE_COMMAND,
      { sourceId },
      "サブウィンドウ表示元の解除に失敗しました。",
    );
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const wasActiveSource = window.localStorage.getItem(SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY) === sourceId;

  window.localStorage.removeItem(getSourceStorageKey(sourceId));

  if (wasActiveSource) {
    writeBrowserActiveSourceId(null);
  }

  postBrowserSourceMessage({ type: "sources-updated" });
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

async function takeSubWindowSourceLineSelectionRequests(): Promise<readonly SubWindowSourceLineSelectionRequest[]> {
  const requests = await invokeTauriCommand<readonly SubWindowSourceLineSelectionRequest[]>(
    TAKE_SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTS_COMMAND,
    {},
    "サブウィンドウからの編集行選択を読込めませんでした。",
  );

  return isSubWindowSourceLineSelectionRequests(requests) ? requests : [];
}

export async function listenForSubWindowSourcesChanged(
  callback: (snapshot: SubWindowSourcesSnapshot) => void,
): Promise<() => void> {
  if (isTauri()) {
    let isDisposed = false;
    let lastSnapshotSignature = "";
    const publishSnapshot = (snapshot: SubWindowSourcesSnapshot) => {
      const nextSignature = createSourcesSnapshotSignature(snapshot);

      if (nextSignature === lastSnapshotSignature) {
        return;
      }

      lastSnapshotSignature = nextSignature;
      callback(snapshot);
    };
    const pollSnapshot = () => {
      void getSubWindowSources()
        .then((snapshot) => {
          if (!isDisposed) {
            publishSnapshot(snapshot);
          }
        })
        .catch(() => {});
    };
    const unlisten = await listenTauriEvent<SubWindowSourcesSnapshot>(
      SUB_WINDOW_SOURCES_UPDATED_EVENT,
      (snapshot) => {
        if (isSubWindowSourcesSnapshot(snapshot)) {
          publishSnapshot(snapshot);
        }
      },
    );
    const intervalId = window.setInterval(pollSnapshot, TAURI_SUB_WINDOW_POLL_INTERVAL_MS);

    pollSnapshot();

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      unlisten();
    };
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const handleSourcesChanged = () => {
    callback(getBrowserSourcesSnapshot());
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_SOURCE_CHANNEL_NAME);
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (isBrowserSourceMessage(event.data)) {
        handleSourcesChanged();
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }

  const pingKey = `${SUB_WINDOW_SOURCE_CHANNEL_NAME}:ping`;
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === SUB_WINDOW_ACTIVE_SOURCE_STORAGE_KEY
      || event.key === pingKey
      || event.key?.startsWith(SUB_WINDOW_SOURCE_STORAGE_PREFIX) === true
    ) {
      handleSourcesChanged();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}

export async function listenForSubWindowSourceStateChanged(
  callback: (change: SubWindowSourceStateChanged) => void,
): Promise<() => void> {
  if (isTauri()) {
    return listenTauriEvent<SubWindowSourceStateChanged>(
      SUB_WINDOW_SOURCE_STATE_UPDATED_EVENT,
      (change) => {
        if (isSubWindowSourceStateChanged(change)) {
          callback(change);
        }
      },
    );
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SUB_WINDOW_SOURCE_CHANNEL_NAME);
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (isBrowserSourceMessage(event.data) && event.data.type === "source-state-updated") {
        callback(event.data.change);
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }

  const pingKey = `${SUB_WINDOW_SOURCE_CHANNEL_NAME}:ping`;
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== pingKey || event.newValue === null) {
      return;
    }

    try {
      const parsed = JSON.parse(event.newValue) as { readonly message?: unknown };

      if (isBrowserSourceMessage(parsed.message) && parsed.message.type === "source-state-updated") {
        callback(parsed.message.change);
      }
    } catch {
      return;
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
    let isDisposed = false;
    const pollRequests = () => {
      void takeSubWindowSourceLineSelectionRequests()
        .then((requests) => {
          if (isDisposed) {
            return;
          }

          for (const request of requests) {
            callback(request);
          }
        })
        .catch(() => {});
    };
    const unlisten = await listenTauriEvent<SubWindowSourceLineSelectionRequest>(
      SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT,
      (request) => {
        if (isSubWindowSourceLineSelectionRequest(request)) {
          callback(request);
        }
      },
    );
    const intervalId = window.setInterval(pollRequests, TAURI_LINE_SELECTION_POLL_INTERVAL_MS);

    pollRequests();

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      unlisten();
    };
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
    const handleBroadcastMessage = (event: MessageEvent<unknown>) => {
      handleMessage(event.data);
    };

    channel.addEventListener("message", handleBroadcastMessage);

    return () => {
      channel.removeEventListener("message", handleBroadcastMessage);
      channel.close();
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SUB_WINDOW_SOURCE_LINE_SELECTION_CHANNEL_NAME || event.newValue === null) {
      return;
    }

    try {
      const parsed = JSON.parse(event.newValue) as { readonly message?: unknown };
      handleMessage(parsed.message);
    } catch {
      return;
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}
