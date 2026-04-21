import { memo } from "react";

type MarkdownPreviewProps = {
  readonly html: string;
};

function MarkdownPreviewComponent({ html }: MarkdownPreviewProps) {
  return (
    <section className="section section--preview" aria-label="Preview">
      <article className="preview-section__body markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);