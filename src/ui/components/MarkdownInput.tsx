import { lazy, memo, Suspense } from "react";
import { type LayoutMode } from "../../domain/editor";
import { type EditFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

const DesktopMarkdownInput = lazy(async () => {
  const module = await import("./DesktopMarkdownInput");

  return {
    default: module.DesktopMarkdownInput,
  };
});

type MarkdownInputProps = {
  readonly appThemeId: AppThemeId;
  readonly content: string;
  readonly editFontId: EditFontId;
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly onAssetDrop?: (droppedFilePaths: readonly string[]) => Promise<string | null>;
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
  readonly showMobileInputHelperBar?: boolean;
};

function MarkdownInputComponent({
  appThemeId,
  content,
  editFontId,
  layoutMode,
  multiCursorModifier,
  showLineNumbers,
  onAssetDrop,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
  showMobileInputHelperBar = false,
}: MarkdownInputProps) {
  return (
    <section className="section section--edit" aria-label="Edit">
      <div className="edit-section__editor">
        <Suspense fallback={null}>
          <DesktopMarkdownInput
            appThemeId={appThemeId}
            blurOnEscapeWhenSelectionEmpty={layoutMode === "mobile"}
            content={content}
            editFontId={editFontId}
            multiCursorModifier={multiCursorModifier}
            showLineNumbers={showLineNumbers}
            onAssetDrop={onAssetDrop}
            onContentChange={onContentChange}
            onCursorLineChange={onCursorLineChange}
            onFocusChange={onFocusChange}
            requestedLineSelection={requestedLineSelection}
            showMobileInputHelperBar={showMobileInputHelperBar}
          />
        </Suspense>
      </div>
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);
