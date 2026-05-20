import { useEffect } from "react";

function normalizeKey(event: KeyboardEvent): string {
  return event.key.toLocaleLowerCase("en-US");
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']") !== null;
}

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function isApplicationShortcut(event: KeyboardEvent): boolean {
  if (!hasPrimaryModifier(event) || event.altKey) {
    return false;
  }

  const key = normalizeKey(event);

  if (!event.shiftKey && (key === "s" || key === "p" || key === "o" || key === "n")) {
    return true;
  }

  return event.shiftKey && key === "b";
}

function isReloadShortcut(event: KeyboardEvent): boolean {
  const key = normalizeKey(event);

  return key === "f5"
    || (hasPrimaryModifier(event) && !event.altKey && key === "r");
}

function isHistoryNavigationShortcut(event: KeyboardEvent): boolean {
  const key = normalizeKey(event);

  return key === "browserback"
    || key === "browserforward"
    || (!hasPrimaryModifier(event) && event.altKey && (key === "arrowleft" || key === "arrowright" || key === "home"));
}

function isTabOrWindowShortcut(event: KeyboardEvent): boolean {
  const key = normalizeKey(event);

  if (event.ctrlKey && !event.metaKey && !event.altKey && (key === "tab" || key === "pageup" || key === "pagedown")) {
    return true;
  }

  if (!hasPrimaryModifier(event) || event.altKey) {
    return false;
  }

  return key === "t"
    || key === "w"
    || key === "q"
    || /^[1-9]$/u.test(key);
}

function isBrowserUiShortcut(event: KeyboardEvent): boolean {
  const key = normalizeKey(event);

  if (key === "f1" || key === "f3" || key === "f6" || key === "f10") {
    return true;
  }

  if (event.altKey && !hasPrimaryModifier(event) && key === "d") {
    return true;
  }

  if (!hasPrimaryModifier(event) || event.altKey) {
    return false;
  }

  return key === "f"
    || key === "l"
    || key === "e"
    || key === "g"
    || key === "k";
}

function isZoomShortcut(event: KeyboardEvent): boolean {
  if (!hasPrimaryModifier(event) || event.altKey) {
    return false;
  }

  const key = normalizeKey(event);

  return key === "+"
    || key === "="
    || key === "-"
    || key === "_"
    || key === "0"
    || event.code === "NumpadAdd"
    || event.code === "NumpadSubtract"
    || event.code === "Numpad0";
}

function isDevToolsShortcut(event: KeyboardEvent): boolean {
  const key = normalizeKey(event);

  if (key === "f12") {
    return true;
  }

  if (!hasPrimaryModifier(event)) {
    return false;
  }

  return (event.shiftKey || event.altKey)
    && (key === "i" || key === "j" || key === "c");
}

function isBrowserDocumentShortcut(event: KeyboardEvent): boolean {
  if (!hasPrimaryModifier(event) || event.altKey) {
    return false;
  }

  const key = normalizeKey(event);

  return key === "u"
    || key === "d"
    || key === "h"
    || key === "j"
    || (event.shiftKey && (key === "s" || key === "p" || key === "n" || key === "o" || key === "t" || key === "w"));
}

function shouldPreventBrowserShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || isApplicationShortcut(event)) {
    return false;
  }

  return isReloadShortcut(event)
    || isHistoryNavigationShortcut(event)
    || isTabOrWindowShortcut(event)
    || isBrowserUiShortcut(event)
    || isZoomShortcut(event)
    || isDevToolsShortcut(event)
    || isBrowserDocumentShortcut(event)
    || (normalizeKey(event) === "backspace" && !isEditableTarget(event.target));
}

export function useBrowserShortcutGuard(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldPreventBrowserShortcut(event)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);
}
