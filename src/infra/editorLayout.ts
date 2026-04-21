const DESKTOP_SPLIT_STORAGE_KEY = "kmark:layout:desktop-split:v1";

export const DEFAULT_DESKTOP_SPLIT_RATIO = 50;
export const MIN_DESKTOP_SPLIT_RATIO = 20;
export const MAX_DESKTOP_SPLIT_RATIO = 80;

export function loadDesktopSplitRatio(): number | null {
  try {
    const storedValue = window.localStorage.getItem(DESKTOP_SPLIT_STORAGE_KEY);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (typeof parsedValue !== "number" || !Number.isFinite(parsedValue)) {
      return null;
    }

    if (parsedValue < MIN_DESKTOP_SPLIT_RATIO || parsedValue > MAX_DESKTOP_SPLIT_RATIO) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

export function persistDesktopSplitRatio(splitRatio: number): void {
  try {
    window.localStorage.setItem(DESKTOP_SPLIT_STORAGE_KEY, JSON.stringify(splitRatio));
  } catch {
    // Ignore storage failures to keep resizing uninterrupted.
  }
}