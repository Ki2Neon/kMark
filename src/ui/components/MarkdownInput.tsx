import { lazy, memo, Suspense } from "react";
import { type LayoutMode } from "../../domain/editor";
import { type DraftFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
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
  readonly draftFontId: DraftFontId;
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
};

function MarkdownInputComponent({
  appThemeId,
  content,
  draftFontId,
  layoutMode,
  multiCursorModifier,
  showLineNumbers,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
}: MarkdownInputProps) {
  return (
    <section className="section section--draft" aria-label="Draft">
      <div className="draft-section__editor">
        <Suspense fallback={null}>
          <DesktopMarkdownInput
            appThemeId={appThemeId}
            blurOnEscapeWhenSelectionEmpty={layoutMode === "mobile"}
            content={content}
            draftFontId={draftFontId}
            multiCursorModifier={multiCursorModifier}
            showLineNumbers={showLineNumbers}
            onContentChange={onContentChange}
            onCursorLineChange={onCursorLineChange}
            onFocusChange={onFocusChange}
            requestedLineSelection={requestedLineSelection}
          />
        </Suspense>
      </div>
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);