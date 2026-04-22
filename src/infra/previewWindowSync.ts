const PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY = "kmark:preview-window:cursor-sync:v1";
const PREVIEW_WINDOW_DRAFT_JUMP_REQUEST_STORAGE_KEY = "kmark:preview-window:draft-jump-request:v1";

type StoredPreviewWindowCursorState = {
  readonly activeSourceLine: number | null;
  readonly updatedAt: number;
};

export type PreviewWindowDraftJumpRequest = {
  readonly lineNumber: number;
  readonly requestId: number;
};

function normalizeLineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

export function loadPreviewWindowActiveSourceLine(): number | null {
  try {
    const storedValue = window.localStorage.getItem(PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<StoredPreviewWindowCursorState>;

    return normalizeLineNumber(parsedValue.activeSourceLine);
  } catch {
    return null;
  }
}

export function persistPreviewWindowActiveSourceLine(activeSourceLine: number | null): void {
  try {
    window.localStorage.setItem(PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY, JSON.stringify({
      activeSourceLine: normalizeLineNumber(activeSourceLine),
      updatedAt: Date.now(),
    } satisfies StoredPreviewWindowCursorState));
  } catch {
    // Ignore sync persistence failures so editing remains uninterrupted.
  }
}

export function loadPreviewWindowDraftJumpRequest(): PreviewWindowDraftJumpRequest | null {
  try {
    const storedValue = window.localStorage.getItem(PREVIEW_WINDOW_DRAFT_JUMP_REQUEST_STORAGE_KEY);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<PreviewWindowDraftJumpRequest>;
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

export function requestPreviewWindowDraftJump(lineNumber: number): void {
  const normalizedLineNumber = normalizeLineNumber(lineNumber);

  if (normalizedLineNumber === null) {
    return;
  }

  try {
    window.localStorage.setItem(PREVIEW_WINDOW_DRAFT_JUMP_REQUEST_STORAGE_KEY, JSON.stringify({
      lineNumber: normalizedLineNumber,
      requestId: Date.now(),
    } satisfies PreviewWindowDraftJumpRequest));
  } catch {
    // Ignore sync persistence failures so preview interaction stays responsive.
  }
}

export {
  PREVIEW_WINDOW_CURSOR_SYNC_STORAGE_KEY,
  PREVIEW_WINDOW_DRAFT_JUMP_REQUEST_STORAGE_KEY,
};