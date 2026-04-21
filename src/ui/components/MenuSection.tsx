import { memo, type ChangeEvent } from "react";
import { type LayoutMode } from "../../domain/editor";
import {
  MULTI_CURSOR_MODIFIER_OPTIONS,
  isMultiCursorModifier,
  type MultiCursorModifier,
} from "../../domain/editorPreferences";
import { APP_THEME_OPTIONS, isAppThemeId, type AppThemeId } from "../../domain/theme";

type MenuSectionProps = {
  readonly appThemeId: AppThemeId;
  readonly isPreviewVisible: boolean;
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly onAppThemeChange: (appThemeId: AppThemeId) => void;
  readonly onLayoutModeChange: (layoutMode: LayoutMode) => void;
  readonly onMultiCursorModifierChange: (multiCursorModifier: MultiCursorModifier) => void;
  readonly onNewDocument: () => void;
  readonly onOpenPreviewWindow: () => void;
  readonly onOpenDocument: () => void;
  readonly onOverwriteSaveDocument: () => void;
  readonly onPrintDocument: () => void;
  readonly onPreviewVisibilityChange: (isPreviewVisible: boolean) => void;
  readonly onSaveDocumentAs: () => void;
};

function MenuSectionComponent({
  appThemeId,
  isPreviewVisible,
  layoutMode,
  multiCursorModifier,
  onAppThemeChange,
  onLayoutModeChange,
  onMultiCursorModifierChange,
  onNewDocument,
  onOpenPreviewWindow,
  onOpenDocument,
  onOverwriteSaveDocument,
  onPrintDocument,
  onPreviewVisibilityChange,
  onSaveDocumentAs,
}: MenuSectionProps) {
  const handleAppThemeSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextThemeId = event.currentTarget.value;

    if (!isAppThemeId(nextThemeId)) {
      return;
    }

    onAppThemeChange(nextThemeId);
  };

  const handleLayoutModeSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onLayoutModeChange(event.currentTarget.checked ? "mobile" : "desktop");
  };

  const handleMultiCursorModifierSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextModifier = event.currentTarget.value;

    if (!isMultiCursorModifier(nextModifier)) {
      return;
    }

    onMultiCursorModifierChange(nextModifier);
  };

  const handlePreviewVisibilitySwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewVisibilityChange(event.currentTarget.checked);
  };

  return (
    <section className="section section--menu menu-section" aria-label="メニュー">
      <div className="menu-section__group">
        <h2 className="menu-section__group-title">ファイル</h2>
        <div className="menu-section__actions" role="group" aria-label="ファイル操作">
          <button type="button" onClick={onNewDocument}>
            新規作成
          </button>
          <button type="button" onClick={onOpenDocument}>
            開く
          </button>
          <button type="button" onClick={onOverwriteSaveDocument}>
            上書き保存
          </button>
          <button type="button" onClick={onSaveDocumentAs}>
            名前を付けて保存
          </button>
          <button type="button" onClick={onPrintDocument}>
            印刷
          </button>
        </div>
      </div>

      <div className="menu-section__group">
        <h2 className="menu-section__group-title">表示モード</h2>
        <label className="menu-section__mode-switch">
          <span className={layoutMode === "desktop" ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
            PC
          </span>
          <input
            type="checkbox"
            className="menu-section__switch-input"
            checked={layoutMode === "mobile"}
            onChange={handleLayoutModeSwitch}
            aria-label="PC モードとモバイルモードを切り替え"
          />
          <span className="menu-section__switch" aria-hidden="true" />
          <span className={layoutMode === "mobile" ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
            Mobile
          </span>
        </label>
      </div>

      <div className="menu-section__group">
        <h2 className="menu-section__group-title">プレビュー</h2>
        <label className="menu-section__mode-switch">
          <span className={!isPreviewVisible ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
            非表示
          </span>
          <input
            type="checkbox"
            className="menu-section__switch-input"
            checked={isPreviewVisible}
            onChange={handlePreviewVisibilitySwitch}
            aria-label="プレビューの表示を切り替え"
          />
          <span className="menu-section__switch" aria-hidden="true" />
          <span className={isPreviewVisible ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
            表示
          </span>
        </label>

        <div className="menu-section__actions" role="group" aria-label="プレビュー操作">
          <button type="button" onClick={onOpenPreviewWindow}>
            別ウィンドウで表示
          </button>
        </div>
      </div>

      <div className="menu-section__group">
        <h2 className="menu-section__group-title">エディタ</h2>
        <label className="menu-section__label">
          <select
            value={multiCursorModifier}
            onChange={handleMultiCursorModifierSelect}
            aria-label="マルチカーソルのクリック修飾キー"
            className="menu-section__select"
          >
            {MULTI_CURSOR_MODIFIER_OPTIONS.map((modifierOption) => (
              <option key={modifierOption.id} value={modifierOption.id}>
                {modifierOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="menu-section__group">
        <h2 className="menu-section__group-title">アプリテーマ</h2>
        <label className="menu-section__label">
          <select value={appThemeId} onChange={handleAppThemeSelect} aria-label="アプリ表示テーマ" className="menu-section__select">
            {APP_THEME_OPTIONS.map((themeOption) => (
              <option key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export const MenuSection = memo(MenuSectionComponent);