import {
  planPlantUmlDiagramUpdates,
  type PlantUmlDiagramDescriptor,
  type PlantUmlDiagramSnapshotDescriptor,
  type PlannedPlantUmlDiagram,
} from "../../application/plantuml/plantUmlRenderPlanner";
import { splitPlantUmlSourceWithWasm } from "../../wasm/kmarkWeb";
import { finalizeGeneratedSvg } from "./browserGeneratedSvgFinalizer";
import {
  getPlantUmlEngine,
  PLANTUML_VERSION,
} from "./browserPlantUmlEngine";
import { resolveKmarkMermaidThemeVariables } from "./browserMermaidTheme";
import {
  PLANTUML_DEBOUNCE_MS,
  PLANTUML_RAW_CACHE_MAX_BYTES,
  PLANTUML_RAW_CACHE_MAX_ENTRIES,
  prioritizePlantUmlItems,
} from "./browserPlantUmlPolicy";

const PLANTUML_BLOCK_SELECTOR = ".kmark-plantuml-block";
const PLANTUML_RENDERED_SELECTOR = ".kmark-plantuml-rendered";
const PLANTUML_SOURCE_SELECTOR = ".kmark-plantuml-source code";

export type PlantUmlPreviewSurface = "standard" | "paper";

export type RenderPlantUmlHtmlOptions = {
  readonly revision: number;
  readonly documentKey: string;
  readonly plantumlRenderEpoch: number;
  readonly httpsHosts: readonly string[];
  readonly activeSourceLine?: number | null;
  readonly strict?: boolean;
  readonly signal?: AbortSignal;
  readonly surface?: PlantUmlPreviewSurface;
  readonly onUpdate?: (html: string) => void;
};

export type RenderPlantUmlHtmlDocumentsOptions = Omit<RenderPlantUmlHtmlOptions, "onUpdate"> & {
  readonly onUpdate?: (htmlDocuments: readonly string[]) => void;
};

type PlantUmlDiagramTask = {
  readonly cancel: () => void;
  readonly id: string;
  readonly promise: Promise<void>;
  readonly signature: string;
};

type PlantUmlDiagramRecord = {
  descriptor: PlantUmlDiagramDescriptor;
  error: string | null;
  failedSignature: string | null;
  finalizedSignature: string | null;
  finalizedSvg: string | null;
  generation: number;
  readonly instanceId: string;
  lastUsed: number;
  rawSignature: string | null;
  rawSvg: string | null;
  task: PlantUmlDiagramTask | null;
};

type PreparedBlock = {
  readonly block: HTMLElement;
  readonly rendered: HTMLElement | null;
  readonly sources: readonly string[];
  readonly splitError: unknown | null;
};

type PreparedDiagram = {
  readonly block: PreparedBlock;
  readonly descriptor: PlantUmlDiagramDescriptor;
  readonly diagramIndex: number;
  element: HTMLElement | null;
  plan: PlannedPlantUmlDiagram | null;
  readonly presentation: ReturnType<typeof presentationFor>;
  record: PlantUmlDiagramRecord | null;
  waitPromise: Promise<void> | null;
};

type PlantUmlSnapshotScope = {
  readonly key: string;
  readonly recordsBySurface: Map<PlantUmlPreviewSurface, PlantUmlDiagramRecord[]>;
};

let activeSnapshotScope: PlantUmlSnapshotScope | null = null;
let plantUmlTaskSequence = 0;
let snapshotAccessSequence = 0;

