import {
  DEFAULT_PREVIEW_PREFERENCES,
  isPreviewDisplayMode,
  type PreviewDisplayMode,
  type PreviewPreferences,
} from "../domain/preview";

export const PREVIEW_PREFERENCES_STORAGE_KEY = "kmark:preview-preferences:v1";
const INSTANCE_PREVIEW_VISIBILITY_STORAGE_KEY_PREFIX = "kmark:preview-visibility:instance";
const APP_INSTANCE_PRESENCE_STORAGE_KEY_PREFIX = "kmark:app-instance:presence";

export const APP_INSTANCE_PRESENCE_HEARTBEAT_MS = 2000;
export const APP_INSTANCE_PRESENCE_STALE_MS = APP_INSTANCE_PRESENCE_HEARTBEAT_MS * 3;

function normalizeInstanceId(instanceId: string): string | null {
  const normalizedInstanceId = instanceId.trim();

  return normalizedInstanceId.length > 0 ? normalizedInstanceId : null;
}

function buildInstancePreviewVisibilityStorageKey(instanceId: string): string {
  return `${INSTANCE_PREVIEW_VISIBILITY_STORAGE_KEY_PREFIX}:${instanceId}:v1`;
}

function buildAppInstancePresenceStorageKey(instanceId: string): string {
  return `${APP_INSTANCE_PRESENCE_STORAGE_KEY_PREFIX}:${instanceId}:v1`;
}

function getStorageKeysWithPrefix(prefix: string): readonly string[] {
  try {
    const keys: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (typeof key === "string" && key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  } catch {
    return [];
  }
}

function cleanupStaleAppInstancePresence(now = Date.now()): readonly string[] {
  const activeKeys: string[] = [];

  for (const key of getStorageKeysWithPrefix(APP_INSTANCE_PRESENCE_STORAGE_KEY_PREFIX)) {
    try {
      const storedValue = window.localStorage.getItem(key);
      const timestamp = storedValue === null ? Number.NaN : Number.parseInt(storedValue, 10);

      if (Number.isFinite(timestamp) && now - timestamp <= APP_INSTANCE_PRESENCE_STALE_MS) {
        activeKeys.push(key);
        continue;
      }

      window.localStorage.removeItem(key);
    } catch {
      // Ignore stale cleanup failures and keep the remaining entries.
    }
  }

  return activeKeys;
}

export function loadPreviewPreferences(): PreviewPreferences {
  try {
    const storedValue = window.localStorage.getItem(PREVIEW_PREFERENCES_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_PREVIEW_PREFERENCES;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<PreviewPreferences>;

    return {
      previewDisplayMode:
        typeof parsedValue.previewDisplayMode === "string" && isPreviewDisplayMode(parsedValue.previewDisplayMode)
          ? parsedValue.previewDisplayMode
          : DEFAULT_PREVIEW_PREFERENCES.previewDisplayMode,
      isPreviewVisible:
        typeof parsedValue.isPreviewVisible === "boolean"
          ? parsedValue.isPreviewVisible
          : DEFAULT_PREVIEW_PREFERENCES.isPreviewVisible,
    };
  } catch {
    return DEFAULT_PREVIEW_PREFERENCES;
  }
}

export function persistPreviewDisplayMode(previewDisplayMode: PreviewDisplayMode): void {
  const previewPreferences = loadPreviewPreferences();

  persistPreviewPreferences({
    ...previewPreferences,
    previewDisplayMode,
  });
}

export function persistSingletonPreviewVisibility(isPreviewVisible: boolean): void {
  const previewPreferences = loadPreviewPreferences();

  persistPreviewPreferences({
    ...previewPreferences,
    isPreviewVisible,
  });
}

export function getInstancePreviewVisibilityStorageKey(instanceId: string): string | null {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  return normalizedInstanceId === null ? null : buildInstancePreviewVisibilityStorageKey(normalizedInstanceId);
}

export function loadInstancePreviewVisibility(instanceId: string): boolean | null {
  const storageKey = getInstancePreviewVisibilityStorageKey(instanceId);

  if (storageKey === null) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (storedValue === null) {
      return null;
    }

    return storedValue === "true" ? true : storedValue === "false" ? false : null;
  } catch {
    return null;
  }
}

export function persistInstancePreviewVisibility(instanceId: string, isPreviewVisible: boolean): void {
  const storageKey = getInstancePreviewVisibilityStorageKey(instanceId);

  if (storageKey === null) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(isPreviewVisible));
  } catch {
    // Ignore storage failures to keep preview visibility switching responsive.
  }
}

export function isAppInstancePresenceStorageKey(key: string | null): boolean {
  return typeof key === "string" && key.startsWith(APP_INSTANCE_PRESENCE_STORAGE_KEY_PREFIX);
}

export function countActiveAppInstances(now = Date.now()): number {
  const activeKeys = cleanupStaleAppInstancePresence(now);

  return activeKeys.length;
}

export function touchAppInstancePresence(instanceId: string, now = Date.now()): number {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  if (normalizedInstanceId === null) {
    return 1;
  }

  try {
    window.localStorage.setItem(buildAppInstancePresenceStorageKey(normalizedInstanceId), String(now));
  } catch {
    return 1;
  }

  return countActiveAppInstances(now);
}

export function removeAppInstancePresence(instanceId: string): void {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  if (normalizedInstanceId === null) {
    return;
  }

  try {
    window.localStorage.removeItem(buildAppInstancePresenceStorageKey(normalizedInstanceId));
  } catch {
    // Ignore cleanup failures during shutdown.
  }
}

export function persistPreviewPreferences(previewPreferences: PreviewPreferences): void {
  try {
    window.localStorage.setItem(PREVIEW_PREFERENCES_STORAGE_KEY, JSON.stringify(previewPreferences));
  } catch {
    // Ignore storage failures to keep preview preference switching responsive.
  }
}