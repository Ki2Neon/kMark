import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
};

const FILE_IMAGE_SOURCE_PATTERN = /(<img\b[^>]*?\bsrc=")(file:[^"]+)(")/giu;

function fileUrlToPath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);

    if (url.protocol !== "file:") {
      return null;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const normalizedDecodedPath = decodedPath.startsWith("/?/")
      ? decodedPath.slice(2)
      : decodedPath.startsWith("//?/UNC/")
        ? `//${decodedPath.slice(8)}`
        : decodedPath.startsWith("//?/")
          ? decodedPath.slice(4)
          : decodedPath;

    if (url.hostname.length > 0 && url.hostname !== "localhost") {
      return `\\\\${url.hostname}${normalizedDecodedPath.replace(/\//gu, "\\")}`;
    }

    if (/^\/[A-Za-z]:/u.test(normalizedDecodedPath)) {
      return normalizedDecodedPath.slice(1).replace(/\//gu, "\\");
    }

    return normalizedDecodedPath;
  } catch {
    return null;
  }
}

function normalizePreviewHtmlImageSources(html: string): string {
  return html.replace(FILE_IMAGE_SOURCE_PATTERN, (match, prefix, source, suffix) => {
    const filePath = fileUrlToPath(source);

    if (filePath === null) {
      return match;
    }

    return `${prefix}${convertFileSrc(filePath)}${suffix}`;
  });
}

function normalizeRenderedMarkdownPreview(
  renderedPreview: RenderedMarkdownPreviewPayload,
): RenderedMarkdownPreviewPayload {
  return {
    html: normalizePreviewHtmlImageSources(renderedPreview.html),
    pageHtmls: renderedPreview.pageHtmls.map(normalizePreviewHtmlImageSources),
  };
}

export async function renderMarkdownPreview(
  content: string,
  filePath?: string | null,
): Promise<RenderedMarkdownPreviewPayload> {
  if (!isTauri()) {
    return renderMarkdownPreviewWithWasm(content, filePath);
  }

  const renderedPreview = await invokeTauriCommand<RenderedMarkdownPreviewPayload>(
    RENDER_MARKDOWN_PREVIEW_COMMAND,
    { content, filePath },
    "プレビュー描画に失敗しました。",
  );

  return normalizeRenderedMarkdownPreview(renderedPreview);
}
