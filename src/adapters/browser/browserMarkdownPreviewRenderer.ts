import { isTauri } from "@tauri-apps/api/core";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

export async function renderMarkdownPreview(
  content: string,
  filePath?: string | null,
): Promise<RenderedMarkdownPreviewPayload> {
  if (!isTauri()) {
    return renderMarkdownPreviewWithWasm(content, filePath);
  }

  return invokeTauriCommand<RenderedMarkdownPreviewPayload>(
    RENDER_MARKDOWN_PREVIEW_COMMAND,
    { content, filePath },
    "プレビュー描画に失敗しました。",
  );
}
