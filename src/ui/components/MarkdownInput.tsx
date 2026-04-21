import { lazy, memo, Suspense, useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import { type LayoutMode } from "../../domain/editor";
import { type MultiCursorModifier } from "../../domain/editorPreferences";
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
  readonly layoutMode: LayoutMode;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly onContentChange: (content: string) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
};

function MarkdownInputComponent({
  appThemeId,
  content,
  layoutMode,
  multiCursorModifier,
  onContentChange,
  onFocusChange,
}: MarkdownInputProps) {
  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(event.currentTarget.value);
  }, [onContentChange]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    const textArea = event.currentTarget;
    const indent = "  ";
    const nextContent = `${textArea.value.slice(0, textArea.selectionStart)}${indent}${textArea.value.slice(textArea.selectionEnd)}`;
    const nextCursor = textArea.selectionStart + indent.length;

    onContentChange(nextContent);

    window.requestAnimationFrame(() => {
      textArea.selectionStart = nextCursor;
      textArea.selectionEnd = nextCursor;
    });
  }, [onContentChange]);

  if (layoutMode === "desktop") {
    return (
      <section className="section section--draft" aria-label="Draft">
        <div className="draft-section__editor">
          <Suspense fallback={null}>
            <DesktopMarkdownInput
              appThemeId={appThemeId}
              content={content}
              multiCursorModifier={multiCursorModifier}
              onContentChange={onContentChange}
              onFocusChange={onFocusChange}
            />
          </Suspense>
        </div>
      </section>
    );
  }

  return (
    <section className="section section--draft" aria-label="Draft">
      <textarea
        className="draft-section__textarea"
        value={content}
        onChange={handleChange}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="ここに Markdown を書きます"
        aria-label="Markdown エディター"
      />
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);