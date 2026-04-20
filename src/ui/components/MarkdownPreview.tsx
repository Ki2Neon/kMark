import { memo } from "react";

type MarkdownPreviewProps = {
  readonly html: string;
};

function MarkdownPreviewComponent({ html }: MarkdownPreviewProps) {
  return (
    <section className="section section--preview" aria-labelledby="preview-title">
      <div className="section__head section__head--compact">
        <div>
          <span className="section__eyebrow">preview</span>
          <h2 id="preview-title" className="section__title">
            Preview
          </h2>
        </div>

        <p className="section__note section__note--compact">HTML は無効化し、安全な Markdown だけを描画します。</p>
      </div>

      <article className="preview-section__body markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);