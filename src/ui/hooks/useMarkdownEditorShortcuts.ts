import { useEffect, useEffectEvent } from "react";

type UseMarkdownEditorShortcutsOptions = {
  readonly enabled?: boolean;
  readonly onDismissMenu: () => void;
  readonly onMenuToggle: () => void;
  readonly onNewDocument: () => void;
  readonly onOpenDocument: () => void;
  readonly onPrintDocument: () => void;
  readonly onSaveDocument: () => void;
};

export function useMarkdownEditorShortcuts({
  enabled = true,
  onDismissMenu,
  onMenuToggle,
  onNewDocument,
  onOpenDocument,
  onPrintDocument,
  onSaveDocument,
}: UseMarkdownEditorShortcutsOptions) {
  const saveDocumentEvent = useEffectEvent(() => {
    onSaveDocument();
  });

  const printDocumentEvent = useEffectEvent(() => {
    onPrintDocument();
  });

  const openDocumentEvent = useEffectEvent(() => {
    onOpenDocument();
  });

  const newDocumentEvent = useEffectEvent(() => {
    onNewDocument();
  });

  const menuToggleEvent = useEffectEvent(() => {
    onMenuToggle();
  });

  const dismissMenuEvent = useEffectEvent(() => {
    onDismissMenu();
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissMenuEvent();
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isPrimaryOnlyShortcut = !event.shiftKey;

      if (key === "s" && isPrimaryOnlyShortcut) {
        event.preventDefault();
        saveDocumentEvent();
        return;
      }

      if (key === "p" && isPrimaryOnlyShortcut) {
        event.preventDefault();
        printDocumentEvent();
        return;
      }

      if (key === "b" && event.shiftKey) {
        event.preventDefault();
        menuToggleEvent();
        return;
      }

      if (key === "o" && isPrimaryOnlyShortcut) {
        event.preventDefault();
        openDocumentEvent();
        return;
      }

      if (key === "n" && isPrimaryOnlyShortcut) {
        event.preventDefault();
        newDocumentEvent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissMenuEvent, enabled, menuToggleEvent, newDocumentEvent, openDocumentEvent, printDocumentEvent, saveDocumentEvent]);
}
