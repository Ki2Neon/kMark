import { memo, type ChangeEvent } from "react";
import { type EditorStats, type LayoutMode } from "../../domain/editor";

type MenuSectionProps = {
  readonly fileName: string;
  readonly isDirty: boolean;
  readonly layoutMode: LayoutMode;
  readonly stats: EditorStats;
  readonly statusLabel: string;
  readonly onClose?: () => void;
  readonly onFileNameChange: (fileName: string) => void;
  readonly onNewDocument: () => void;
  readonly onOpenDocument: () => void;
  readonly onSaveDocument: () => void;
};

function MenuSectionComponent({
  fileName,
  isDirty,
  layoutMode,
  stats,
  statusLabel,
  onClose,
  onFileNameChange,
  onNewDocument,
  onOpenDocument,
  onSaveDocument,
}: MenuSectionProps) {
  const handleFileNameInput = (event: ChangeEvent<HTMLInputElement>) => {
    onFileNameChange(event.currentTarget.value);
  };

  return (
    <section className="section section--menu menu-section" aria-labelledby="menu-section-title">
      <div className="section__head section__head--menu">
        <div>
          <span className="section__eyebrow">menu</span>
          <h2 id="menu-section-title" className="section__title">
            kMark
          </h2>
          <p className="section__note">
            {layoutMode === "desktop"
              ? "Ctrl / Cmd + Shift + B でサイドバーを開閉できます。"
              : "左右にスライドして Menu / Draft / Preview を切り替えます。"}
          </p>
        </div>

        {layoutMode === "desktop" && onClose !== undefined ? (
          <button type="button" className="menu-section__dismiss" onClick={onClose}>
            閉じる
          </button>
        ) : null}
      </div>

      <div className="menu-section__group">
        <label className="menu-section__label">
          <span>ファイル名</span>
          <input
            type="text"
            value={fileName}
            onChange={handleFileNameInput}
            aria-label="保存するファイル名"
            placeholder="love-note.md"
          />
        </label>
      </div>

      <div className="menu-section__group menu-section__actions">
        <button type="button" onClick={onNewDocument}>
          新規ドキュメント
        </button>
        <button type="button" onClick={onOpenDocument}>
          ファイルを読み込む
        </button>
        <button type="button" className="button--primary" onClick={onSaveDocument}>
          Markdown を書き出す
        </button>
      </div>

      <p className="menu-section__status" data-dirty={isDirty}>
        {statusLabel}
      </p>

      <div className="menu-section__group">
        <div className="menu-section__stats" aria-label="ドキュメント統計">
          <div className="menu-section__stat">
            <span>Words</span>
            <strong>{stats.words}</strong>
          </div>
          <div className="menu-section__stat">
            <span>Chars</span>
            <strong>{stats.characters}</strong>
          </div>
          <div className="menu-section__stat">
            <span>Lines</span>
            <strong>{stats.lines}</strong>
          </div>
          <div className="menu-section__stat">
            <span>Read</span>
            <strong>{stats.readingMinutes} min</strong>
          </div>
        </div>
      </div>

      <div className="menu-section__group">
        <p className="menu-section__hint">ショートカット</p>
        <ul className="menu-section__shortcuts">
          <li>保存: Ctrl / Cmd + S</li>
          <li>読み込み: Ctrl / Cmd + O</li>
          <li>新規: Ctrl / Cmd + N</li>
          <li>メニュー: Ctrl / Cmd + Shift + B</li>
        </ul>
      </div>
    </section>
  );
}

export const MenuSection = memo(MenuSectionComponent);