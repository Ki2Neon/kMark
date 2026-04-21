import { lazy, memo, Suspense, useCallback, useEffect, useRef, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { type LayoutMode } from "../../domain/editor";
import { type DraftFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { getMarkdownEnterAction, getMarkdownTabAction } from "../../domain/markdownEditing";
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
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
};

function getCursorLineNumber(content: string, cursorOffset: number): number {
  const normalizedCursorOffset = Math.max(0, Math.min(cursorOffset, content.length));

  return content.slice(0, normalizedCursorOffset).split(/\r?\n/u).length;
}

function getCursorOffsetForLine(content: string, lineNumber: number): number {
  const normalizedLineNumber = Math.max(1, lineNumber);

  if (normalizedLineNumber === 1) {
    return 0;
  }

  let currentLineNumber = 1;

  for (let offset = 0; offset < content.length; offset += 1) {
    if (content[offset] !== "\n") {
      continue;
    }

    currentLineNumber += 1;

    if (currentLineNumber === normalizedLineNumber) {
      return offset + 1;
    }
  }

  return content.length;
}

function MarkdownInputComponent({
  appThemeId,
  content,
  draftFontId,
  layoutMode,
  multiCursorModifier,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
}: MarkdownInputProps) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const emitTextAreaCursorLine = useCallback((textArea: HTMLTextAreaElement) => {
    onCursorLineChange?.(getCursorLineNumber(textArea.value, textArea.selectionStart));
  }, [onCursorLineChange]);

  useEffect(() => {
    if (layoutMode === "desktop" || requestedLineSelection === null || requestedLineSelection === undefined) {
      return;
    }

    const textArea = textAreaRef.current;

    if (textArea === null) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const nextCursorOffset = getCursorOffsetForLine(content, requestedLineSelection.lineNumber);

      textArea.focus();
      textArea.setSelectionRange(nextCursorOffset, nextCursorOffset);
      emitTextAreaCursorLine(textArea);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [content, emitTextAreaCursorLine, layoutMode, requestedLineSelection]);

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(event.currentTarget.value);
    emitTextAreaCursorLine(event.currentTarget);
  }, [emitTextAreaCursorLine, onContentChange]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      const textArea = event.currentTarget;

      if (textArea.selectionStart === textArea.selectionEnd) {
        const enterAction = getMarkdownEnterAction(textArea.value, textArea.selectionStart);

        if (enterAction !== null) {
          event.preventDefault();
          const nextContent = `${textArea.value.slice(0, enterAction.rangeStart)}${enterAction.text}${textArea.value.slice(enterAction.rangeEnd)}`;
          const nextCursorOffset = enterAction.rangeStart + enterAction.text.length;

          onContentChange(nextContent);

          window.requestAnimationFrame(() => {
            textArea.selectionStart = nextCursorOffset;
            textArea.selectionEnd = nextCursorOffset;
            onCursorLineChange?.(getCursorLineNumber(nextContent, nextCursorOffset));
          });

          return;
        }
      }

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    const textArea = event.currentTarget;
    const tabAction = getMarkdownTabAction(
      textArea.value,
      textArea.selectionStart,
      textArea.selectionEnd,
      event.shiftKey,
    );

    if (tabAction === null) {
      if (event.shiftKey) {
        return;
      }

      const indent = "  ";
      const nextContent = `${textArea.value.slice(0, textArea.selectionStart)}${indent}${textArea.value.slice(textArea.selectionEnd)}`;
      const nextCursor = textArea.selectionStart + indent.length;

      onContentChange(nextContent);

      window.requestAnimationFrame(() => {
        textArea.selectionStart = nextCursor;
        textArea.selectionEnd = nextCursor;
        onCursorLineChange?.(getCursorLineNumber(nextContent, nextCursor));
      });

      return;
    }

    const nextContent = `${textArea.value.slice(0, tabAction.rangeStart)}${tabAction.text}${textArea.value.slice(tabAction.rangeEnd)}`;

    onContentChange(nextContent);

    window.requestAnimationFrame(() => {
      textArea.selectionStart = tabAction.nextSelectionStart;
      textArea.selectionEnd = tabAction.nextSelectionEnd;
      onCursorLineChange?.(getCursorLineNumber(nextContent, tabAction.nextSelectionEnd));
    });
  }, [onContentChange, onCursorLineChange]);

  const handleTextAreaCursorEvent = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    emitTextAreaCursorLine(event.currentTarget);
  }, [emitTextAreaCursorLine]);

  const handleFocus = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    onFocusChange?.(true);
    emitTextAreaCursorLine(event.currentTarget);
  }, [emitTextAreaCursorLine, onFocusChange]);

  if (layoutMode === "desktop") {
    return (
      <section className="section section--draft" aria-label="Draft">
        <div className="draft-section__editor">
          <Suspense fallback={null}>
            <DesktopMarkdownInput
              appThemeId={appThemeId}
              content={content}
              draftFontId={draftFontId}
              multiCursorModifier={multiCursorModifier}
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

  return (
    <section className="section section--draft" aria-label="Draft">
      <textarea
        ref={textAreaRef}
        className="draft-section__textarea"
        value={content}
        onChange={handleChange}
        onClick={handleTextAreaCursorEvent}
        onFocus={handleFocus}
        onBlur={() => onFocusChange?.(false)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleTextAreaCursorEvent}
        onSelect={handleTextAreaCursorEvent}
        spellCheck={false}
        placeholder="ここに Markdown を書きます"
        aria-label="Markdown エディター"
      />
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);