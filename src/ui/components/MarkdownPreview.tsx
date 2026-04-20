import { memo } from "react";

type MarkdownPreviewProps = {
  readonly html: string;
};

function MarkdownPreviewComponent({ html }: MarkdownPreviewProps) {
  return (
    <section className="panel panel--preview" aria-labelledby="preview-title">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">preview</span>
          <h2 id="preview-title">Rendered</h2>
        </div>

        <p className="panel__hint">HTML は無効化し、安全な Markdown だけを描画します。</p>
      </div>

      <article className="panel__preview markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);