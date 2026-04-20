import { memo, type ChangeEvent, type KeyboardEvent } from "react";
import { type EditorStats } from "../../domain/editor";

type MarkdownInputProps = {
  readonly content: string;
  readonly stats: EditorStats;
  readonly onContentChange: (content: string) => void;
};

function MarkdownInputComponent({ content, stats, onContentChange }: MarkdownInputProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(event.currentTarget.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
  };

  return (
    <section className="panel panel--editor" aria-labelledby="editor-title">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">write</span>
          <h2 id="editor-title">Draft</h2>
        </div>

        <div className="panel__metrics" aria-label="ドキュメント統計">
          <span>{stats.words} words</span>
          <span>{stats.characters} chars</span>
          <span>{stats.lines} lines</span>
          <span>{stats.readingMinutes} min read</span>
        </div>
      </div>

      <textarea
        className="panel__textarea"
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="ここに Markdown を書きます"
        aria-label="Markdown エディター"
      />
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);