import { splitPlantUmlSourceWithWasm } from "../../wasm/kmarkWeb";
import { finalizeGeneratedSvg } from "./browserGeneratedSvgFinalizer";
import { getPlantUmlEngine } from "./browserPlantUmlEngine";
import { resolveKmarkMermaidThemeVariables } from "./browserMermaidTheme";
import {
  PLANTUML_DEBOUNCE_MS,
  PLANTUML_RAW_CACHE_MAX_BYTES,
  PLANTUML_RAW_CACHE_MAX_ENTRIES,
  prioritizePlantUmlItems,
  shouldCachePlantUmlSource,
} from "./browserPlantUmlPolicy";

const PLANTUML_BLOCK_SELECTOR = ".kmark-plantuml-block";
const PLANTUML_RENDERED_SELECTOR = ".kmark-plantuml-rendered";
const PLANTUML_SOURCE_SELECTOR = ".kmark-plantuml-source code";

export type PlantUmlPreviewSurface = "standard" | "paper";

export type RenderPlantUmlHtmlOptions = {
  readonly revision: number;
  readonly documentKey: string;
  readonly httpsHosts: readonly string[];
  readonly activeSourceLine?: number | null;
  readonly strict?: boolean;
  readonly signal?: AbortSignal;
  readonly surface?: PlantUmlPreviewSurface;
  readonly onUpdate?: (html: string) => void;
};

type LastRenderedDiagram = {
  readonly bytes: number;
  readonly svg: string;
};

const lastRenderedDiagrams = new Map<string, LastRenderedDiagram>();
let lastRenderedDiagramBytes = 0;

function getLastRenderedDiagram(identity: string): LastRenderedDiagram | undefined {
  const value = lastRenderedDiagrams.get(identity);
  if (value !== undefined) {
    lastRenderedDiagrams.delete(identity);
    lastRenderedDiagrams.set(identity, value);
  }
  return value;
}

function setLastRenderedDiagram(identity: string, svg: string): void {
  const existing = lastRenderedDiagrams.get(identity);
  if (existing !== undefined) {
    lastRenderedDiagramBytes -= existing.bytes;
    lastRenderedDiagrams.delete(identity);
  }
  const value = { bytes: svg.length * 2, svg };
  lastRenderedDiagrams.set(identity, value);
  lastRenderedDiagramBytes += value.bytes;
  while (
    lastRenderedDiagrams.size > PLANTUML_RAW_CACHE_MAX_ENTRIES
    || lastRenderedDiagramBytes > PLANTUML_RAW_CACHE_MAX_BYTES
  ) {
    const oldestKey = lastRenderedDiagrams.keys().next().value as string | undefined;
    if (oldestKey === undefined) {
      break;
    }
    lastRenderedDiagramBytes -= lastRenderedDiagrams.get(oldestKey)?.bytes ?? 0;
    lastRenderedDiagrams.delete(oldestKey);
  }
}

function deleteLastRenderedDiagram(identity: string): void {
  const existing = lastRenderedDiagrams.get(identity);
  if (existing === undefined) {
    return;
  }
  lastRenderedDiagramBytes -= existing.bytes;
  lastRenderedDiagrams.delete(identity);
}

function abortError(): Error {
  return new DOMException("PlantUML render superseded", "AbortError");
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    }, { once: true });
  });
}

