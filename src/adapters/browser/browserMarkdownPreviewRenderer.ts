import { invoke, isTauri } from "@tauri-apps/api/core";
import { renderMarkdown, renderMarkdownPages } from "../../infra/markdown";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

function renderMarkdownPreviewFallback(content: string): RenderedMarkdownPreviewPayload {
  return {
    html: renderMarkdown(content),
    pageHtmls: renderMarkdownPages(content),
  };
}

export async function renderMarkdownPreview(content: string): Promise<RenderedMarkdownPreviewPayload> {
  if (!isTauri()) {
    return renderMarkdownPreviewFallback(content);
  }

  try {
    return await invoke<RenderedMarkdownPreviewPayload>(RENDER_MARKDOWN_PREVIEW_COMMAND, { content });
  } catch {
    return renderMarkdownPreviewFallback(content);
  }
}
