import { memo, type ChangeEvent, type KeyboardEvent } from "react";

type MarkdownInputProps = {
  readonly content: string;
  readonly onContentChange: (content: string) => void;
};

function MarkdownInputComponent({ content, onContentChange }: MarkdownInputProps) {
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
    <section className="section section--draft" aria-labelledby="draft-title">
      <div className="section__head section__head--compact">
        <div>
          <span className="section__eyebrow">draft</span>
          <h2 id="draft-title" className="section__title">
            Draft
          </h2>
        </div>

        <p className="section__note section__note--compact">Tab キーで 2 スペースを挿入します。</p>
      </div>

      <textarea
        className="draft-section__textarea"
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