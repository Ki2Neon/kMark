import { memo, type ChangeEvent } from "react";
import { type LayoutMode } from "../../domain/editor";
import {
  APP_FONT_OPTIONS,
  DRAFT_FONT_OPTIONS,
  MAX_DRAFT_FONT_SIZE_PX,
  MIN_DRAFT_FONT_SIZE_PX,
  MULTI_CURSOR_MODIFIER_OPTIONS,
  STARTUP_DRAFT_MODE_OPTIONS,
  isMultiCursorModifier,
  isStartupDraftMode,
  type AppFontId,
  type DraftFontId,
  type DraftFontSizePx,
  type MultiCursorModifier,
  type StartupDraftMode,
} from "../../domain/editorPreferences";
import {
  PREVIEW_DISPLAY_MODE_OPTIONS,
  isPreviewDisplayMode,
  type PreviewDisplayMode,
} from "../../domain/preview";
import { APP_THEME_OPTIONS, isAppThemeId, type AppThemeId } from "../../domain/theme";

type MenuSectionProps = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly draftFontId: DraftFontId;
  readonly draftFontSizePx: DraftFontSizePx;
  readonly previewDisplayMode: PreviewDisplayMode;
  readonly previewUsesAppThemeColors: boolean;
  readonly isPreviewVisible: boolean;
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly startupDraftMode: StartupDraftMode;
  readonly onAppFontChange: (appFontId: AppFontId) => void;
  readonly onAppThemeChange: (appThemeId: AppThemeId) => void;
  readonly onDraftFontChange: (draftFontId: DraftFontId) => void;
  readonly onDraftFontSizeChange: (draftFontSizePx: DraftFontSizePx) => void;
  readonly onLayoutModeChange: (layoutMode: LayoutMode) => void;
  readonly onMultiCursorModifierChange: (multiCursorModifier: MultiCursorModifier) => void;
  readonly onNewDocument: () => void;
  readonly onOpenPreviewWindow: () => void;
  readonly onOpenDocument: () => void;
  readonly onOverwriteSaveDocument: () => void;
  readonly onPrintDocument: () => void;
  readonly onPreviewDisplayModeChange: (previewDisplayMode: PreviewDisplayMode) => void;
  readonly onPreviewUsesAppThemeColorsChange: (previewUsesAppThemeColors: boolean) => void;
  readonly onPreviewVisibilityChange: (isPreviewVisible: boolean) => void;
  readonly onSaveDocumentAs: () => void;
  readonly onShowLineNumbersChange: (showLineNumbers: boolean) => void;
  readonly onStartupDraftModeChange: (startupDraftMode: StartupDraftMode) => void;
};

const APP_FONT_DATALIST_ID = "menu-section-app-fonts";
const DRAFT_FONT_DATALIST_ID = "menu-section-draft-fonts";

