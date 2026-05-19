import { memo, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { type LayoutMode } from "../../domain/editor";
import {
  APP_FONT_OPTIONS,
  EDIT_FONT_OPTIONS,
  MAX_EDIT_FONT_SIZE_PX,
  MAX_SYSTEM_FONT_SIZE_PX,
  MIN_EDIT_FONT_SIZE_PX,
  MIN_SYSTEM_FONT_SIZE_PX,
  MULTI_CURSOR_MODIFIER_OPTIONS,
  STARTUP_EDIT_MODE_OPTIONS,
  isMultiCursorModifier,
  isStartupEditMode,
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type MultiCursorModifier,
  type StartupEditMode,
  type SystemFontSizePx,
} from "../../domain/editorPreferences";
import {
  type PreviewDisplayMode,
} from "../../domain/preview";
import { type RecentFile } from "../../domain/recentFiles";
import { APP_THEME_OPTIONS, isAppThemeId, type AppThemeId } from "../../domain/theme";
import {
  MAX_SUB_WINDOW_PAGE_TRANSITION_FADE_MS,
  MIN_SUB_WINDOW_PAGE_TRANSITION_FADE_MS,
} from "../../application/subWindow/subWindowPorts";

type MenuSectionProps = {
  readonly appFontId: AppFontId;
  readonly appThemeId: AppThemeId;
  readonly canControlWindowsStartupTrayResident: boolean;
  readonly editFontId: EditFontId;
  readonly editFontSizePx: EditFontSizePx;
  readonly systemFontSizePx: SystemFontSizePx;
  readonly previewDisplayMode: PreviewDisplayMode;
  readonly previewUsesAppThemeColors: boolean;
  readonly recentFiles: readonly RecentFile[];
  readonly isPreviewVisible: boolean;
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly startupEditMode: StartupEditMode;
  readonly subWindowPageTransitionFadeMs: number;
  readonly windowsStartupTrayResidentEnabled: boolean;
  readonly onAppFontChange: (appFontId: AppFontId) => void;
  readonly onAppThemeChange: (appThemeId: AppThemeId) => void;
  readonly onEditFontChange: (editFontId: EditFontId) => void;
  readonly onEditFontSizeChange: (editFontSizePx: EditFontSizePx) => void;
  readonly onSystemFontSizeChange: (systemFontSizePx: SystemFontSizePx) => void;
  readonly onLayoutModeChange: (layoutMode: LayoutMode) => void;
  readonly onMultiCursorModifierChange: (multiCursorModifier: MultiCursorModifier) => void;
  readonly onNewDocument: () => void;
  readonly onOpenCurrentDocumentFolder: () => void;
  readonly onOpenDocument: () => void;
  readonly onOpenRecentFile: (recentFile: RecentFile) => void;
  readonly onOpenSubWindow: () => void;
  readonly onOverwriteSaveDocument: () => void;
  readonly onPrintDocument: () => void;
  readonly onPreviewDisplayModeChange: (previewDisplayMode: PreviewDisplayMode) => void;
  readonly onPreviewUsesAppThemeColorsChange: (previewUsesAppThemeColors: boolean) => void;
  readonly onPreviewVisibilityChange: (isPreviewVisible: boolean) => void;
  readonly onSaveDocumentAs: () => void;
  readonly onShowLineNumbersChange: (showLineNumbers: boolean) => void;
  readonly onStartupEditModeChange: (startupEditMode: StartupEditMode) => void;
  readonly onSubWindowPageTransitionFadeMsChange: (pageTransitionFadeMs: number) => void;
  readonly onWindowsStartupTrayResidentChange: (windowsStartupTrayResidentEnabled: boolean) => void;
};

const APP_FONT_DATALIST_ID = "menu-section-app-fonts";
const EDIT_FONT_DATALIST_ID = "menu-section-edit-fonts";

type NumberDraftField = "edit-font-size" | "subwindow-page-transition-fade" | "system-font-size";
type MenuPanel = "root" | "recent-files";

function normalizeMenuSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("ja-JP");
}

