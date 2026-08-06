import {
  planGeneratedSvgDiagramUpdates,
  type GeneratedSvgDiagramDescriptor,
  type GeneratedSvgDiagramSnapshotDescriptor,
  type PlannedGeneratedSvgDiagram,
} from "../../application/plantuml/plantUmlRenderPlanner";
import { normalizePlantUmlSourceWithWasm } from "../../wasm/kmarkWeb";
import { finalizeGeneratedSvg } from "./browserGeneratedSvgFinalizer";
import {
  getGeneratedSvgEngine,
  type GeneratedSvgEngineKind,
  PLANTUML_VERSION,
} from "./browserPlantUmlEngine";
import { resolveKmarkMermaidThemeVariables } from "./browserMermaidTheme";
import {
  GENERATED_SVG_DEBOUNCE_MS,
  GENERATED_SVG_RAW_CACHE_MAX_BYTES,
  GENERATED_SVG_RAW_CACHE_MAX_ENTRIES,
  prioritizeGeneratedSvgItems,
} from "./browserPlantUmlPolicy";

const GENERATED_SVG_BLOCK_SELECTOR = ".kmark-persistent-generated-svg-block";
const GENERATED_SVG_RENDERED_SELECTOR = ".kmark-persistent-generated-svg-rendered";
const GENERATED_SVG_SOURCE_SELECTOR = ".kmark-generated-svg-source code";

export type GeneratedSvgPreviewSurface = "standard" | "paper";

export type RenderGeneratedSvgHtmlOptions = {
  readonly revision: number;
  readonly documentKey: string;
  readonly plantumlRenderEpoch: number;
  readonly httpsHosts: readonly string[];
  readonly activeSourceLine?: number | null;
  readonly strict?: boolean;
  readonly signal?: AbortSignal;
  readonly surface?: GeneratedSvgPreviewSurface;
  readonly onUpdate?: (html: string) => void;
};

export type RenderGeneratedSvgHtmlDocumentsOptions = Omit<RenderGeneratedSvgHtmlOptions, "onUpdate"> & {
  readonly onUpdate?: (htmlDocuments: readonly string[]) => void;
};

type GeneratedSvgDiagramTask = {
  readonly cancel: () => void;
  readonly id: string;
  readonly promise: Promise<void>;
  readonly signature: string;
};

type GeneratedSvgDiagramRecord = {
  descriptor: GeneratedSvgDiagramDescriptor;
  error: string | null;
  failedSignature: string | null;
  finalizedSignature: string | null;
  finalizedSvg: string | null;
  generation: number;
  readonly instanceId: string;
  lastUsed: number;
  rawSignature: string | null;
  rawSvg: string | null;
  task: GeneratedSvgDiagramTask | null;
};

type PreparedBlock = {
  readonly block: HTMLElement;
  diagram: PreparedDiagram | null;
  readonly engine: GeneratedSvgEngineKind | null;
  readonly normalizationError: unknown | null;
  readonly rendered: HTMLElement | null;
  readonly source: string | null;
};

type PreparedDiagram = {
  readonly block: PreparedBlock;
  readonly descriptor: GeneratedSvgDiagramDescriptor;
  element: HTMLElement | null;
  plan: PlannedGeneratedSvgDiagram | null;
  readonly presentation: ReturnType<typeof presentationFor>;
  record: GeneratedSvgDiagramRecord | null;
  waitPromise: Promise<void> | null;
};

type GeneratedSvgSnapshotScope = {
  readonly key: string;
  readonly recordsBySurface: Map<GeneratedSvgPreviewSurface, GeneratedSvgDiagramRecord[]>;
};

let activeSnapshotScope: GeneratedSvgSnapshotScope | null = null;
let generatedSvgTaskSequence = 0;
let snapshotAccessSequence = 0;

