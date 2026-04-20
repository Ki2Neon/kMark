import { memo, type ChangeEvent } from "react";
import { type EditorMode } from "../../domain/editor";

type EditorToolbarProps = {
  readonly fileName: string;
  readonly isDirty: boolean;
  readonly mode: EditorMode;
  readonly statusLabel: string;
  readonly onFileNameChange: (fileName: string) => void;
  readonly onModeChange: (mode: EditorMode) => void;
  readonly onNewDocument: () => void;
  readonly onOpenDocument: () => void;
  readonly onSaveDocument: () => void;
};

const VIEW_MODES: ReadonlyArray<{ id: EditorMode; label: string }> = [
  { id: "split", label: "Split" },
  { id: "write", label: "Write" },
  { id: "preview", label: "Preview" },
];

function EditorToolbarComponent({
  fileName,
  isDirty,
  mode,
  statusLabel,
  onFileNameChange,
  onModeChange,
  onNewDocument,
  onOpenDocument,
  onSaveDocument,
}: EditorToolbarProps) {
  const handleFileNameInput = (event: ChangeEvent<HTMLInputElement>) => {
    onFileNameChange(event.currentTarget.value);
  };

  return (
    <header className="editor-shell__toolbar">
      <div className="editor-shell__brand">
        <span className="editor-shell__eyebrow">ultra-light markdown editor</span>
        <h1>kMark</h1>
        <p>
          軽く書いて、すぐ整う。ライブプレビューとローカル下書きだけに絞った、
          余計な重さのない Markdown エディターです。
        </p>
      </div>

      <div className="editor-shell__controls">
        <label className="editor-shell__filename">
          <span>ファイル名</span>
          <input
            type="text"
            value={fileName}
            onChange={handleFileNameInput}
            aria-label="保存するファイル名"
            placeholder="love-note.md"
          />
        </label>

        <div className="editor-shell__button-row">
          <button type="button" onClick={onNewDocument}>
            新規
          </button>
          <button type="button" onClick={onOpenDocument}>
            読み込み
          </button>
          <button type="button" className="editor-shell__button--primary" onClick={onSaveDocument}>
            書き出し
          </button>
        </div>

        <div className="editor-shell__segmented" role="tablist" aria-label="表示モード">
          {VIEW_MODES.map((viewMode) => (
            <button
              key={viewMode.id}
              type="button"
              role="tab"
              aria-selected={mode === viewMode.id}
              className={mode === viewMode.id ? "is-active" : undefined}
              onClick={() => onModeChange(viewMode.id)}
            >
              {viewMode.label}
            </button>
          ))}
        </div>

        <p className="editor-shell__status" data-dirty={isDirty}>
          {statusLabel}
        </p>
      </div>
    </header>
  );
}

export const EditorToolbar = memo(EditorToolbarComponent);