function MenuSectionComponent({
  appFontId,
  appThemeId,
  draftFontId,
  draftFontSizePx,
  previewDisplayMode,
  previewUsesAppThemeColors,
  isPreviewVisible,
  layoutMode,
  multiCursorModifier,
  showLineNumbers,
  startupDraftMode,
  onAppFontChange,
  onAppThemeChange,
  onDraftFontChange,
  onDraftFontSizeChange,
  onLayoutModeChange,
  onMultiCursorModifierChange,
  onNewDocument,
  onOpenPreviewWindow,
  onOpenDocument,
  onOverwriteSaveDocument,
  onPrintDocument,
  onPreviewDisplayModeChange,
  onPreviewUsesAppThemeColorsChange,
  onPreviewVisibilityChange,
  onSaveDocumentAs,
  onShowLineNumbersChange,
  onStartupDraftModeChange,
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

  const handlePreviewDisplayModeSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextPreviewDisplayMode = event.currentTarget.value;

    if (!isPreviewDisplayMode(nextPreviewDisplayMode)) {
      return;
    }

    onPreviewDisplayModeChange(nextPreviewDisplayMode);
  };

  const handlePreviewUsesAppThemeColorsSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewUsesAppThemeColorsChange(event.currentTarget.checked);
  };

  const handleAppFontInput = (event: ChangeEvent<HTMLInputElement>) => {
    onAppFontChange(event.currentTarget.value);
  };

  const handleDraftFontInput = (event: ChangeEvent<HTMLInputElement>) => {
    onDraftFontChange(event.currentTarget.value);
  };

  const handleDraftFontSizeInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraftFontSizePx = Number.parseInt(event.currentTarget.value, 10);

    if (Number.isNaN(nextDraftFontSizePx)) {
      return;
    }

    onDraftFontSizeChange(nextDraftFontSizePx);
  };

  const handleShowLineNumbersSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onShowLineNumbersChange(event.currentTarget.checked);
  };

  const handleStartupDraftModeSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextStartupDraftMode = event.currentTarget.value;

    if (!isStartupDraftMode(nextStartupDraftMode)) {
      return;
    }

    onStartupDraftModeChange(nextStartupDraftMode);
  };

  return (
    <section className="section section--menu menu-section" aria-label="メニュー">
      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">ファイル</h2>
          <p className="menu-section__group-description">作成・保存・印刷まわり</p>
        </div>
        <div className="menu-section__actions" role="group" aria-label="ファイル操作">
          <button type="button" onClick={onOpenDocument}>
            開く
          </button>
          <button type="button" onClick={onOverwriteSaveDocument}>
            上書き保存
          </button>
          <button type="button" onClick={onSaveDocumentAs}>
            名前を付けて保存
          </button>
          <button type="button" onClick={onNewDocument}>
            新規作成
          </button>
          <button type="button" onClick={onPrintDocument}>
            印刷
          </button>
        </div>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">プレビュー</h2>
          <p className="menu-section__group-description">表示方法と配色の設定</p>
        </div>
        <label className="menu-section__mode-switch">
          <span className="menu-section__mode-switch-meta">
            <span className="menu-section__field-label">表示</span>
            <span className="menu-section__mode-switch-legend">非表示 / 表示</span>
          </span>
          <span className="menu-section__mode-switch-values">
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
          </span>
        </label>

        <label className="menu-section__label">
          <span className="menu-section__field-label">表示サイズ</span>
          <select
            value={previewDisplayMode}
            onChange={handlePreviewDisplayModeSelect}
            aria-label="プレビュー表示モード"
            className="menu-section__select"
          >
            {PREVIEW_DISPLAY_MODE_OPTIONS.map((previewDisplayModeOption) => (
              <option key={previewDisplayModeOption.id} value={previewDisplayModeOption.id}>
                {previewDisplayModeOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="menu-section__mode-switch">
          <span className="menu-section__mode-switch-meta">
            <span className="menu-section__field-label">配色</span>
            <span className="menu-section__mode-switch-legend">固定色 / アプリテーマ色</span>
          </span>
          <span className="menu-section__mode-switch-values">
            <span className={!previewUsesAppThemeColors ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
              固定色
            </span>
            <input
              type="checkbox"
              className="menu-section__switch-input"
              checked={previewUsesAppThemeColors}
              onChange={handlePreviewUsesAppThemeColorsSwitch}
              aria-label="プレビューでアプリテーマ色を使うか切り替え"
            />
            <span className="menu-section__switch" aria-hidden="true" />
            <span className={previewUsesAppThemeColors ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
              アプリテーマ色
            </span>
          </span>
        </label>

        <div className="menu-section__actions" role="group" aria-label="プレビュー操作">
          <button type="button" onClick={onOpenPreviewWindow}>
            別ウィンドウで表示
          </button>
        </div>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">ドラフト</h2>
          <p className="menu-section__group-description">起動時の内容と編集表示</p>
        </div>
        <label className="menu-section__mode-switch">
          <span className="menu-section__mode-switch-meta">
            <span className="menu-section__field-label">行番号</span>
            <span className="menu-section__mode-switch-legend">非表示 / 表示</span>
          </span>
          <span className="menu-section__mode-switch-values">
            <span className={!showLineNumbers ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
              非表示
            </span>
            <input
              type="checkbox"
              className="menu-section__switch-input"
              checked={showLineNumbers}
              onChange={handleShowLineNumbersSwitch}
              aria-label="行番号の表示を切り替え"
            />
            <span className="menu-section__switch" aria-hidden="true" />
            <span className={showLineNumbers ? "menu-section__mode-label is-active" : "menu-section__mode-label"}>
              表示
            </span>
          </span>
        </label>

        <label className="menu-section__label">
          <span className="menu-section__field-label">フォントサイズ</span>
          <input
            type="number"
            value={draftFontSizePx}
            min={MIN_DRAFT_FONT_SIZE_PX}
            max={MAX_DRAFT_FONT_SIZE_PX}
            step={1}
            onChange={handleDraftFontSizeInput}
            aria-label="ドラフトのフォントサイズ"
            className="menu-section__select"
          />
        </label>

        <label className="menu-section__label">
          <span className="menu-section__field-label">起動時の表示</span>
          <select
            value={startupDraftMode}
            onChange={handleStartupDraftModeSelect}
            aria-label="起動時にドラフトへ表示する内容"
            className="menu-section__select"
          >
            {STARTUP_DRAFT_MODE_OPTIONS.map((startupDraftModeOption) => (
              <option key={startupDraftModeOption.id} value={startupDraftModeOption.id}>
                {startupDraftModeOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">フォント</h2>
          <p className="menu-section__group-description">アプリ全体とドラフト本文</p>
        </div>
        <label className="menu-section__label">
          <span className="menu-section__field-label">ドラフト</span>
          <input
            type="text"
            value={draftFontId}
            onChange={handleDraftFontInput}
            aria-label="ドラフトフォント"
            className="menu-section__select"
            list={DRAFT_FONT_DATALIST_ID}
            placeholder='例: Iosevka Term, "Fira Code", monospace'
            spellCheck={false}
          />
          <datalist id={DRAFT_FONT_DATALIST_ID}>
            {DRAFT_FONT_OPTIONS.map((fontOption) => (
              <option key={fontOption.value} value={fontOption.value} label={fontOption.label} />
            ))}
          </datalist>
        </label>

        <label className="menu-section__label">
          <span className="menu-section__field-label">アプリ</span>
          <input
            type="text"
            value={appFontId}
            onChange={handleAppFontInput}
            aria-label="アプリフォント"
            className="menu-section__select"
            list={APP_FONT_DATALIST_ID}
            placeholder='例: Aptos, "Segoe UI", sans-serif'
            spellCheck={false}
          />
          <datalist id={APP_FONT_DATALIST_ID}>
            {APP_FONT_OPTIONS.map((fontOption) => (
              <option key={fontOption.value} value={fontOption.value} label={fontOption.label} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">アプリテーマ</h2>
          <p className="menu-section__group-description">ウィンドウ全体の配色</p>
        </div>
        <label className="menu-section__label">
          <span className="menu-section__field-label">配色テーマ</span>
          <select value={appThemeId} onChange={handleAppThemeSelect} aria-label="アプリ表示テーマ" className="menu-section__select">
            {APP_THEME_OPTIONS.map((themeOption) => (
              <option key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">表示モード</h2>
          <p className="menu-section__group-description">PC と Mobile のレイアウト切替</p>
        </div>
        <label className="menu-section__mode-switch">
          <span className="menu-section__mode-switch-meta">
            <span className="menu-section__field-label">レイアウト</span>
            <span className="menu-section__mode-switch-legend">PC / Mobile</span>
          </span>
          <span className="menu-section__mode-switch-values">
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
          </span>
        </label>
      </div>

      <div className="menu-section__group">
        <div className="menu-section__group-header">
          <h2 className="menu-section__group-title">マルチカーソル</h2>
          <p className="menu-section__group-description">追加カーソルのクリック修飾キー</p>
        </div>
        <label className="menu-section__label">
          <span className="menu-section__field-label">追加カーソル</span>
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
    </section>
  );
}

export const MenuSection = memo(MenuSectionComponent);