function abortError(): Error {
  return new DOMException("Generated SVG render superseded", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function waitForTask(task: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) {
    return task;
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    task.then(
      () => {
        signal.removeEventListener("abort", handleAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
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

function isDarkSurface(surface: GeneratedSvgPreviewSurface): boolean {
  if (surface === "paper") {
    return false;
  }
  return resolveKmarkMermaidThemeVariables("standard").darkMode === true;
}

function snapshotDescriptor(record: GeneratedSvgDiagramRecord): GeneratedSvgDiagramSnapshotDescriptor {
  return {
    failedSignature: record.failedSignature,
    finalizeSignature: record.finalizedSignature ?? "",
    generation: record.generation,
    hasFinalizedSvg: record.finalizedSvg !== null,
    hasRawSvg: record.rawSvg !== null,
    inFlightSignature: record.task?.signature ?? null,
    instanceId: record.instanceId,
    rawSignature: record.rawSignature ?? "",
  };
}

function cancelRecordTask(record: GeneratedSvgDiagramRecord): void {
  record.task?.cancel();
  record.task = null;
}

function activateSnapshotScope(documentKey: string, epoch: number): GeneratedSvgSnapshotScope {
  const scopeKey = `${documentKey}\u0000${epoch}`;
  if (activeSnapshotScope?.key === scopeKey) {
    return activeSnapshotScope;
  }
  if (activeSnapshotScope !== null) {
    for (const records of activeSnapshotScope.recordsBySurface.values()) {
      records.forEach(cancelRecordTask);
    }
  }
  getGeneratedSvgEngine().invalidateCache();
  activeSnapshotScope = {
    key: scopeKey,
    recordsBySurface: new Map(),
  };
  return activeSnapshotScope;
}

function assertActiveRenderRequest(
  scope: GeneratedSvgSnapshotScope,
  signal?: AbortSignal,
): void {
  if (signal?.aborted === true || activeSnapshotScope !== scope) {
    throw abortError();
  }
}

function recordPayloadBytes(record: GeneratedSvgDiagramRecord): number {
  return ((record.rawSvg?.length ?? 0) + (record.finalizedSvg?.length ?? 0)) * 2;
}

function enforceSnapshotPayloadLimit(scope: GeneratedSvgSnapshotScope): void {
  const records = [...scope.recordsBySurface.values()]
    .flat()
    .filter((record) => record.rawSvg !== null || record.finalizedSvg !== null)
    .sort((left, right) => left.lastUsed - right.lastUsed);
  let bytes = records.reduce((total, record) => total + recordPayloadBytes(record), 0);
  let entries = records.length;

  for (const record of records) {
    if (entries <= GENERATED_SVG_RAW_CACHE_MAX_ENTRIES && bytes <= GENERATED_SVG_RAW_CACHE_MAX_BYTES) {
      break;
    }
    if (record.task !== null) {
      continue;
    }
    bytes -= recordPayloadBytes(record);
    entries -= 1;
    record.rawSvg = null;
    record.rawSignature = null;
    record.finalizedSvg = null;
    record.finalizedSignature = null;
  }
}

function createRecord(
  diagramPlan: PlannedGeneratedSvgDiagram,
  previousRecord: GeneratedSvgDiagramRecord | null,
): GeneratedSvgDiagramRecord {
  if (
    previousRecord !== null
    && (diagramPlan.action === "reuse-error"
      || diagramPlan.action === "reuse-finalized"
      || diagramPlan.action === "reuse-inflight")
  ) {
    previousRecord.descriptor = diagramPlan.descriptor;
    previousRecord.lastUsed = snapshotAccessSequence += 1;
    return previousRecord;
  }

  if (previousRecord !== null) {
    cancelRecordTask(previousRecord);
  }
  return {
    descriptor: diagramPlan.descriptor,
    error: null,
    failedSignature: null,
    finalizedSignature: previousRecord?.finalizedSignature ?? null,
    finalizedSvg: previousRecord?.finalizedSvg ?? null,
    generation: diagramPlan.generation,
    instanceId: diagramPlan.instanceId,
    lastUsed: snapshotAccessSequence += 1,
    rawSignature: previousRecord?.rawSignature ?? null,
    rawSvg: previousRecord?.rawSvg ?? null,
    task: null,
  };
}

function startDiagramTask(
  record: GeneratedSvgDiagramRecord,
  action: "finalize" | "render",
  dark: boolean,
  httpsHosts: readonly string[],
  scope: GeneratedSvgSnapshotScope,
  presentation: ReturnType<typeof presentationFor>,
): GeneratedSvgDiagramTask {
  const engine = getGeneratedSvgEngine();
  const taskAbortController = new AbortController();
  const taskRevision = generatedSvgTaskSequence += 1;
  const taskId = `${record.descriptor.engine}-${record.instanceId}-g${record.generation}-t${taskRevision}`;
  let task!: GeneratedSvgDiagramTask;
  const promise = (async () => {
    try {
      await delay(GENERATED_SVG_DEBOUNCE_MS, taskAbortController.signal);
      let rawSvg = record.rawSvg;
      if (action === "render" || rawSvg === null || record.rawSignature !== record.descriptor.rawSignature) {
        rawSvg = await engine.render(
          record.descriptor.engine,
          record.descriptor.source,
          dark,
          taskId,
          httpsHosts,
        );
        if (taskAbortController.signal.aborted || record.task !== task) {
          throw abortError();
        }
        record.rawSvg = rawSvg;
        record.rawSignature = record.descriptor.rawSignature;
      }
      const finalized = await finalizeGeneratedSvg({
        revision: taskRevision,
        renderId: `${record.descriptor.engine}-${record.instanceId}-g${record.generation}`,
        rawSvg,
        presentation,
        httpsHosts: [...httpsHosts],
      });
      if (
        taskAbortController.signal.aborted
        || record.task !== task
        || finalized.revision !== taskRevision
      ) {
        throw abortError();
      }
      record.error = null;
      record.failedSignature = null;
      record.finalizedSvg = finalized.svg;
      record.finalizedSignature = record.descriptor.finalizeSignature;
      record.lastUsed = snapshotAccessSequence += 1;
      enforceSnapshotPayloadLimit(scope);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (record.task === task) {
        record.error = errorMessage(error);
        record.failedSignature = record.descriptor.finalizeSignature;
        record.lastUsed = snapshotAccessSequence += 1;
      }
    } finally {
      if (record.task === task) {
        record.task = null;
      }
    }
  })();
  task = {
    cancel: () => {
      taskAbortController.abort();
      engine.cancel(taskId);
    },
    id: taskId,
    promise,
    signature: record.descriptor.finalizeSignature,
  };
  void promise.catch(() => {});
  record.task = task;
  return task;
}

function syncDiagramElement(diagram: PreparedDiagram): void {
  const { element, record } = diagram;
  if (element === null || record === null) {
    return;
  }
  element.replaceChildren();
  element.dataset.kmarkGeneratedSvgReuseKey = `${record.instanceId}:${record.generation}`;
  if (
    record.finalizedSvg !== null
    && record.finalizedSignature === record.descriptor.finalizeSignature
  ) {
    element.innerHTML = record.finalizedSvg;
    element.dataset.kmarkGeneratedSvgDiagramState = "rendered";
    return;
  }
  if (record.failedSignature === record.descriptor.finalizeSignature && record.error !== null) {
    element.append(createStatus(element.ownerDocument, "kmark-generated-svg-error-message", record.error));
    element.dataset.kmarkGeneratedSvgDiagramState = "error";
    return;
  }
  if (record.finalizedSvg !== null) {
    element.innerHTML = record.finalizedSvg;
    element.dataset.kmarkGeneratedSvgDiagramState = "stale";
    return;
  }
  const engineName = record.descriptor.engine === "dot" ? "DOT" : "PlantUML";
  element.append(createStatus(element.ownerDocument, "kmark-generated-svg-loading", `${engineName}生成中`));
  element.dataset.kmarkGeneratedSvgDiagramState = "loading";
}

function updateBlockState(block: PreparedBlock): void {
  if (block.rendered === null || block.normalizationError !== null) {
    return;
  }
  if (block.rendered.querySelector('[data-kmark-generated-svg-diagram-state="error"]') !== null) {
    block.block.dataset.kmarkGeneratedSvgState = "error";
    return;
  }
  if (block.rendered.querySelector('[data-kmark-generated-svg-diagram-state="loading"], [data-kmark-generated-svg-diagram-state="stale"]') !== null) {
    block.block.dataset.kmarkGeneratedSvgState = "rendering";
    return;
  }
  block.block.dataset.kmarkGeneratedSvgState = "rendered";
}

function serializeTemplates(templates: readonly HTMLTemplateElement[]): string[] {
  return templates.map((template) => template.innerHTML);
}

function sourceRange(block: PreparedBlock): readonly [number, number] | null {
  const start = Number(block.block.dataset.sourceLineStart);
  const end = Number(block.block.dataset.sourceLineEnd);
  return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null;
}

function descriptorFor(
  engine: GeneratedSvgEngineKind,
  source: string,
  block: HTMLElement,
  dark: boolean,
  httpsHosts: readonly string[],
): GeneratedSvgDiagramDescriptor {
  const presentation = presentationFor(block);
  const rawSignature = JSON.stringify({
    dark: engine === "plantuml" && dark,
    engine,
    hosts: engine === "plantuml" ? [...httpsHosts].sort() : [],
    source,
    version: PLANTUML_VERSION,
  });
  return {
    engine,
    finalizeSignature: JSON.stringify({
      hosts: [...httpsHosts].sort(),
      presentation,
      rawSignature,
    }),
    rawSignature,
    source,
  };
}

export async function renderGeneratedSvgPreviewHtmlDocuments(
  htmlDocuments: readonly string[],
  options: RenderGeneratedSvgHtmlDocumentsOptions,
): Promise<readonly string[]> {
  if (options.signal?.aborted === true) {
    throw abortError();
  }
  const surface = options.surface ?? "standard";
  const scope = activateSnapshotScope(options.documentKey, options.plantumlRenderEpoch);
  const previousRecords = scope.recordsBySurface.get(surface) ?? [];
  const templates = htmlDocuments.map((html) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template;
  });
  const blocks = templates.flatMap((template) => (
    Array.from(template.content.querySelectorAll<HTMLElement>(GENERATED_SVG_BLOCK_SELECTOR))
  ));
  const preparedBlocks = await Promise.all(blocks.map(async (block): Promise<PreparedBlock> => {
    const engine = block.dataset.kmarkGeneratedSvgEngine === "dot"
      ? "dot"
      : block.dataset.kmarkGeneratedSvgEngine === "plantuml"
        ? "plantuml"
        : null;
    const source = block.querySelector<HTMLElement>(GENERATED_SVG_SOURCE_SELECTOR)?.textContent ?? "";
    try {
      if (engine === null) {
        throw new Error("generated_svg_engine_invalid:Unknown generated SVG engine");
      }
      if (engine === "dot" && source.trim().length === 0) {
        throw new Error("dot_source_empty:DOT source is empty");
      }
      return {
        block,
        diagram: null,
        engine,
        normalizationError: null,
        rendered: block.querySelector<HTMLElement>(GENERATED_SVG_RENDERED_SELECTOR),
        source: engine === "plantuml" ? await normalizePlantUmlSourceWithWasm(source) : source,
      };
    } catch (error) {
      return {
        block,
        diagram: null,
        engine,
        normalizationError: error,
        rendered: block.querySelector<HTMLElement>(GENERATED_SVG_RENDERED_SELECTOR),
        source: null,
      };
    }
  }));
  assertActiveRenderRequest(scope, options.signal);
  const dark = isDarkSurface(surface);
  const preparedDiagrams: PreparedDiagram[] = [];
  for (const block of preparedBlocks) {
    if (block.source === null || block.engine === null) {
      continue;
    }
    const diagram: PreparedDiagram = {
      block,
      descriptor: descriptorFor(block.engine, block.source, block.block, dark, options.httpsHosts),
      element: null,
      plan: null,
      presentation: presentationFor(block.block),
      record: null,
      waitPromise: null,
    };
    block.diagram = diagram;
    preparedDiagrams.push(diagram);
  }
  const diagramPlans = planGeneratedSvgDiagramUpdates(
    preparedDiagrams.map((diagram) => diagram.descriptor),
    previousRecords.map(snapshotDescriptor),
    () => crypto.randomUUID(),
  );
  const nextRecords = diagramPlans.map((diagramPlan, index) => {
    const previousRecord = previousRecords[index] ?? null;
    const record = createRecord(diagramPlan, previousRecord);
    preparedDiagrams[index].plan = diagramPlan;
    preparedDiagrams[index].record = record;
    return record;
  });
  previousRecords.slice(nextRecords.length).forEach(cancelRecordTask);
  scope.recordsBySurface.set(surface, nextRecords);

  for (const block of preparedBlocks) {
    if (block.rendered === null) {
      continue;
    }
    block.rendered.replaceChildren();
    if (block.normalizationError !== null) {
      block.rendered.append(createStatus(
        block.block.ownerDocument,
        "kmark-generated-svg-error-message",
        errorMessage(block.normalizationError),
      ));
      block.block.dataset.kmarkGeneratedSvgState = "error";
      continue;
    }
    if (block.diagram !== null) {
      const element = block.block.ownerDocument.createElement("div");
      element.className = "kmark-persistent-generated-svg-diagram";
      block.diagram.element = element;
      syncDiagramElement(block.diagram);
      block.rendered.append(element);
    }
    updateBlockState(block);
  }

  const renderOrder = prioritizeGeneratedSvgItems(preparedBlocks, options.activeSourceLine, sourceRange);
  for (const block of renderOrder) {
    const diagram = block.diagram;
    if (diagram === null || diagram.plan === null || diagram.record === null) {
      continue;
    }
    if (diagram.plan.action === "render" || diagram.plan.action === "finalize") {
      diagram.waitPromise = startDiagramTask(
        diagram.record,
        diagram.plan.action,
        dark,
        options.httpsHosts,
        scope,
        diagram.presentation,
      ).promise;
    } else if (diagram.plan.action === "reuse-inflight") {
      diagram.waitPromise = diagram.record.task?.promise ?? null;
    }
  }

  options.onUpdate?.(serializeTemplates(templates));

  const normalizationFailure = preparedBlocks.find(
    (block) => block.normalizationError !== null,
  )?.normalizationError;
  if (options.strict === true && normalizationFailure !== null && normalizationFailure !== undefined) {
    throw normalizationFailure;
  }
  const cachedFailure = preparedDiagrams.find((diagram) => (
    diagram.record?.failedSignature === diagram.descriptor.finalizeSignature
    && diagram.record.error !== null
  ));
  if (options.strict === true && cachedFailure?.record?.error !== undefined && cachedFailure.record.error !== null) {
    throw new Error(cachedFailure.record.error);
  }

  for (const block of renderOrder) {
    const diagram = block.diagram;
    if (diagram === null || diagram.waitPromise === null) {
      continue;
    }
    await waitForTask(diagram.waitPromise, options.signal);
    syncDiagramElement(diagram);
    updateBlockState(block);
    if (
      options.strict === true
      && diagram.record?.failedSignature === diagram.descriptor.finalizeSignature
      && diagram.record.error !== null
    ) {
      throw new Error(diagram.record.error);
    }
    options.onUpdate?.(serializeTemplates(templates));
  }

  preparedBlocks.forEach(updateBlockState);
  enforceSnapshotPayloadLimit(scope);
  assertActiveRenderRequest(scope, options.signal);
  return serializeTemplates(templates);
}

export async function renderGeneratedSvgPreviewHtml(
  html: string,
  options: RenderGeneratedSvgHtmlOptions,
): Promise<string> {
  const result = await renderGeneratedSvgPreviewHtmlDocuments([html], {
    ...options,
    onUpdate: (documents) => options.onUpdate?.(documents[0] ?? ""),
  });
  return result[0] ?? "";
}
