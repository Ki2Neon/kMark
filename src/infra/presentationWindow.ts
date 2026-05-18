import {
  PRESENTATION_WINDOW_SNAPSHOT_VERSION,
  type PresentationWindowSnapshot,
} from "../application/presentationWindow/presentationWindowPorts";
import { isPreviewDisplayMode } from "../domain/preview";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";

const OPEN_PRESENTATION_WINDOW_COMMAND = "open_presentation_window";
const PRESENTATION_WINDOW_QUERY_KEY = "kmarkWindow";
const PRESENTATION_WINDOW_QUERY_VALUE = "presentation";
const PRESENTATION_SNAPSHOT_QUERY_KEY = "snapshotKey";
const PRESENTATION_SNAPSHOT_STORAGE_PREFIX = "kmark:presentation:snapshot:";
const PRESENTATION_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

function isPresentationWindowSnapshot(value: unknown): value is PresentationWindowSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === PRESENTATION_WINDOW_SNAPSHOT_VERSION
    && typeof value.createdAtEpochMs === "number"
    && Number.isFinite(value.createdAtEpochMs)
    && typeof value.title === "string"
    && typeof value.displayMode === "string"
    && isPreviewDisplayMode(value.displayMode)
    && typeof value.html === "string"
    && isStringArray(value.pageHtmls)
    && Array.isArray(value.pages)
    && isPageStyle(value.defaultPageStyle)
    && isPreviewTextStyle(value.defaultTextStyle);
}

function getStorageKey(snapshotKey: string): string {
  return `${PRESENTATION_SNAPSHOT_STORAGE_PREFIX}${snapshotKey}`;
}

function createRandomSnapshotKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);

    return `${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cleanupExpiredSnapshots(now: number): void {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key === null || !key.startsWith(PRESENTATION_SNAPSHOT_STORAGE_PREFIX)) {
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
        || typeof parsed.createdAtEpochMs !== "number"
        || now - parsed.createdAtEpochMs > PRESENTATION_SNAPSHOT_MAX_AGE_MS
      ) {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

function createBrowserPresentationWindowUrl(snapshotKey: string): string {
  const url = new URL(window.location.href);

  url.search = "";
  url.hash = "";
  url.searchParams.set(PRESENTATION_WINDOW_QUERY_KEY, PRESENTATION_WINDOW_QUERY_VALUE);
  url.searchParams.set(PRESENTATION_SNAPSHOT_QUERY_KEY, snapshotKey);

  return url.toString();
}

export function resolvePresentationSnapshotKeyFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);

  if (searchParams.get(PRESENTATION_WINDOW_QUERY_KEY) !== PRESENTATION_WINDOW_QUERY_VALUE) {
    return null;
  }

  const snapshotKey = searchParams.get(PRESENTATION_SNAPSHOT_QUERY_KEY)?.trim() ?? "";

  return snapshotKey.length > 0 ? snapshotKey : null;
}

export async function openPresentationWindow(snapshot: PresentationWindowSnapshot): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("この環境ではプレゼンウィンドウを開けません。");
  }

  const snapshotKey = createRandomSnapshotKey();

  cleanupExpiredSnapshots(snapshot.createdAtEpochMs);
  window.localStorage.setItem(getStorageKey(snapshotKey), JSON.stringify(snapshot));

  if (isTauri()) {
    await invokeTauriCommand<void>(
      OPEN_PRESENTATION_WINDOW_COMMAND,
      {
        snapshotKey,
        title: snapshot.title,
      },
      "プレゼンウィンドウを開けませんでした。",
    );
    return;
  }

  const openedWindow = window.open(
    createBrowserPresentationWindowUrl(snapshotKey),
    `kmark-presentation-${snapshotKey}`,
    "popup,width=1280,height=860",
  );

  if (openedWindow === null) {
    throw new Error("プレゼンウィンドウを開けませんでした。");
  }

  openedWindow.focus();
}

export function loadPresentationSnapshot(snapshotKey: string): PresentationWindowSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const text = window.localStorage.getItem(getStorageKey(snapshotKey));

  if (text === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    return isPresentationWindowSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
