import { useEffect, useEffectEvent } from "react";

type UseMarkdownEditorShortcutsOptions = {
  readonly onDismissMenu: () => void;
  readonly onMenuToggle: () => void;
  readonly onNewDocument: () => void;
  readonly onOpenDocument: () => void;
  readonly onPrintDocument: () => void;
  readonly onSaveDocument: () => void;
};

export function useMarkdownEditorShortcuts({
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissMenuEvent();
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        saveDocumentEvent();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        printDocumentEvent();
        return;
      }

      if (key === "b" && event.shiftKey) {
        event.preventDefault();
        menuToggleEvent();
        return;
      }

      if (key === "o") {
        event.preventDefault();
        openDocumentEvent();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        newDocumentEvent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissMenuEvent, menuToggleEvent, newDocumentEvent, openDocumentEvent, printDocumentEvent, saveDocumentEvent]);
}
