import { useEffect, useRef, type KeyboardEvent } from "react";

type UnsavedExitDialogProps = {
  readonly fileName: string;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
};

export function UnsavedExitDialog({
  fileName,
  isSaving,
  onCancel,
  onDiscard,
  onSave,
}: UnsavedExitDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const normalizedFileName = fileName.trim().length > 0 ? fileName.trim() : "untitled.md";

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isSaving) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (key === "s") {
      event.preventDefault();
      onSave();
      return;
    }

    if (key === "n") {
      event.preventDefault();
      onDiscard();
    }
  };

  return (
    <div className="unsaved-exit-dialog__overlay" onKeyDown={handleKeyDown}>
      <section
        className="unsaved-exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-exit-dialog-title"
        aria-describedby="unsaved-exit-dialog-description"
      >
        <div className="unsaved-exit-dialog__body">
          <h2 id="unsaved-exit-dialog-title">未保存の変更</h2>
          <p id="unsaved-exit-dialog-description">
            {normalizedFileName} に未保存の変更があります。
          </p>
        </div>
        <div className="unsaved-exit-dialog__actions">
          <button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "保存中" : "保存(S)"}
          </button>
          <button type="button" onClick={onDiscard} disabled={isSaving}>
            保存しない(N)
          </button>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            キャンセル
          </button>
        </div>
      </section>
    </div>
  );
}
