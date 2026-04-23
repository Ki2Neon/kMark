const PREVIEW_WINDOW_STORAGE_KEY_PREFIX = "kmark:preview-window";

type PreviewWindowSnapshot = {
  readonly content: string;
  readonly fileName: string;
  readonly updatedAt: number;
};

type StoredPreviewWindowCursorState = {
  readonly activeSourceLine: number | null;
  readonly updatedAt: number;
};

export type PreviewWindowEditJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};

function normalizeInstanceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function buildStorageKey(instanceId: string, suffix: string): string {
  return `${PREVIEW_WINDOW_STORAGE_KEY_PREFIX}:${instanceId}:${suffix}:v1`;
}

function normalizeLineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

export function getPreviewWindowSnapshotStorageKey(instanceId: string): string | null {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  return normalizedInstanceId === null ? null : buildStorageKey(normalizedInstanceId, "snapshot");
}

export function getPreviewWindowCursorSyncStorageKey(instanceId: string): string | null {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  return normalizedInstanceId === null ? null : buildStorageKey(normalizedInstanceId, "cursor-sync");
}

export function getPreviewWindowEditJumpRequestStorageKey(instanceId: string): string | null {
  const normalizedInstanceId = normalizeInstanceId(instanceId);

  return normalizedInstanceId === null ? null : buildStorageKey(normalizedInstanceId, "edit-jump-request");
}

export function loadPreviewWindowSnapshot(instanceId: string): PreviewWindowSnapshot | null {
  const storageKey = getPreviewWindowSnapshotStorageKey(instanceId);

  if (storageKey === null) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<PreviewWindowSnapshot>;

    if (typeof parsedValue.content !== "string" || typeof parsedValue.fileName !== "string") {
      return null;
    }

    return {
      content: parsedValue.content,
      fileName: parsedValue.fileName,
      updatedAt: typeof parsedValue.updatedAt === "number" ? parsedValue.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function persistPreviewWindowSnapshot(
  instanceId: string,
  snapshot: Pick<PreviewWindowSnapshot, "content" | "fileName">,
): void {
  const storageKey = getPreviewWindowSnapshotStorageKey(instanceId);

  if (storageKey === null) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      content: snapshot.content,
      fileName: snapshot.fileName,
      updatedAt: Date.now(),
    } satisfies PreviewWindowSnapshot));
  } catch {
    // Ignore sync persistence failures so editing remains uninterrupted.
  }
}

export function loadPreviewWindowActiveSourceLine(instanceId: string): number | null {
  const storageKey = getPreviewWindowCursorSyncStorageKey(instanceId);

  if (storageKey === null) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<StoredPreviewWindowCursorState>;

    return normalizeLineNumber(parsedValue.activeSourceLine);
  } catch {
    return null;
  }
}

export function persistPreviewWindowActiveSourceLine(instanceId: string, activeSourceLine: number | null): void {
  const storageKey = getPreviewWindowCursorSyncStorageKey(instanceId);

  if (storageKey === null) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      activeSourceLine: normalizeLineNumber(activeSourceLine),
      updatedAt: Date.now(),
    } satisfies StoredPreviewWindowCursorState));
  } catch {
    // Ignore sync persistence failures so editing remains uninterrupted.
  }
}

export function loadPreviewWindowEditJumpRequest(instanceId: string): PreviewWindowEditJumpRequest | null {
  const storageKey = getPreviewWindowEditJumpRequestStorageKey(instanceId);

  if (storageKey === null) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<PreviewWindowEditJumpRequest>;
    const lineNumber = normalizeLineNumber(parsedValue.lineNumber);

    if (lineNumber === null || typeof parsedValue.requestId !== "number" || !Number.isFinite(parsedValue.requestId)) {
      return null;
    }

    return {
      lineNumber,
      requestId: parsedValue.requestId,
    };
  } catch {
    return null;
  }
}

export function requestPreviewWindowEditJump(instanceId: string, lineNumber: number): void {
  const storageKey = getPreviewWindowEditJumpRequestStorageKey(instanceId);

  if (storageKey === null) {
    return;
  }

  const normalizedLineNumber = normalizeLineNumber(lineNumber);

  if (normalizedLineNumber === null) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      lineNumber: normalizedLineNumber,
      requestId: Date.now(),
    } satisfies PreviewWindowEditJumpRequest));
  } catch {
    // Ignore sync persistence failures so preview interaction stays responsive.
  }
}