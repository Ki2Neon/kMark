import { invokeTauriCommand } from "../../infra/tauriCommand";
import { convertRuntimeFileSrc, isTauri } from "../../runtime/runtime";
import { renderMarkdownPreviewWithWasm } from "../../wasm/kmarkWeb";
import {
  type EditorMutationAckPayload,
  type EditorMutationBatchPayload,
  type RenderedPagePayload,
  type RenderedPreviewPayload,
  type SessionPreviewPayload,
} from "../../contracts/generated";
import {
  type BrowserMarkdownPreviewWorkerRequest,
  type BrowserMarkdownPreviewWorkerResponse,
} from "./browserMarkdownPreviewWorker";
import {
  DEFAULT_PAGE_CHROME_CONFIG,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type PageChromeConfig,
  type PageChromeRegionConfig,
  type PageStyle,
  type PageNumberConfig,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";
import { renderMermaidPreviewHtml, resolveMermaidPreviewTheme } from "./browserMermaidRenderer";
import {
  discardGeneratedSvgPreviewSectionCache,
  renderGeneratedSvgPreviewHtml,
  renderGeneratedSvgPreviewHtmlDocuments,
} from "./browserPlantUmlRenderer";
import { type PreviewRenderOptions } from "../../application/editorSession/editorSessionPorts";
import {
  applySessionPreviewResponse,
  changedSessionPreviewSectionIndices,
  type SessionPreviewState,
} from "./sessionPreviewState";

const RENDER_MARKDOWN_PREVIEW_COMMAND = "render_markdown_preview";
const sessionPreviewStates = new Map<string, SessionPreviewState>();
type NormalizedSessionSections =
  | { readonly mode: "standard"; readonly sections: readonly string[] }
  | { readonly mode: "a4"; readonly sections: readonly (readonly RenderedPreviewPage[])[] };
const normalizedSessionStates = new Map<string, {
  readonly revision: number;
  readonly renderKey: string;
  readonly value: NormalizedSessionSections;
}>();
const MAX_PREVIEW_SESSION_CACHE_ENTRIES = 16;

type RenderedMarkdownPreviewPayload = Readonly<RenderedPreviewPayload>;
type InternalPreviewRenderOptions = PreviewRenderOptions & {
  readonly generatedSvgSectionKey?: string;
};

type NormalizedRenderedMarkdownPreviewPayload =
  | {
      readonly mode: "standard";
      readonly html: string;
      readonly sectionHtmls?: readonly string[];
      readonly defaultPageStyle: PageStyle;
      readonly defaultTextStyle: PreviewTextStyle;
    }
  | {
      readonly mode: "a4";
      readonly pages: readonly RenderedPreviewPage[];
      readonly sectionPages?: readonly (readonly RenderedPreviewPage[])[];
      readonly defaultPageStyle: PageStyle;
      readonly defaultTextStyle: PreviewTextStyle;
    };

const FILE_MEDIA_ATTRIBUTE_NAME_PATTERN = [
  "src",
  "poster",
  "data-kmark-model-source",
  "data-kmark-model-display-src",
  "data-kmark-model-poster",
].join("|");
const FILE_MEDIA_ATTRIBUTE_PATTERN = new RegExp(
  `(\\s(?:${FILE_MEDIA_ATTRIBUTE_NAME_PATTERN})=")(file:[^"]+)(")`,
  "giu",
);
const FILE_MEDIA_TAG_PATTERN = new RegExp(
  `<[^>]*\\s(?:${FILE_MEDIA_ATTRIBUTE_NAME_PATTERN})="file:[^"]+"[^>]*>`,
  "giu",
);

type FileUrlParts = {
  readonly hash: string;
  readonly path: string;
  readonly search: string;
};

type PendingPreviewWorkerRequest = {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (response: BrowserMarkdownPreviewWorkerResponse) => void;
};

type PreviewWorkerRequestInput = BrowserMarkdownPreviewWorkerRequest extends infer Request
  ? Request extends { readonly id: number }
    ? Omit<Request, "id">
    : never
  : never;

let previewWorker: Worker | null = null;
let previewWorkerRequestId = 0;
const pendingPreviewWorkerRequests = new Map<number, PendingPreviewWorkerRequest>();
const previewSessionRecoveryHandlers = new Map<string, () => Promise<void>>();

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
    Array.from(html.matchAll(FILE_MEDIA_TAG_PATTERN), async (match) => {
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

function normalizeRawPage(page: RenderedPagePayload): RenderedPreviewPage {
  return {
    ...page,
    textStyle: normalizePreviewTextStyle(page.textStyle),
    pageNumberConfig: page.pageNumberConfig as PageNumberConfig,
    pageChromeConfig: normalizePageChromeConfig(page.pageChromeConfig),
  };
}

async function normalizeRenderedMarkdownPreview(
  renderedPreview: RenderedMarkdownPreviewPayload,
  options?: InternalPreviewRenderOptions,
): Promise<NormalizedRenderedMarkdownPreviewPayload> {
  const defaultPageStyle = renderedPreview.defaultPageStyle;
  const defaultTextStyle = normalizePreviewTextStyle(renderedPreview.defaultTextStyle);

  if (renderedPreview.mode === "standard") {
    const html = await normalizePreviewHtmlMediaSources(renderedPreview.html);
    const basePreview: NormalizedRenderedMarkdownPreviewPayload = {
      mode: "standard",
      html,
      defaultPageStyle,
      defaultTextStyle,
    };
    const hasGeneratedSvg = html.includes("kmark-persistent-generated-svg-block");
    if (!hasGeneratedSvg) {
      discardGeneratedSvgPreviewSectionCache(
        options?.documentKey ?? "preview",
        options?.plantumlRenderEpoch ?? 0,
        options?.generatedSvgSectionKey ?? "document",
        "standard",
      );
    }
    const generatedSvgHtml = hasGeneratedSvg
      ? await renderGeneratedSvgPreviewHtml(html, {
        revision: options?.revision ?? 0,
        documentKey: options?.documentKey ?? "preview",
        sectionKey: options?.generatedSvgSectionKey,
        plantumlRenderEpoch: options?.plantumlRenderEpoch ?? 0,
        httpsHosts: options?.plantumlHttpsHosts ?? [],
        activeSourceLine: options?.activeSourceLine,
        signal: options?.signal,
        strict: options?.strictGeneratedSvg,
        surface: "standard",
        onUpdate: (updatedHtml) => options?.onUpdate?.({ ...basePreview, html: updatedHtml }),
      })
      : html;
    const hydratedPreview: NormalizedRenderedMarkdownPreviewPayload = {
      ...basePreview,
      html: await renderMermaidPreviewHtml(generatedSvgHtml, {
        surface: "standard",
        theme: resolveMermaidPreviewTheme("standard"),
        revision: options?.revision ?? 0,
        httpsHosts: options?.plantumlHttpsHosts ?? [],
        signal: options?.signal,
        strict: options?.strictGeneratedSvg,
      }),
    };
    options?.onUpdate?.(hydratedPreview);
    return hydratedPreview;
  }

  const normalizedPages = await Promise.all(renderedPreview.pages.map(async (page) => ({
    ...normalizeRawPage(page),
    html: await normalizePreviewHtmlMediaSources(page.html),
  })));

  const basePreview: NormalizedRenderedMarkdownPreviewPayload = {
    mode: "a4",
    pages: normalizedPages,
    defaultPageStyle,
    defaultTextStyle,
  };
  const hydratedPages = [...normalizedPages];
  const hasGeneratedSvg = hydratedPages.some((page) => page.html.includes("kmark-persistent-generated-svg-block"));
  if (!hasGeneratedSvg) {
    discardGeneratedSvgPreviewSectionCache(
      options?.documentKey ?? "preview",
      options?.plantumlRenderEpoch ?? 0,
      options?.generatedSvgSectionKey ?? "document",
      "paper",
    );
  }
  const generatedSvgPages = hasGeneratedSvg
    ? await renderGeneratedSvgPreviewHtmlDocuments(
      hydratedPages.map((page) => page.html),
      {
        revision: options?.revision ?? 0,
        documentKey: options?.documentKey ?? "preview",
        sectionKey: options?.generatedSvgSectionKey,
        plantumlRenderEpoch: options?.plantumlRenderEpoch ?? 0,
        httpsHosts: options?.plantumlHttpsHosts ?? [],
        activeSourceLine: options?.activeSourceLine,
        signal: options?.signal,
        strict: options?.strictGeneratedSvg,
        surface: "paper",
        onUpdate: (updatedPages) => {
          updatedPages.forEach((html, pageIndex) => {
            if (hydratedPages[pageIndex] !== undefined) {
              hydratedPages[pageIndex] = { ...hydratedPages[pageIndex], html };
            }
          });
          options?.onUpdate?.({ ...basePreview, pages: [...hydratedPages] });
        },
      },
    )
    : hydratedPages.map((page) => page.html);
  generatedSvgPages.forEach((html, pageIndex) => {
    if (hydratedPages[pageIndex] !== undefined) {
      hydratedPages[pageIndex] = { ...hydratedPages[pageIndex], html };
    }
  });
  for (let pageIndex = 0; pageIndex < hydratedPages.length; pageIndex += 1) {
    const page = hydratedPages[pageIndex];
    hydratedPages[pageIndex] = {
      ...page,
      html: await renderMermaidPreviewHtml(page.html, {
        surface: "paper",
        theme: resolveMermaidPreviewTheme("paper"),
        revision: options?.revision ?? 0,
        httpsHosts: options?.plantumlHttpsHosts ?? [],
        signal: options?.signal,
        strict: options?.strictGeneratedSvg,
      }),
    };
    options?.onUpdate?.({ ...basePreview, pages: [...hydratedPages] });
  }
  return {
    ...basePreview,
    pages: hydratedPages,
    defaultPageStyle,
    defaultTextStyle,
  };
}

async function normalizeSessionPreview(
  cacheKey: string,
  state: SessionPreviewState,
  displayMode: import("../../domain/preview").PreviewDisplayMode,
  options: PreviewRenderOptions,
  previous: NormalizedSessionSections | null,
  changedIndices: readonly number[],
): Promise<{ readonly preview: NormalizedRenderedMarkdownPreviewPayload; readonly sections: NormalizedSessionSections }> {
  if (displayMode === "standard") {
    const changed = new Set(changedIndices);
    let sections = state.sections.map((section, index) => previous?.mode === "standard" && !changed.has(index)
      ? previous.sections[index]
      : section.map((page) => page.html).join(""));
    const build = (): NormalizedRenderedMarkdownPreviewPayload => ({
      mode: "standard",
      html: sections.join(""),
      sectionHtmls: sections,
      defaultPageStyle: state.defaultPageStyle,
      defaultTextStyle: normalizePreviewTextStyle(state.defaultTextStyle),
    });
    if (!options.signal?.aborted) options.onUpdate?.(build());
    for (const index of changedIndices) {
      const payload: RenderedPreviewPayload = {
        mode: "standard",
        html: state.sections[index].map((page) => page.html).join(""),
        defaultPageStyle: state.defaultPageStyle,
        defaultTextStyle: state.defaultTextStyle,
      };
      const normalized = await normalizeRenderedMarkdownPreview(payload, {
        ...options,
        generatedSvgSectionKey: String(index),
        onUpdate: (update) => {
          if (update.mode !== "standard" || options.signal?.aborted) return;
          sections = sections.map((section, sectionIndex) => sectionIndex === index ? update.html : section);
          const cached = normalizedSessionStates.get(cacheKey);
          if (cached?.revision === state.revision) {
            normalizedSessionStates.set(cacheKey, {
              ...cached,
              value: { mode: "standard", sections },
            });
          }
          options.onUpdate?.(build());
        },
      });
      if (normalized.mode === "standard") {
        sections = sections.map((section, sectionIndex) => sectionIndex === index ? normalized.html : section);
      }
    }
    const preview = build();
    if (!options.signal?.aborted) options.onUpdate?.(preview);
    return { preview, sections: { mode: "standard", sections } };
  }

  const changed = new Set(changedIndices);
  let sections = state.sections.map((section, index) => previous?.mode === "a4" && !changed.has(index)
    ? previous.sections[index]
    : section.map(normalizeRawPage));
  const build = (): NormalizedRenderedMarkdownPreviewPayload => ({
    mode: "a4",
    pages: sections.flat(),
    sectionPages: sections,
    defaultPageStyle: state.defaultPageStyle,
    defaultTextStyle: normalizePreviewTextStyle(state.defaultTextStyle),
  });
  if (!options.signal?.aborted) options.onUpdate?.(build());
  for (const index of changedIndices) {
    const payload: RenderedPreviewPayload = {
      mode: "a4",
      pages: [...state.sections[index]],
      defaultPageStyle: state.defaultPageStyle,
      defaultTextStyle: state.defaultTextStyle,
    };
    const normalized = await normalizeRenderedMarkdownPreview(payload, {
      ...options,
      generatedSvgSectionKey: String(index),
      onUpdate: (update) => {
        if (update.mode !== "a4" || options.signal?.aborted) return;
        sections = sections.map((section, sectionIndex) => sectionIndex === index ? update.pages : section);
        const cached = normalizedSessionStates.get(cacheKey);
        if (cached?.revision === state.revision) {
          normalizedSessionStates.set(cacheKey, {
            ...cached,
            value: { mode: "a4", sections },
          });
        }
        options.onUpdate?.(build());
      },
    });
    if (normalized.mode === "a4") {
      sections = sections.map((section, sectionIndex) => sectionIndex === index ? normalized.pages : section);
    }
  }
  const preview = build();
  if (!options.signal?.aborted) options.onUpdate?.(preview);
  return { preview, sections: { mode: "a4", sections } };
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

  pendingRequest.resolve(event.data);
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

function sendPreviewWorkerRequest(
  request: PreviewWorkerRequestInput,
): Promise<BrowserMarkdownPreviewWorkerResponse> {
  const worker = getPreviewWorker();
  const requestId = previewWorkerRequestId + 1;
  previewWorkerRequestId = requestId;

  return new Promise((resolve, reject) => {
    pendingPreviewWorkerRequests.set(requestId, { reject, resolve });
    worker.postMessage({ ...request, id: requestId } as BrowserMarkdownPreviewWorkerRequest);
  });
}

export async function bootstrapBrowserPreviewSession(input: {
  readonly sessionId: string;
  readonly content: string;
  readonly revision: number;
  readonly isDirty: boolean;
}): Promise<void> {
  const response = await sendPreviewWorkerRequest({ ...input, type: "bootstrap" });
  if (response.type !== "ready") {
    throw new Error("Preview Worker bootstrap応答が不正です。");
  }
}

export function registerBrowserPreviewSessionRecovery(
  sessionId: string,
  recover: () => Promise<void>,
): void {
  previewSessionRecoveryHandlers.set(sessionId, recover);
}

export async function applyBrowserPreviewMutation(
  sessionId: string,
  batch: EditorMutationBatchPayload,
): Promise<EditorMutationAckPayload> {
  const response = await sendPreviewWorkerRequest({ batch, sessionId, type: "mutation" });
  if (response.type !== "acknowledged") {
    throw new Error("Preview Worker mutation応答が不正です。");
  }
  return response.ack;
}

async function renderMarkdownPreviewWithWorker(
  sessionId: string,
  revision: number,
  baseRevision: number | null,
  filePath: string | null,
  displayMode: import("../../domain/preview").PreviewDisplayMode,
): Promise<SessionPreviewPayload> {
  const request = {
    baseRevision,
    displayMode,
    filePath,
    revision,
    sessionId,
    type: "render" as const,
  };
  let response: BrowserMarkdownPreviewWorkerResponse;
  try {
    response = await sendPreviewWorkerRequest(request);
  } catch (error) {
    const recover = previewSessionRecoveryHandlers.get(sessionId);
    if (recover === undefined) {
      throw error;
    }
    await recover();
    response = await sendPreviewWorkerRequest(request);
  }
  if (response.type !== "rendered") {
    throw new Error("Preview Worker render応答が不正です。");
  }
  return response.renderedPreview;
}

export async function renderMarkdownPreview(
  content: string | null,
  filePath: string | null,
  displayMode: import("../../domain/preview").PreviewDisplayMode,
  options?: PreviewRenderOptions,
): Promise<NormalizedRenderedMarkdownPreviewPayload> {
  if (options?.documentSessionId !== undefined && options.documentRevision !== undefined) {
    const sessionId = options.documentSessionId;
    const documentRevision = options.documentRevision;
    const key = `${options.documentKey}:${sessionId}`;
    const current = sessionPreviewStates.get(key) ?? null;
    const request = (baseRevision: number | null) => isTauri()
      ? invokeTauriCommand<SessionPreviewPayload>(
        "render_editor_session_preview",
        {
          sessionId,
          revision: documentRevision,
          baseRevision,
          displayMode,
        },
        "Editor Sessionのプレビュー描画に失敗しました。",
      )
      : renderMarkdownPreviewWithWorker(
        sessionId,
        documentRevision,
        baseRevision,
        filePath,
        displayMode,
      );
    let response = await request(current?.revision ?? null);
    let next = applySessionPreviewResponse(current, response);
    if (next === null) {
      response = await request(null);
      next = applySessionPreviewResponse(null, response);
    }
    if (next === null || next.revision !== documentRevision) {
      throw new Error("Preview Sectionのrevisionが一致しません。");
    }
    if (options.signal?.aborted) {
      throw new DOMException("Preview request aborted", "AbortError");
    }
    for (let index = next.sections.length; index < (current?.sections.length ?? 0); index += 1) {
      discardGeneratedSvgPreviewSectionCache(options.documentKey, options.plantumlRenderEpoch, String(index), "standard");
      discardGeneratedSvgPreviewSectionCache(options.documentKey, options.plantumlRenderEpoch, String(index), "paper");
    }
    const previousNormalized = normalizedSessionStates.get(key);
    const renderKey = JSON.stringify([
      displayMode,
      options.plantumlRenderEpoch,
      options.plantumlHttpsHosts,
      options.strictGeneratedSvg,
      resolveMermaidPreviewTheme(displayMode === "a4" ? "paper" : "standard"),
    ]);
    const canReuseNormalized = previousNormalized !== undefined
      && previousNormalized.revision === current?.revision
      && previousNormalized.renderKey === renderKey
      && previousNormalized.value.mode === displayMode
      && previousNormalized.value.sections.length === next.sections.length;
    const changedIndices = canReuseNormalized
      ? changedSessionPreviewSectionIndices(current, next)
      : next.sections.map((_, index) => index);
    const normalized = await normalizeSessionPreview(
      key,
      next,
      displayMode,
      options,
      canReuseNormalized ? previousNormalized.value : null,
      changedIndices,
    );
    if (!options.signal?.aborted && (sessionPreviewStates.get(key)?.revision ?? -1) <= next.revision) {
      sessionPreviewStates.set(key, next);
      normalizedSessionStates.set(key, { revision: next.revision, renderKey, value: normalized.sections });
      if (sessionPreviewStates.size > MAX_PREVIEW_SESSION_CACHE_ENTRIES) {
        const oldest = sessionPreviewStates.keys().next().value;
        if (oldest !== undefined) {
          sessionPreviewStates.delete(oldest);
          normalizedSessionStates.delete(oldest);
        }
      }
    }
    return normalized.preview;
  }

  if (!isTauri()) {
    if (content === null) {
      throw new Error("Web Preview Sessionまたは本文Snapshotがありません。");
    }
    return normalizeRenderedMarkdownPreview(
      await renderMarkdownPreviewWithWasm(content, filePath, displayMode),
      options,
    );
  }

  const renderedPreview = await invokeTauriCommand<RenderedMarkdownPreviewPayload>(
      RENDER_MARKDOWN_PREVIEW_COMMAND,
      { content: content ?? "", displayMode, filePath },
      "プレビュー描画に失敗しました。",
    );

  return normalizeRenderedMarkdownPreview(renderedPreview, options);
}
