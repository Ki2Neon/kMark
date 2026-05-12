import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { invokeTauriCommand } from "../../infra/tauriCommand";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PAGE_NUMBER_CONFIG,
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type PageChromeConfig,
  type PageChromeRegionConfig,
  type PageStyle,
  type PageNumberConfig,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";

type RenderedPreviewPagePayload = Omit<RenderedPreviewPage, "pageChromeConfig" | "pageNumberConfig" | "textStyle"> & {
  readonly pageChromeConfig?: Partial<PageChromeConfig>;
  readonly pageNumberConfig?: PageNumberConfig;
  readonly textStyle?: Partial<PreviewTextStyle>;
};

type RenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages?: readonly RenderedPreviewPagePayload[];
  readonly defaultPageStyle?: PageStyle;
  readonly defaultTextStyle?: PreviewTextStyle;
};

type NormalizedRenderedMarkdownPreviewPayload = {
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
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

function normalizePreviewTextStyle(textStyle?: Partial<PreviewTextStyle>): PreviewTextStyle {
  return {
    ...DEFAULT_PREVIEW_TEXT_STYLE,
    ...textStyle,
  };
}

function normalizePageChromeRegionConfig(
  regionConfig: Partial<PageChromeRegionConfig> | undefined,
  defaultRegionConfig: PageChromeRegionConfig,
): PageChromeRegionConfig {
  return {
    ...defaultRegionConfig,
    ...regionConfig,
  };
}

function normalizePageChromeConfig(config?: Partial<PageChromeConfig>): PageChromeConfig {
  return {
    header: normalizePageChromeRegionConfig(config?.header, DEFAULT_PAGE_CHROME_CONFIG.header),
    footer: normalizePageChromeRegionConfig(config?.footer, DEFAULT_PAGE_CHROME_CONFIG.footer),
  };
}

function normalizeRenderedMarkdownPreview(
  renderedPreview: RenderedMarkdownPreviewPayload,
): NormalizedRenderedMarkdownPreviewPayload {
  const defaultPageStyle = renderedPreview.defaultPageStyle ?? DEFAULT_PAGE_STYLE;
  const defaultTextStyle = normalizePreviewTextStyle(renderedPreview.defaultTextStyle);
  const pages = renderedPreview.pages !== undefined && renderedPreview.pages.length > 0
    ? renderedPreview.pages
    : renderedPreview.pageHtmls.map((pageHtml) => ({
      html: pageHtml,
      pageStyle: defaultPageStyle,
      textStyle: defaultTextStyle,
      pageNumberConfig: DEFAULT_PAGE_NUMBER_CONFIG,
      pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
    }));

  return {
    html: normalizePreviewHtmlImageSources(renderedPreview.html),
    pageHtmls: renderedPreview.pageHtmls.map(normalizePreviewHtmlImageSources),
    pages: pages.map((page) => ({
      ...page,
      html: normalizePreviewHtmlImageSources(page.html),
      textStyle: normalizePreviewTextStyle(page.textStyle),
      pageNumberConfig: page.pageNumberConfig ?? DEFAULT_PAGE_NUMBER_CONFIG,
      pageChromeConfig: normalizePageChromeConfig(page.pageChromeConfig),
    })),
    defaultPageStyle,
    defaultTextStyle,
  };
}

export async function renderMarkdownPreview(
  content: string,
  filePath?: string | null,
): Promise<NormalizedRenderedMarkdownPreviewPayload> {
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
