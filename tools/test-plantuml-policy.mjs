import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANTUML_DEBOUNCE_MS,
  PlantUmlRawSvgCache,
  prioritizePlantUmlItems,
  shouldCachePlantUmlSource,
} from "../src/adapters/browser/browserPlantUmlPolicy.ts";
import { planPlantUmlDiagramUpdates } from "../src/application/plantuml/plantUmlRenderPlanner.ts";
import { normalizePlantUmlHttpsHostsText } from "../src/domain/preview.ts";
import { shouldPreservePlantUmlDiagramDom } from "../src/ui/components/plantUmlPreviewPolicy.ts";

function descriptor(source, order, presentation = "default", rawContext = "light") {
  const rawSignature = `${rawContext}\u0000${source}`;
  return {
    finalizeSignature: `${rawSignature}\u0000${presentation}`,
    order,
    rawSignature,
    source,
  };
}

function snapshot(next, instanceId, overrides = {}) {
  return {
    ...next,
    failedSignature: null,
    generation: 1,
    hasFinalizedSvg: true,
    hasRawSvg: true,
    inFlightSignature: null,
    instanceId,
    ...overrides,
  };
}

test("uses the accepted realtime debounce", () => {
  assert.equal(PLANTUML_DEBOUNCE_MS, 250);
});

test("preserves PlantUML DOM only while its render state is unchanged", () => {
  for (const state of ["error", "loading", "rendered", "stale"]) {
    assert.equal(shouldPreservePlantUmlDiagramDom(state, state), true);
  }
  assert.equal(shouldPreservePlantUmlDiagramDom("loading", "rendered"), false);
  assert.equal(shouldPreservePlantUmlDiagramDom("stale", "rendered"), false);
  assert.equal(shouldPreservePlantUmlDiagramDom("loading", "error"), false);
  assert.equal(shouldPreservePlantUmlDiagramDom(undefined, undefined), false);
  assert.equal(shouldPreservePlantUmlDiagramDom("unknown", "unknown"), false);
});

test("prioritizes the active PlantUML block and keeps remaining document order", () => {
  const items = [{ id: "a", range: [0, 3] }, { id: "b", range: [6, 10] }, { id: "c", range: [14, 20] }];
  assert.deepEqual(
    prioritizePlantUmlItems(items, 8, (item) => item.range).map((item) => item.id),
    ["b", "a", "c"],
  );
});

test("LRU cache enforces entry and byte caps and rejects remote-resource caching", () => {
  const cache = new PlantUmlRawSvgCache(2, 12);
  cache.put("a", { bytes: 4, source: "a", svg: "A" });
  cache.put("b", { bytes: 4, source: "b", svg: "B" });
  assert.equal(cache.get("a", "a"), "A");
  cache.put("c", { bytes: 8, source: "c", svg: "C" });
  assert.equal(cache.get("b", "b"), null);
  assert.equal(cache.entryCount, 2);
  assert.equal(cache.byteCount, 12);
  cache.clear();
  assert.equal(cache.entryCount, 0);
  assert.equal(cache.byteCount, 0);
  assert.equal(shouldCachePlantUmlSource("@startuml\n@enduml"), true);
  assert.equal(shouldCachePlantUmlSource("!includeurl https://example.test/a.puml"), false);
});

test("normalizes exact HTTPS hosts and rejects wildcards atomically", () => {
  assert.deepEqual(
    normalizePlantUmlHttpsHostsText(" CDN.Example.test:8443 \ncdn.example.test:8443\ndefault.example.test:443"),
    ["cdn.example.test:8443", "default.example.test"],
  );
  assert.throws(() => normalizePlantUmlHttpsHostsText("good.test\n*.bad.test"));
});

test("plans only the changed diagram and tracks unchanged diagrams across moves", () => {
  const previous = [
    snapshot(descriptor("A", 0), "a"),
    snapshot(descriptor("B", 1), "b"),
    snapshot(descriptor("C", 2), "c"),
  ];
  let nextId = 0;
  const plan = planPlantUmlDiagramUpdates(
    [descriptor("C", 0), descriptor("B2", 1), descriptor("A", 2)],
    previous,
    () => `new-${nextId += 1}`,
  );

  assert.deepEqual(plan.diagrams.map((item) => [item.instanceId, item.action]), [
    ["c", "reuse-finalized"],
    ["new-1", "render"],
    ["a", "reuse-finalized"],
  ]);
  assert.deepEqual(plan.obsoletePreviousIndexes, [1]);
});

test("reuses raw SVG for Kmark-only changes and rerenders raw-context changes", () => {
  const previousDescriptor = descriptor("A", 0, "width=10", "light");
  const previous = [snapshot(previousDescriptor, "a")];

  const presentationPlan = planPlantUmlDiagramUpdates(
    [descriptor("A", 0, "width=20", "light")],
    previous,
    () => "unused",
  );
  assert.equal(presentationPlan.diagrams[0].action, "finalize");

  const darkPlan = planPlantUmlDiagramUpdates(
    [descriptor("A", 0, "width=10", "dark")],
    previous,
    () => "unused",
  );
  assert.equal(darkPlan.diagrams[0].action, "render");
});

test("matches duplicate sources one-to-one and retains a stable failure", () => {
  const first = descriptor("same", 0);
  const second = descriptor("same", 1);
  const previous = [
    snapshot(first, "same-1"),
    snapshot(second, "same-2", { failedSignature: second.finalizeSignature, hasFinalizedSvg: false }),
  ];
  const plan = planPlantUmlDiagramUpdates([second, first], previous, () => "unused");

  assert.equal(new Set(plan.diagrams.map((item) => item.instanceId)).size, 2);
  assert.deepEqual(plan.diagrams.map((item) => item.action), ["reuse-error", "reuse-finalized"]);
});

test("keeps an unchanged in-flight diagram across Markdown revisions", () => {
  const item = descriptor("A", 0);
  const previous = [snapshot(item, "a", {
    hasFinalizedSvg: false,
    hasRawSvg: false,
    inFlightSignature: item.finalizeSignature,
  })];
  const plan = planPlantUmlDiagramUpdates([item], previous, () => "unused");

  assert.equal(plan.diagrams[0].action, "reuse-inflight");
  assert.equal(plan.diagrams[0].generation, 1);
});

test("matches duplicate sources to the same presentation before position", () => {
  const narrow = descriptor("same", 0, "width=10");
  const wide = descriptor("same", 1, "width=20");
  const previous = [
    snapshot(narrow, "narrow", { failedSignature: narrow.finalizeSignature, hasFinalizedSvg: false }),
    snapshot(wide, "wide", {
      hasFinalizedSvg: false,
      hasRawSvg: false,
      inFlightSignature: wide.finalizeSignature,
    }),
  ];
  const plan = planPlantUmlDiagramUpdates(
    [{ ...wide, order: 0 }, { ...narrow, order: 1 }],
    previous,
    () => "unused",
  );

  assert.deepEqual(plan.diagrams.map((item) => [item.instanceId, item.action]), [
    ["wide", "reuse-inflight"],
    ["narrow", "reuse-error"],
  ]);
});