function abortError(): Error {
  return new DOMException("PlantUML render superseded", "AbortError");
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

function isDarkSurface(surface: PlantUmlPreviewSurface): boolean {
  if (surface === "paper") {
    return false;
  }
  return resolveKmarkMermaidThemeVariables("standard").darkMode === true;
}

function snapshotDescriptor(record: PlantUmlDiagramRecord): PlantUmlDiagramSnapshotDescriptor {
  return {
    failedSignature: record.failedSignature,
    finalizeSignature: record.finalizedSignature ?? "",
    generation: record.generation,
    hasFinalizedSvg: record.finalizedSvg !== null,
    hasRawSvg: record.rawSvg !== null,
    inFlightSignature: record.task?.signature ?? null,
    instanceId: record.instanceId,
    order: record.descriptor.order,
    rawSignature: record.rawSignature ?? "",
    source: record.descriptor.source,
  };
}

function cancelRecordTask(record: PlantUmlDiagramRecord): void {
  record.task?.cancel();
  record.task = null;
}

function activateSnapshotScope(documentKey: string, epoch: number): PlantUmlSnapshotScope {
  const scopeKey = `${documentKey}\u0000${epoch}`;
  if (activeSnapshotScope?.key === scopeKey) {
    return activeSnapshotScope;
  }
  if (activeSnapshotScope !== null) {
    for (const records of activeSnapshotScope.recordsBySurface.values()) {
      records.forEach(cancelRecordTask);
    }
  }
  getPlantUmlEngine().invalidateCache();
  activeSnapshotScope = {
    key: scopeKey,
    recordsBySurface: new Map(),
  };
  return activeSnapshotScope;
}

function assertActiveRenderRequest(
  scope: PlantUmlSnapshotScope,
  signal?: AbortSignal,
): void {
  if (signal?.aborted === true || activeSnapshotScope !== scope) {
    throw abortError();
  }
}

function recordPayloadBytes(record: PlantUmlDiagramRecord): number {
  return ((record.rawSvg?.length ?? 0) + (record.finalizedSvg?.length ?? 0)) * 2;
}

function enforceSnapshotPayloadLimit(scope: PlantUmlSnapshotScope): void {
  const records = [...scope.recordsBySurface.values()]
    .flat()
    .filter((record) => record.rawSvg !== null || record.finalizedSvg !== null)
    .sort((left, right) => left.lastUsed - right.lastUsed);
  let bytes = records.reduce((total, record) => total + recordPayloadBytes(record), 0);
  let entries = records.length;

  for (const record of records) {
    if (entries <= PLANTUML_RAW_CACHE_MAX_ENTRIES && bytes <= PLANTUML_RAW_CACHE_MAX_BYTES) {
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
  diagramPlan: PlannedPlantUmlDiagram,
  previousRecord: PlantUmlDiagramRecord | null,
): PlantUmlDiagramRecord {
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
  record: PlantUmlDiagramRecord,
  action: "finalize" | "render",
  dark: boolean,
  httpsHosts: readonly string[],
  scope: PlantUmlSnapshotScope,
  presentation: ReturnType<typeof presentationFor>,
): PlantUmlDiagramTask {
  const engine = getPlantUmlEngine();
  const taskAbortController = new AbortController();
  const taskRevision = plantUmlTaskSequence += 1;
  const taskId = `plantuml-${record.instanceId}-g${record.generation}-t${taskRevision}`;
  let task!: PlantUmlDiagramTask;
  const promise = (async () => {
    try {
      await delay(PLANTUML_DEBOUNCE_MS, taskAbortController.signal);
      let rawSvg = record.rawSvg;
      if (action === "render" || rawSvg === null || record.rawSignature !== record.descriptor.rawSignature) {
        rawSvg = await engine.render(
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
        renderId: `plantuml-${record.instanceId}-g${record.generation}`,
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
  element.dataset.kmarkPlantumlReuseKey = `${record.instanceId}:${record.generation}`;
  if (
    record.finalizedSvg !== null
    && record.finalizedSignature === record.descriptor.finalizeSignature
  ) {
    element.innerHTML = record.finalizedSvg;
    element.dataset.kmarkPlantumlDiagramState = "rendered";
    return;
  }
  if (record.finalizedSvg !== null) {
    element.innerHTML = record.finalizedSvg;
  }
  if (record.failedSignature === record.descriptor.finalizeSignature && record.error !== null) {
    element.append(createStatus(element.ownerDocument, "kmark-plantuml-error-message", record.error));
    element.dataset.kmarkPlantumlDiagramState = "error";
    return;
  }
  if (record.finalizedSvg !== null) {
    element.dataset.kmarkPlantumlDiagramState = "stale";
    return;
  }
  element.append(createStatus(element.ownerDocument, "kmark-plantuml-loading", "PlantUML生成中"));
  element.dataset.kmarkPlantumlDiagramState = "loading";
}

function updateBlockState(block: PreparedBlock): void {
  if (block.rendered === null || block.splitError !== null) {
    return;
  }
  if (block.rendered.querySelector('[data-kmark-plantuml-diagram-state="error"]') !== null) {
    block.block.dataset.kmarkPlantumlState = "error";
    return;
  }
  if (block.rendered.querySelector('[data-kmark-plantuml-diagram-state="loading"], [data-kmark-plantuml-diagram-state="stale"]') !== null) {
    block.block.dataset.kmarkPlantumlState = "rendering";
    return;
  }
  block.block.dataset.kmarkPlantumlState = "rendered";
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
  source: string,
  block: HTMLElement,
  order: number,
  dark: boolean,
  httpsHosts: readonly string[],
): PlantUmlDiagramDescriptor {
  const presentation = presentationFor(block);
  const rawSignature = JSON.stringify({
    dark,
    hosts: [...httpsHosts].sort(),
    source,
    version: PLANTUML_VERSION,
  });
  return {
    finalizeSignature: JSON.stringify({
      hosts: [...httpsHosts].sort(),
      presentation,
      rawSignature,
    }),
    order,
    rawSignature,
    source,
  };
}

export async function renderPlantUmlPreviewHtmlDocuments(
  htmlDocuments: readonly string[],
  options: RenderPlantUmlHtmlDocumentsOptions,
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
    Array.from(template.content.querySelectorAll<HTMLElement>(PLANTUML_BLOCK_SELECTOR))
  ));
  const preparedBlocks = await Promise.all(blocks.map(async (block): Promise<PreparedBlock> => {
    const source = block.querySelector<HTMLElement>(PLANTUML_SOURCE_SELECTOR)?.textContent ?? "";
    try {
      return {
        block,
        rendered: block.querySelector<HTMLElement>(PLANTUML_RENDERED_SELECTOR),
        sources: await splitPlantUmlSourceWithWasm(source),
        splitError: null,
      };
    } catch (error) {
      return {
        block,
        rendered: block.querySelector<HTMLElement>(PLANTUML_RENDERED_SELECTOR),
        sources: [],
        splitError: error,
      };
    }
  }));
  assertActiveRenderRequest(scope, options.signal);
  const dark = isDarkSurface(surface);
  let diagramOrder = 0;
  const diagramsByBlock = new Map<PreparedBlock, PreparedDiagram[]>();
  const preparedDiagrams: PreparedDiagram[] = [];
  for (const block of preparedBlocks) {
    const blockDiagrams = block.sources.map((source, diagramIndex): PreparedDiagram => ({
      block,
      descriptor: descriptorFor(source, block.block, diagramOrder += 1, dark, options.httpsHosts),
      diagramIndex,
      element: null,
      plan: null,
      presentation: presentationFor(block.block),
      record: null,
      waitPromise: null,
    }));
    diagramsByBlock.set(block, blockDiagrams);
    preparedDiagrams.push(...blockDiagrams);
  }
  const renderPlan = planPlantUmlDiagramUpdates(
    preparedDiagrams.map((diagram) => diagram.descriptor),
    previousRecords.map(snapshotDescriptor),
    () => crypto.randomUUID(),
  );
  const nextRecords = renderPlan.diagrams.map((diagramPlan, index) => {
    const previousRecord = diagramPlan.previousIndex === null
      ? null
      : previousRecords[diagramPlan.previousIndex] ?? null;
    const record = createRecord(diagramPlan, previousRecord);
    preparedDiagrams[index].plan = diagramPlan;
    preparedDiagrams[index].record = record;
    return record;
  });
  renderPlan.obsoletePreviousIndexes.forEach((index) => {
    const record = previousRecords[index];
    if (record !== undefined) {
      cancelRecordTask(record);
    }
  });
  scope.recordsBySurface.set(surface, nextRecords);

  for (const block of preparedBlocks) {
    if (block.rendered === null) {
      continue;
    }
    block.rendered.replaceChildren();
    if (block.splitError !== null) {
      block.rendered.append(createStatus(
        block.block.ownerDocument,
        "kmark-plantuml-error-message",
        errorMessage(block.splitError),
      ));
      block.block.dataset.kmarkPlantumlState = "error";
      continue;
    }
    for (const diagram of diagramsByBlock.get(block) ?? []) {
      const element = block.block.ownerDocument.createElement("div");
      element.className = "kmark-plantuml-diagram";
      element.dataset.kmarkPlantumlDiagramIndex = String(diagram.diagramIndex);
      diagram.element = element;
      syncDiagramElement(diagram);
      block.rendered.append(element);
    }
    updateBlockState(block);
  }

  const renderOrder = prioritizePlantUmlItems(preparedBlocks, options.activeSourceLine, sourceRange);
  for (const block of renderOrder) {
    for (const diagram of diagramsByBlock.get(block) ?? []) {
      const { plan, record } = diagram;
      if (plan === null || record === null) {
        continue;
      }
      if (plan.action === "render" || plan.action === "finalize") {
        diagram.waitPromise = startDiagramTask(
          record,
          plan.action,
          dark,
          options.httpsHosts,
          scope,
          diagram.presentation,
        ).promise;
      } else if (plan.action === "reuse-inflight") {
        diagram.waitPromise = record.task?.promise ?? null;
      }
    }
  }

  options.onUpdate?.(serializeTemplates(templates));

  const splitFailure = preparedBlocks.find((block) => block.splitError !== null)?.splitError;
  if (options.strict === true && splitFailure !== null && splitFailure !== undefined) {
    throw splitFailure;
  }
  const cachedFailure = preparedDiagrams.find((diagram) => (
    diagram.record?.failedSignature === diagram.descriptor.finalizeSignature
    && diagram.record.error !== null
  ));
  if (options.strict === true && cachedFailure?.record?.error !== undefined && cachedFailure.record.error !== null) {
    throw new Error(cachedFailure.record.error);
  }

  for (const block of renderOrder) {
    for (const diagram of diagramsByBlock.get(block) ?? []) {
      if (diagram.waitPromise === null) {
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
  }

  preparedBlocks.forEach(updateBlockState);
  enforceSnapshotPayloadLimit(scope);
  assertActiveRenderRequest(scope, options.signal);
  return serializeTemplates(templates);
}

export async function renderPlantUmlPreviewHtml(
  html: string,
  options: RenderPlantUmlHtmlOptions,
): Promise<string> {
  const result = await renderPlantUmlPreviewHtmlDocuments([html], {
    ...options,
    onUpdate: (documents) => options.onUpdate?.(documents[0] ?? ""),
  });
  return result[0] ?? "";
}
