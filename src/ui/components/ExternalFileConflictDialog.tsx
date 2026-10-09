import { useEffect, useRef } from "react";

type ExternalFileConflictDialogProps = {
  readonly fileName: string;
  readonly isBusy: boolean;
  readonly onDiscard: () => void;
  readonly onOverwrite: () => void;
  readonly onCancel: () => void;
  readonly errorMessage: string | null;
};

export function ExternalFileConflictDialog({
  fileName,
  isBusy,
  onDiscard,
  onOverwrite,
  onCancel,
  errorMessage,
}: ExternalFileConflictDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const isBusyRef = useRef(isBusy);
  const displayName = fileName.trim().length > 0 ? fileName.trim() : "現在のファイル";

  onCancelRef.current = onCancel;
  isBusyRef.current = isBusy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!isBusyRef.current) {
          onCancelRef.current();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      event.preventDefault();
      event.stopPropagation();
      if (buttons.length === 0) {
        dialogRef.current?.focus();
        return;
      }
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? buttons.length - 1 : current - 1)
        : (current < 0 || current === buttons.length - 1 ? 0 : current + 1);
      buttons[next]?.focus();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (isBusy) {
      dialogRef.current?.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      cancelButtonRef.current?.focus();
    }
  }, [isBusy]);

  return (
    <div className="external-file-conflict-dialog__overlay">
      <section
        ref={dialogRef}
        className="external-file-conflict-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="external-file-conflict-dialog-title"
        aria-describedby="external-file-conflict-dialog-file external-file-conflict-dialog-description"
        aria-busy={isBusy}
        tabIndex={-1}
      >
        <div className="external-file-conflict-dialog__body">
          <h2 id="external-file-conflict-dialog-title">ファイルが外部で変更された</h2>
          <div className="external-file-conflict-dialog__file" id="external-file-conflict-dialog-file">
            <span className="external-file-conflict-dialog__file-label">対象ファイル</span>
            <strong>{displayName}</strong>
          </div>
          <p id="external-file-conflict-dialog-description">現在の編集は未保存。残す内容を選択。</p>
          {errorMessage ? <p className="external-file-conflict-dialog__error" role="alert">{errorMessage}</p> : null}
        </div>
        <div className="external-file-conflict-dialog__actions">
          <button type="button" className="external-file-conflict-dialog__discard" onClick={onDiscard} disabled={isBusy}>
            <span className="external-file-conflict-dialog__action-title">外部の内容を読み込む</span>
            <span className="external-file-conflict-dialog__action-detail">未保存の編集を破棄</span>
          </button>
          <button type="button" className="external-file-conflict-dialog__overwrite" onClick={onOverwrite} disabled={isBusy}>
            <span className="external-file-conflict-dialog__action-title">現在の編集を保存</span>
            <span className="external-file-conflict-dialog__action-detail">外部の変更内容を上書き</span>
          </button>
        </div>
        <button
          ref={cancelButtonRef}
          type="button"
          className="external-file-conflict-dialog__cancel"
          onClick={onCancel}
          disabled={isBusy}
        >
          キャンセル
        </button>
      </section>
    </div>
  );
}
