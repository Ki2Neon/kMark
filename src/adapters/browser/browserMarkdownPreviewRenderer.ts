import { invokeTauriCommand } from "../../infra/tauriCommand";
import { convertRuntimeFileSrc, isTauri } from "../../runtime/runtime";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";
import {
  type BrowserMarkdownPreviewWorkerRequest,
  type BrowserMarkdownPreviewWorkerResponse,
} from "./browserMarkdownPreviewWorker";
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

const MEDIA_TAG_PATTERN = /<(?:img|video)\b[^>]*>/giu;
const FILE_MEDIA_ATTRIBUTE_PATTERN = /(\s(?:src|poster)=")(file:[^"]+)(")/giu;

type FileUrlParts = {
  readonly hash: string;
  readonly path: string;
  readonly search: string;
};

type PendingPreviewWorkerRequest = {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (renderedPreview: RenderedMarkdownPreviewPayload) => void;
};

let previewWorker: Worker | null = null;
let previewWorkerRequestId = 0;
const pendingPreviewWorkerRequests = new Map<number, PendingPreviewWorkerRequest>();

function fileUrlToPathParts(fileUrl: string): FileUrlParts | null {
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
    const suffix = {
      hash: url.hash,
      search: url.search,
    };

    if (url.hostname.length > 0 && url.hostname !== "localhost") {
      return {
        ...suffix,
        path: `\\\\${url.hostname}${normalizedDecodedPath.replace(/\//gu, "\\")}`,
      };
    }

    if (/^\/[A-Za-z]:/u.test(normalizedDecodedPath)) {
      return {
        ...suffix,
        path: normalizedDecodedPath.slice(1).replace(/\//gu, "\\"),
      };
    }

    return {
      ...suffix,
      path: normalizedDecodedPath,
    };
  } catch {
    return null;
  }
}

async function normalizePreviewHtmlMediaTag(tagHtml: string): Promise<string> {
  const replacements = await Promise.all(
    Array.from(tagHtml.matchAll(FILE_MEDIA_ATTRIBUTE_PATTERN), async (match) => {
      const [raw, prefix, source, suffix] = match;
      const fileUrlParts = fileUrlToPathParts(source);

      if (fileUrlParts === null) {
        return {
          index: match.index ?? 0,
          rawLength: raw.length,
          replacement: raw,
        };
      }

      return {
        index: match.index ?? 0,
        rawLength: raw.length,
        replacement: `${prefix}${await convertRuntimeFileSrc(fileUrlParts.path)}${fileUrlParts.search}${fileUrlParts.hash}${suffix}`,
      };
    }),
  );

  let normalizedTagHtml = "";
  let cursor = 0;

  for (const { index, rawLength, replacement } of replacements) {
    normalizedTagHtml += `${tagHtml.slice(cursor, index)}${replacement}`;
    cursor = index + rawLength;
  }

  return `${normalizedTagHtml}${tagHtml.slice(cursor)}`;
}

async function normalizePreviewHtmlMediaSources(html: string): Promise<string> {
  if (!isTauri()) {
    return html;
  }

  const replacements = await Promise.all(
    Array.from(html.matchAll(MEDIA_TAG_PATTERN), async (match) => {
      const [raw] = match;
      return {
        index: match.index ?? 0,
        rawLength: raw.length,
        replacement: await normalizePreviewHtmlMediaTag(raw),
      };
    }),
  );

  let normalizedHtml = "";
  let cursor = 0;

  for (const { index, rawLength, replacement } of replacements) {
    normalizedHtml += `${html.slice(cursor, index)}${replacement}`;
    cursor = index + rawLength;
  }

  return `${normalizedHtml}${html.slice(cursor)}`;
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

async function normalizeRenderedMarkdownPreview(
  renderedPreview: RenderedMarkdownPreviewPayload,
): Promise<NormalizedRenderedMarkdownPreviewPayload> {
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
    html: await normalizePreviewHtmlMediaSources(renderedPreview.html),
    pageHtmls: await Promise.all(renderedPreview.pageHtmls.map(normalizePreviewHtmlMediaSources)),
    pages: await Promise.all(pages.map(async (page) => ({
      ...page,
      html: await normalizePreviewHtmlMediaSources(page.html),
      textStyle: normalizePreviewTextStyle(page.textStyle),
      pageNumberConfig: page.pageNumberConfig ?? DEFAULT_PAGE_NUMBER_CONFIG,
      pageChromeConfig: normalizePageChromeConfig(page.pageChromeConfig),
    }))),
    defaultPageStyle,
    defaultTextStyle,
  };
}

function rejectPendingPreviewWorkerRequests(reason: unknown): void {
  const pendingRequests = [...pendingPreviewWorkerRequests.values()];
  pendingPreviewWorkerRequests.clear();

  for (const pendingRequest of pendingRequests) {
    pendingRequest.reject(reason);
  }
}

function resetPreviewWorker(reason: unknown): void {
  rejectPendingPreviewWorkerRequests(reason);
  previewWorker?.terminate();
  previewWorker = null;
}

function handlePreviewWorkerMessage(event: MessageEvent<BrowserMarkdownPreviewWorkerResponse>): void {
  const pendingRequest = pendingPreviewWorkerRequests.get(event.data.id);

  if (pendingRequest === undefined) {
    return;
  }

  pendingPreviewWorkerRequests.delete(event.data.id);

  if (event.data.type === "failed") {
    pendingRequest.reject(new Error(event.data.message));
    return;
  }

  pendingRequest.resolve(event.data.renderedPreview);
}

function getPreviewWorker(): Worker {
  if (previewWorker !== null) {
    return previewWorker;
  }

  const nextPreviewWorker = new Worker(new URL("./browserMarkdownPreviewWorker.ts", import.meta.url), {
    type: "module",
  });

  nextPreviewWorker.onmessage = handlePreviewWorkerMessage;
  nextPreviewWorker.onerror = (event) => {
    resetPreviewWorker(event instanceof ErrorEvent ? event.error : new Error("プレビュー描画Workerでエラーが発生しました。"));
  };
  nextPreviewWorker.onmessageerror = () => {
    resetPreviewWorker(new Error("プレビュー描画Workerの通信に失敗しました。"));
  };
  previewWorker = nextPreviewWorker;

  return nextPreviewWorker;
}

async function renderMarkdownPreviewWithWorker(
  content: string,
  filePath?: string | null,
): Promise<RenderedMarkdownPreviewPayload> {
  let worker: Worker;

  try {
    worker = getPreviewWorker();
  } catch {
    return renderMarkdownPreviewWithWasm(content, filePath);
  }

  const requestId = previewWorkerRequestId + 1;
  previewWorkerRequestId = requestId;

  return new Promise((resolve, reject) => {
    pendingPreviewWorkerRequests.set(requestId, { reject, resolve });

    const request: BrowserMarkdownPreviewWorkerRequest = {
      content,
      filePath: filePath ?? null,
      id: requestId,
    };

    worker.postMessage(request);
  });
}

export async function renderMarkdownPreview(
  content: string,
  filePath?: string | null,
): Promise<NormalizedRenderedMarkdownPreviewPayload> {
  if (!isTauri()) {
    return normalizeRenderedMarkdownPreview(await renderMarkdownPreviewWithWorker(content, filePath));
  }

  const renderedPreview = await invokeTauriCommand<RenderedMarkdownPreviewPayload>(
    RENDER_MARKDOWN_PREVIEW_COMMAND,
    { content, filePath },
    "プレビュー描画に失敗しました。",
  );

  return normalizeRenderedMarkdownPreview(renderedPreview);
}