function parseIntegerDraft(value: string): number | null {
  const trimmedValue = value.trim();

  if (!/^\d+$/u.test(trimmedValue)) {
    return null;
  }

  return Number.parseInt(trimmedValue, 10);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function MenuSectionComponent({
  appFontId,
  appThemeId,
  canControlWindowsStartupTrayResident,
  editFontId,
  editFontSizePx,
  systemFontSizePx,
  previewDisplayMode,
  previewUsesAppThemeColors,
  recentFiles,
  isPreviewVisible,
  layoutMode,
  multiCursorModifier,
  showLineNumbers,
  startupEditMode,
  subWindowPageTransitionFadeMs,
  windowsStartupTrayResidentEnabled,
  onAppFontChange,
  onAppThemeChange,
  onEditFontChange,
  onEditFontSizeChange,
  onSystemFontSizeChange,
  onLayoutModeChange,
  onMultiCursorModifierChange,
  onNewDocument,
  onOpenCurrentDocumentFolder,
  onOpenDocument,
  onOpenRecentFile,
  onOpenSubWindow,
  onOverwriteSaveDocument,
  onPrintDocument,
  onPreviewDisplayModeChange,
  onPreviewUsesAppThemeColorsChange,
  onPreviewVisibilityChange,
  onSaveDocumentAs,
  onShowLineNumbersChange,
  onStartupEditModeChange,
  onSubWindowPageTransitionFadeMsChange,
  onWindowsStartupTrayResidentChange,
}: MenuSectionProps) {
  const [menuPanel, setMenuPanel] = useState<MenuPanel>("root");
  const [menuSearchText, setMenuSearchText] = useState("");
  const [appFontDraft, setAppFontDraft] = useState(appFontId);
  const [editFontDraft, setEditFontDraft] = useState(editFontId);
  const [editFontSizeDraft, setEditFontSizeDraft] = useState(() => String(editFontSizePx));
  const [subWindowPageTransitionFadeDraft, setSubWindowPageTransitionFadeDraft] = useState(() => String(subWindowPageTransitionFadeMs));
  const [systemFontSizeDraft, setSystemFontSizeDraft] = useState(() => String(systemFontSizePx));
  const [focusedFontField, setFocusedFontField] = useState<"app" | "edit" | null>(null);
  const [focusedNumberField, setFocusedNumberField] = useState<NumberDraftField | null>(null);
  const discardNextFontBlurRef = useRef(false);
  const discardNextNumberBlurRef = useRef(false);
  const normalizedMenuSearchText = normalizeMenuSearchValue(menuSearchText);
  const matchesMenuSearch = (...values: string[]) => {
    if (normalizedMenuSearchText.length === 0) {
      return true;
    }

    return values.some((value) => normalizeMenuSearchValue(value).includes(normalizedMenuSearchText));
  };

  const fileGroupVisible = matchesMenuSearch(
    "ファイル",
    "作成",
    "保存",
    "印刷",
    "開く",
    "最近開いたファイル",
    "recent files",
    ".md",
    "フォルダー",
    "Explorer",
    "上書き保存",
    "名前を付けて保存",
    "新規作成",
  );
  const previewGroupMatched = matchesMenuSearch(
    "プレビュー",
    "表示形式",
    "表示方法",
    "用紙",
    "paper",
    "配色",
    "preview",
    "サブウィンドウ",
    "subwindow",
    "フェード",
    "fade",
    "transition",
  );
  const previewVisibilityVisible = previewGroupMatched || matchesMenuSearch("表示", "非表示", "visible");
  const previewDisplayModeVisible =
    previewGroupMatched || matchesMenuSearch("表示形式", "用紙", "paper", "display format", "display mode");
  const previewColorVisible = previewGroupMatched || matchesMenuSearch("配色", "固定色", "アプリテーマ色", "color");
  const subWindowPageTransitionFadeVisible =
    previewGroupMatched || matchesMenuSearch("サブウィンドウ", "フェード", "fade", "transition", "ms");
  const previewGroupVisible =
    previewVisibilityVisible || previewDisplayModeVisible || previewColorVisible || subWindowPageTransitionFadeVisible;
  const editGroupMatched = matchesMenuSearch("Edit", "編集", "起動時", "編集表示");
  const showLineNumbersVisible = editGroupMatched || matchesMenuSearch("行番号", "line number");
  const editFontSizeVisible = editGroupMatched || matchesMenuSearch("エディタフォントサイズ", "font size", "editor");
  const startupEditModeVisible = editGroupMatched || matchesMenuSearch("起動時の表示", "startup");
  const windowsStartupTrayResidentVisible =
    canControlWindowsStartupTrayResident &&
    (editGroupMatched || matchesMenuSearch("Windows 起動時の常駐", "タスクトレイ", "autostart"));
  const editGroupVisible =
    showLineNumbersVisible || editFontSizeVisible || startupEditModeVisible || windowsStartupTrayResidentVisible;
  const fontGroupMatched = matchesMenuSearch("フォント", "font", "family");
  const editFontVisible = fontGroupMatched || matchesMenuSearch("Edit フォント", "edit font");
  const appFontVisible = fontGroupMatched || matchesMenuSearch("アプリフォント", "app font");
  const systemFontSizeVisible = fontGroupMatched || matchesMenuSearch("システムフォントサイズ", "system font size");
  const fontGroupVisible = editFontVisible || appFontVisible || systemFontSizeVisible;
  const appThemeGroupVisible = matchesMenuSearch("アプリテーマ", "配色テーマ", "theme");
  const layoutModeGroupVisible = matchesMenuSearch("表示モード", "レイアウト", "PC", "Mobile", "layout");
  const multiCursorGroupVisible = matchesMenuSearch("マルチカーソル", "追加カーソル", "modifier");
  const hasVisibleMenuItems =
    fileGroupVisible ||
    previewGroupVisible ||
    editGroupVisible ||
    fontGroupVisible ||
    appThemeGroupVisible ||
    layoutModeGroupVisible ||
    multiCursorGroupVisible;

  useEffect(() => {
    if (focusedFontField !== "app") {
      setAppFontDraft(appFontId);
    }
  }, [appFontId, focusedFontField]);

  useEffect(() => {
    if (focusedFontField !== "edit") {
      setEditFontDraft(editFontId);
    }
  }, [editFontId, focusedFontField]);

  useEffect(() => {
    if (focusedNumberField !== "edit-font-size") {
      setEditFontSizeDraft(String(editFontSizePx));
    }
  }, [editFontSizePx, focusedNumberField]);

  useEffect(() => {
    if (focusedNumberField !== "subwindow-page-transition-fade") {
      setSubWindowPageTransitionFadeDraft(String(subWindowPageTransitionFadeMs));
    }
  }, [focusedNumberField, subWindowPageTransitionFadeMs]);

  useEffect(() => {
    if (focusedNumberField !== "system-font-size") {
      setSystemFontSizeDraft(String(systemFontSizePx));
    }
  }, [focusedNumberField, systemFontSizePx]);

  useEffect(() => {
    if (menuPanel !== "recent-files") {
      return;
    }

    const handleRecentFilesEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      setMenuPanel("root");
    };

    window.addEventListener("keydown", handleRecentFilesEscape, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleRecentFilesEscape, { capture: true });
    };
  }, [menuPanel]);

  const handleMenuSearchInput = (event: ChangeEvent<HTMLInputElement>) => {
    setMenuSearchText(event.currentTarget.value);
  };

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

  const handlePreviewDisplayModeSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewDisplayModeChange(event.currentTarget.checked ? "a4" : "standard");
  };

  const handlePreviewUsesAppThemeColorsSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewUsesAppThemeColorsChange(event.currentTarget.checked);
  };

  const handleAppFontInput = (event: ChangeEvent<HTMLInputElement>) => {
    setAppFontDraft(event.currentTarget.value);
  };

  const handleEditFontInput = (event: ChangeEvent<HTMLInputElement>) => {
    setEditFontDraft(event.currentTarget.value);
  };

  const commitAppFontDraft = () => {
    onAppFontChange(appFontDraft);
  };

  const commitEditFontDraft = () => {
    onEditFontChange(editFontDraft);
  };

  const handleAppFontFocus = () => {
    setFocusedFontField("app");
  };

  const handleEditFontFocus = () => {
    setFocusedFontField("edit");
  };

  const handleAppFontBlur = () => {
    setFocusedFontField(null);
    if (discardNextFontBlurRef.current) {
      discardNextFontBlurRef.current = false;
      return;
    }
    commitAppFontDraft();
  };

  const handleEditFontBlur = () => {
    setFocusedFontField(null);
    if (discardNextFontBlurRef.current) {
      discardNextFontBlurRef.current = false;
      return;
    }
    commitEditFontDraft();
  };

  const handleAppFontKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      discardNextFontBlurRef.current = true;
      setAppFontDraft(appFontId);
      event.currentTarget.blur();
    }
  };

  const handleEditFontKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      discardNextFontBlurRef.current = true;
      setEditFontDraft(editFontId);
      event.currentTarget.blur();
    }
  };

  const handleEditFontSizeInput = (event: ChangeEvent<HTMLInputElement>) => {
    setEditFontSizeDraft(event.currentTarget.value);
  };

  const commitEditFontSizeDraft = () => {
    const parsedEditFontSizePx = parseIntegerDraft(editFontSizeDraft);

    if (parsedEditFontSizePx === null) {
      setEditFontSizeDraft(String(editFontSizePx));
      return;
    }

    const nextEditFontSizePx = clampInteger(parsedEditFontSizePx, MIN_EDIT_FONT_SIZE_PX, MAX_EDIT_FONT_SIZE_PX);
    setEditFontSizeDraft(String(nextEditFontSizePx));
    onEditFontSizeChange(nextEditFontSizePx);
  };

  const handleSystemFontSizeInput = (event: ChangeEvent<HTMLInputElement>) => {
    setSystemFontSizeDraft(event.currentTarget.value);
  };

  const handleSubWindowPageTransitionFadeInput = (event: ChangeEvent<HTMLInputElement>) => {
    setSubWindowPageTransitionFadeDraft(event.currentTarget.value);
  };

  const commitSystemFontSizeDraft = () => {
    const parsedSystemFontSizePx = parseIntegerDraft(systemFontSizeDraft);

    if (parsedSystemFontSizePx === null) {
      setSystemFontSizeDraft(String(systemFontSizePx));
      return;
    }

    const nextSystemFontSizePx = clampInteger(parsedSystemFontSizePx, MIN_SYSTEM_FONT_SIZE_PX, MAX_SYSTEM_FONT_SIZE_PX);
    setSystemFontSizeDraft(String(nextSystemFontSizePx));
    onSystemFontSizeChange(nextSystemFontSizePx);
  };

  const commitSubWindowPageTransitionFadeDraft = () => {
    const parsedFadeMs = parseIntegerDraft(subWindowPageTransitionFadeDraft);

    if (parsedFadeMs === null) {
      setSubWindowPageTransitionFadeDraft(String(subWindowPageTransitionFadeMs));
      return;
    }

    const nextFadeMs = clampInteger(
      parsedFadeMs,
      MIN_SUB_WINDOW_PAGE_TRANSITION_FADE_MS,
      MAX_SUB_WINDOW_PAGE_TRANSITION_FADE_MS,
    );
    setSubWindowPageTransitionFadeDraft(String(nextFadeMs));
    onSubWindowPageTransitionFadeMsChange(nextFadeMs);
  };

  const handleEditFontSizeFocus = () => {
    setFocusedNumberField("edit-font-size");
  };

  const handleSubWindowPageTransitionFadeFocus = () => {
    setFocusedNumberField("subwindow-page-transition-fade");
  };

  const handleSystemFontSizeFocus = () => {
    setFocusedNumberField("system-font-size");
  };

  const handleEditFontSizeBlur = () => {
    setFocusedNumberField(null);
    if (discardNextNumberBlurRef.current) {
      discardNextNumberBlurRef.current = false;
      return;
    }
    commitEditFontSizeDraft();
  };

  const handleSubWindowPageTransitionFadeBlur = () => {
    setFocusedNumberField(null);
    if (discardNextNumberBlurRef.current) {
      discardNextNumberBlurRef.current = false;
      return;
    }
    commitSubWindowPageTransitionFadeDraft();
  };

  const handleSystemFontSizeBlur = () => {
    setFocusedNumberField(null);
    if (discardNextNumberBlurRef.current) {
      discardNextNumberBlurRef.current = false;
      return;
    }
    commitSystemFontSizeDraft();
  };

  const handleEditFontSizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      discardNextNumberBlurRef.current = true;
      setEditFontSizeDraft(String(editFontSizePx));
      event.currentTarget.blur();
    }
  };

  const handleSubWindowPageTransitionFadeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      discardNextNumberBlurRef.current = true;
      setSubWindowPageTransitionFadeDraft(String(subWindowPageTransitionFadeMs));
      event.currentTarget.blur();
    }
  };

  const handleSystemFontSizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      discardNextNumberBlurRef.current = true;
      setSystemFontSizeDraft(String(systemFontSizePx));
      event.currentTarget.blur();
    }
  };

  const handleShowLineNumbersSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onShowLineNumbersChange(event.currentTarget.checked);
  };

  const handleStartupEditModeSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextStartupEditMode = event.currentTarget.value;

    if (!isStartupEditMode(nextStartupEditMode)) {
      return;
    }

    onStartupEditModeChange(nextStartupEditMode);
  };

  const handleWindowsStartupTrayResidentSwitch = (event: ChangeEvent<HTMLInputElement>) => {
    onWindowsStartupTrayResidentChange(event.currentTarget.checked);
  };

  const handleRecentFilesOpen = () => {
    setMenuPanel("recent-files");
  };

  const handleRootPanelReturn = () => {
    setMenuPanel("root");
  };

  if (menuPanel === "recent-files") {
    return (
      <section className="section section--menu menu-section" aria-label="最近開いたファイル">
        <div className="menu-section__stack-header">
          <button type="button" className="menu-section__back-button" onClick={handleRootPanelReturn}>
            戻る
          </button>
          <div className="menu-section__stack-title-block">
            <h2 className="menu-section__stack-title">最近開いたファイル</h2>
          </div>
        </div>

        {recentFiles.length === 0 ? (
          <p className="menu-section__empty">履歴なし</p>
        ) : (
          <ul className="menu-section__recent-list" aria-label="最近開いたファイル一覧">
            {recentFiles.map((recentFile) => (
              <li key={recentFile.filePath}>
                <button
                  type="button"
                  className="menu-section__recent-item"
                  title={recentFile.filePath}
                  onClick={() => onOpenRecentFile(recentFile)}
                >
                  <span className="menu-section__recent-file-name">{recentFile.fileName}</span>
                  <span className="menu-section__recent-file-path">{recentFile.filePath}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="section section--menu menu-section" aria-label="メニュー">
      <div className="menu-section__search" role="search">
        <input
          type="search"
          value={menuSearchText}
          onChange={handleMenuSearchInput}
          className="menu-section__search-input"
          aria-label="メニュー項目を検索"
          placeholder="設定を検索"
        />
      </div>

      {fileGroupVisible ? (
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
            <button type="button" className="menu-section__action-spaced" onClick={handleRecentFilesOpen}>
              最近開いたファイル
            </button>
            <button
              type="button"
              className="menu-section__action-spaced"
              onClick={onOpenCurrentDocumentFolder}
            >
              .mdのフォルダーを開く
            </button>
          </div>
        </div>
      ) : null}

      {previewGroupVisible ? (
        <div className="menu-section__group">
          <div className="menu-section__group-header">
            <h2 className="menu-section__group-title">プレビュー</h2>
            <p className="menu-section__group-description">表示形式と配色の設定</p>
          </div>
          <div className="menu-section__actions" role="group" aria-label="プレビュー操作">
            <button type="button" onClick={onOpenSubWindow}>
              サブウィンドウを開く
            </button>
          </div>

          {subWindowPageTransitionFadeVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">サブウィンドウ fade ms</span>
              <input
                type="number"
                value={subWindowPageTransitionFadeDraft}
                min={MIN_SUB_WINDOW_PAGE_TRANSITION_FADE_MS}
                max={MAX_SUB_WINDOW_PAGE_TRANSITION_FADE_MS}
                step={1}
                inputMode="numeric"
                onChange={handleSubWindowPageTransitionFadeInput}
                onBlur={handleSubWindowPageTransitionFadeBlur}
                onFocus={handleSubWindowPageTransitionFadeFocus}
                onKeyDown={handleSubWindowPageTransitionFadeKeyDown}
                aria-label="サブウィンドウのページ遷移フェード時間 ms"
                className="menu-section__select"
              />
            </label>
          ) : null}

          {previewVisibilityVisible ? (
            <label className="menu-section__mode-switch">
              <span className="menu-section__mode-switch-meta">
                <span className="menu-section__field-label">表示</span>
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
          ) : null}

          {previewDisplayModeVisible ? (
            <label className="menu-section__mode-switch">
              <span className="menu-section__mode-switch-meta">
                <span className="menu-section__field-label">表示形式</span>
              </span>
              <span className="menu-section__mode-switch-values">
                <span
                  className={
                    previewDisplayMode === "standard" ? "menu-section__mode-label is-active" : "menu-section__mode-label"
                  }
                >
                  通常
                </span>
                <input
                  type="checkbox"
                  className="menu-section__switch-input"
                  checked={previewDisplayMode === "a4"}
                  onChange={handlePreviewDisplayModeSwitch}
                  aria-label="プレビュー表示形式を切り替え"
                />
                <span className="menu-section__switch" aria-hidden="true" />
                <span
                  className={
                    previewDisplayMode === "a4" ? "menu-section__mode-label is-active" : "menu-section__mode-label"
                  }
                >
                  用紙
                </span>
              </span>
            </label>
          ) : null}

          {previewColorVisible ? (
            <label className="menu-section__mode-switch">
              <span className="menu-section__mode-switch-meta">
                <span className="menu-section__field-label">配色</span>
              </span>
              <span className="menu-section__mode-switch-values">
                <span
                  className={
                    !previewUsesAppThemeColors ? "menu-section__mode-label is-active" : "menu-section__mode-label"
                  }
                >
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
                <span
                  className={
                    previewUsesAppThemeColors ? "menu-section__mode-label is-active" : "menu-section__mode-label"
                  }
                >
                  アプリテーマ色
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      {editGroupVisible ? (
        <div className="menu-section__group">
          <div className="menu-section__group-header">
            <h2 className="menu-section__group-title">Edit</h2>
            <p className="menu-section__group-description">起動時の内容と編集表示</p>
          </div>
          {showLineNumbersVisible ? (
            <label className="menu-section__mode-switch">
              <span className="menu-section__mode-switch-meta">
                <span className="menu-section__field-label">行番号</span>
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
          ) : null}

          {editFontSizeVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">エディタフォントサイズ</span>
              <input
                type="text"
                value={editFontSizeDraft}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={handleEditFontSizeInput}
                onBlur={handleEditFontSizeBlur}
                onFocus={handleEditFontSizeFocus}
                onKeyDown={handleEditFontSizeKeyDown}
                aria-label="Edit のフォントサイズ"
                className="menu-section__select"
              />
            </label>
          ) : null}

          {startupEditModeVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">起動時の表示</span>
              <select
                value={startupEditMode}
                onChange={handleStartupEditModeSelect}
                aria-label="起動時に Edit へ表示する内容"
                className="menu-section__select"
              >
                {STARTUP_EDIT_MODE_OPTIONS.map((startupEditModeOption) => (
                  <option key={startupEditModeOption.id} value={startupEditModeOption.id}>
                    {startupEditModeOption.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {windowsStartupTrayResidentVisible ? (
            <label className="menu-section__mode-switch">
              <span className="menu-section__mode-switch-meta">
                <span className="menu-section__field-label">Windows 起動時の常駐</span>
              </span>
              <span className="menu-section__mode-switch-values">
                <span
                  className={
                    !windowsStartupTrayResidentEnabled
                      ? "menu-section__mode-label is-active"
                      : "menu-section__mode-label"
                  }
                >
                  無効
                </span>
                <input
                  type="checkbox"
                  className="menu-section__switch-input"
                  checked={windowsStartupTrayResidentEnabled}
                  onChange={handleWindowsStartupTrayResidentSwitch}
                  aria-label="Windows 起動時のタスクトレイ常駐を切り替え"
                />
                <span className="menu-section__switch" aria-hidden="true" />
                <span
                  className={
                    windowsStartupTrayResidentEnabled
                      ? "menu-section__mode-label is-active"
                      : "menu-section__mode-label"
                  }
                >
                  常駐
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      {fontGroupVisible ? (
        <div className="menu-section__group">
          <div className="menu-section__group-header">
            <h2 className="menu-section__group-title">フォント</h2>
            <p className="menu-section__group-description">アプリ全体と Edit 本文</p>
          </div>
          {systemFontSizeVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">システムフォントサイズ</span>
              <input
                type="text"
                value={systemFontSizeDraft}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={handleSystemFontSizeInput}
                onBlur={handleSystemFontSizeBlur}
                onFocus={handleSystemFontSizeFocus}
                onKeyDown={handleSystemFontSizeKeyDown}
                aria-label="システムフォントサイズ"
                className="menu-section__select"
              />
            </label>
          ) : null}

          {editFontVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">Edit</span>
              <input
                type="text"
                value={editFontDraft}
                onChange={handleEditFontInput}
                onBlur={handleEditFontBlur}
                onFocus={handleEditFontFocus}
                onKeyDown={handleEditFontKeyDown}
                aria-label="Edit フォント"
                className="menu-section__select"
                list={EDIT_FONT_DATALIST_ID}
                placeholder='例: Iosevka Term, "Fira Code", monospace'
                spellCheck={false}
              />
              <datalist id={EDIT_FONT_DATALIST_ID}>
                {EDIT_FONT_OPTIONS.map((fontOption) => (
                  <option key={fontOption.value} value={fontOption.value} label={fontOption.label} />
                ))}
              </datalist>
            </label>
          ) : null}

          {appFontVisible ? (
            <label className="menu-section__label">
              <span className="menu-section__field-label">アプリ</span>
              <input
                type="text"
                value={appFontDraft}
                onChange={handleAppFontInput}
                onBlur={handleAppFontBlur}
                onFocus={handleAppFontFocus}
                onKeyDown={handleAppFontKeyDown}
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
          ) : null}
        </div>
      ) : null}

      {appThemeGroupVisible ? (
        <div className="menu-section__group">
          <div className="menu-section__group-header">
            <h2 className="menu-section__group-title">アプリテーマ</h2>
            <p className="menu-section__group-description">ウィンドウ全体の配色</p>
          </div>
          <label className="menu-section__label">
            <span className="menu-section__field-label">配色テーマ</span>
            <select
              value={appThemeId}
              onChange={handleAppThemeSelect}
              aria-label="アプリ表示テーマ"
              className="menu-section__select"
            >
              {APP_THEME_OPTIONS.map((themeOption) => (
                <option key={themeOption.id} value={themeOption.id}>
                  {themeOption.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {layoutModeGroupVisible ? (
        <div className="menu-section__group">
          <div className="menu-section__group-header">
            <h2 className="menu-section__group-title">表示モード</h2>
            <p className="menu-section__group-description">PC と Mobile のレイアウト切替</p>
          </div>
          <label className="menu-section__mode-switch">
            <span className="menu-section__mode-switch-meta">
              <span className="menu-section__field-label">レイアウト</span>
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
      ) : null}

      {multiCursorGroupVisible ? (
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
      ) : null}

      {!hasVisibleMenuItems ? <p className="menu-section__empty">一致する設定なし</p> : null}
    </section>
  );
}

export const MenuSection = memo(MenuSectionComponent);