function blockIdentity(documentKey: string, block: HTMLElement, diagramIndex: number): string {
  return `${documentKey}:${block.dataset.sourceLineStart ?? "?"}:${diagramIndex}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function createStatus(ownerDocument: Document, className: string, message: string): HTMLElement {
  const status = ownerDocument.createElement("div");
  status.className = className;
  status.textContent = message;
  return status;
}

function presentationFor(block: HTMLElement) {
  return {
    rootStyle: block.dataset.kmarkGeneratedSvgStyle ?? null,
    position: block.dataset.kmarkGeneratedSvgPosition ?? null,
  };
}

function isDarkSurface(surface: PlantUmlPreviewSurface): boolean {
  if (surface === "paper") {
    return false;
  }
  return resolveKmarkMermaidThemeVariables("standard").darkMode === true;
}

export async function renderPlantUmlPreviewHtml(
  html: string,
  options: RenderPlantUmlHtmlOptions,
): Promise<string> {
  const engine = getPlantUmlEngine();
  const jobId = `${options.documentKey}:${options.revision}:${crypto.randomUUID()}`;
  engine.beginRevision(jobId);
  const cancelJob = () => engine.cancelRevision(jobId);
  if (options.signal?.aborted === true) {
    cancelJob();
  } else {
    options.signal?.addEventListener("abort", cancelJob, { once: true });
  }
  if (!html.includes("kmark-plantuml-block")) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const blocks = Array.from(template.content.querySelectorAll<HTMLElement>(PLANTUML_BLOCK_SELECTOR));
  const preparedBlocks = await Promise.all(blocks.map(async (block) => {
    const source = block.querySelector<HTMLElement>(PLANTUML_SOURCE_SELECTOR)?.textContent ?? "";
    try {
      return { block, sources: await splitPlantUmlSourceWithWasm(source), splitError: null };
    } catch (error) {
      return { block, sources: [] as readonly string[], splitError: error };
    }
  }));
  const renderOrder = prioritizePlantUmlItems(
    preparedBlocks,
    options.activeSourceLine,
    (item) => {
      const start = Number(item.block.dataset.sourceLineStart);
      const end = Number(item.block.dataset.sourceLineEnd);
      return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null;
    },
  );

  for (const { block, sources, splitError } of renderOrder) {
    const rendered = block.querySelector<HTMLElement>(PLANTUML_RENDERED_SELECTOR);
    if (rendered === null) {
      continue;
    }
    rendered.replaceChildren();
    if (splitError !== null) {
      rendered.append(createStatus(block.ownerDocument, "kmark-plantuml-error-message", errorMessage(splitError)));
      block.dataset.kmarkPlantumlState = "error";
      continue;
    }
    sources.forEach((diagramSource, diagramIndex) => {
      const item = block.ownerDocument.createElement("div");
      item.className = "kmark-plantuml-diagram";
      item.dataset.kmarkPlantumlDiagramIndex = String(diagramIndex);
      const identity = blockIdentity(options.documentKey, block, diagramIndex);
      const cacheable = shouldCachePlantUmlSource(diagramSource);
      const previous = cacheable
        ? getLastRenderedDiagram(identity)
        : undefined;
      if (!cacheable) {
        deleteLastRenderedDiagram(identity);
      }
      if (previous !== undefined) {
        item.innerHTML = previous.svg;
        item.dataset.kmarkPlantumlDiagramState = "stale";
      } else {
        item.append(createStatus(block.ownerDocument, "kmark-plantuml-loading", "PlantUML生成中"));
        item.dataset.kmarkPlantumlDiagramState = "loading";
      }
      rendered.append(item);
    });
    block.dataset.kmarkPlantumlState = "rendering";
  }
  options.onUpdate?.(template.innerHTML);

  if (options.strict === true) {
    const splitFailure = preparedBlocks.find((item) => item.splitError !== null)?.splitError;
    if (splitFailure !== null && splitFailure !== undefined) {
      throw splitFailure;
    }
  }

  await delay(PLANTUML_DEBOUNCE_MS, options.signal);
  if (options.signal?.aborted === true) {
    throw abortError();
  }
  const dark = isDarkSurface(options.surface ?? "standard");

  for (const { block, sources, splitError } of renderOrder) {
    if (splitError !== null) {
      continue;
    }
    const rendered = block.querySelector<HTMLElement>(PLANTUML_RENDERED_SELECTOR);
    if (rendered === null) {
      continue;
    }
    for (let diagramIndex = 0; diagramIndex < sources.length; diagramIndex += 1) {
      if (isAborted(options.signal)) {
        throw abortError();
      }
      const item = rendered.querySelector<HTMLElement>(
        `[data-kmark-plantuml-diagram-index="${diagramIndex}"]`,
      );
      if (item === null) {
        continue;
      }
      const identity = blockIdentity(options.documentKey, block, diagramIndex);
      try {
        const rawSvg = await engine.render(
          sources[diagramIndex],
          dark,
          jobId,
          options.httpsHosts,
        );
        const renderId = `plantuml-r${options.revision}-b${block.dataset.kmarkGeneratedSvgIndex ?? "0"}-d${diagramIndex}`;
        const finalized = await finalizeGeneratedSvg({
          revision: options.revision,
          renderId,
          rawSvg,
          presentation: presentationFor(block),
        }, options.httpsHosts);
        if (isAborted(options.signal) || finalized.revision !== options.revision) {
          throw abortError();
        }
        item.innerHTML = finalized.svg;
        item.dataset.kmarkPlantumlDiagramState = "rendered";
        if (shouldCachePlantUmlSource(sources[diagramIndex])) {
          setLastRenderedDiagram(identity, finalized.svg);
        } else {
          deleteLastRenderedDiagram(identity);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        if (options.strict === true) {
          throw error;
        }
        const oldSvg = getLastRenderedDiagram(identity)?.svg;
        item.replaceChildren();
        if (oldSvg !== undefined) {
          item.innerHTML = oldSvg;
        }
        item.append(createStatus(block.ownerDocument, "kmark-plantuml-error-message", errorMessage(error)));
        item.dataset.kmarkPlantumlDiagramState = "error";
      }
      options.onUpdate?.(template.innerHTML);
    }
    const hasError = rendered.querySelector('[data-kmark-plantuml-diagram-state="error"]') !== null;
    block.dataset.kmarkPlantumlState = hasError ? "error" : "rendered";
  }

  return template.innerHTML;
}
