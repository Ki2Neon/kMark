import { isTauri } from "@tauri-apps/api/core";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

export async function renderMarkdownPreview(content: string): Promise<RenderedMarkdownPreviewPayload> {
  if (!isTauri()) {
    return renderMarkdownPreviewWithWasm(content);
  }

  return invokeTauriCommand<RenderedMarkdownPreviewPayload>(
    RENDER_MARKDOWN_PREVIEW_COMMAND,
    { content },
    "プレビュー描画に失敗しました。",
  );
}
