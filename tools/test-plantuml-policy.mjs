import assert from "node:assert/strict";
import test from "node:test";

import { withTransparentDotBackground } from "../src/adapters/browser/browserDotSource.ts";
import {
  GENERATED_SVG_DEBOUNCE_MS,
  GeneratedSvgRawCache,
  prioritizeGeneratedSvgItems,
  shouldCacheGeneratedSvgSource,
} from "../src/adapters/browser/browserPlantUmlPolicy.ts";
import { planGeneratedSvgDiagramUpdates } from "../src/application/plantuml/plantUmlRenderPlanner.ts";
import { normalizePlantUmlHttpsHostsText } from "../src/domain/preview.ts";
import { shouldPreserveGeneratedSvgDiagramDom } from "../src/ui/components/plantUmlPreviewPolicy.ts";

function descriptor(source, presentation = "default", rawContext = "light", engine = "plantuml") {
  const rawSignature = `${engine}\u0000${rawContext}\u0000${source}`;
  return {
    engine,
    finalizeSignature: `${rawSignature}\u0000${presentation}`,
    rawSignature,
    source,
  };
}

function snapshot(next, instanceId, overrides = {}) {
  return {
    failedSignature: null,
    finalizeSignature: next.finalizeSignature,
    generation: 1,
    hasFinalizedSvg: true,
    hasRawSvg: true,
    inFlightSignature: null,
    instanceId,
    rawSignature: next.rawSignature,
    ...overrides,
  };
}

test("uses the accepted realtime debounce", () => {
  assert.equal(GENERATED_SVG_DEBOUNCE_MS, 250);
});

test("injects transparent DOT background at the root body without overriding user statements", () => {
  assert.equal(
    withTransparentDotBackground('strict digraph "name{part" /* { */ { bgcolor=pink; A -> B }'),
    'strict digraph "name{part" /* { */ {\nbgcolor=transparent; bgcolor=pink; A -> B }',
  );
  assert.equal(withTransparentDotBackground("digraph G"), "digraph G");
});

test("preserves generated SVG DOM only while its render state is unchanged", () => {
  for (const state of ["error", "loading", "rendered", "stale"]) {
    assert.equal(shouldPreserveGeneratedSvgDiagramDom(state, state), true);
  }
  assert.equal(shouldPreserveGeneratedSvgDiagramDom("loading", "rendered"), false);
  assert.equal(shouldPreserveGeneratedSvgDiagramDom("stale", "rendered"), false);
  assert.equal(shouldPreserveGeneratedSvgDiagramDom("loading", "error"), false);
  assert.equal(shouldPreserveGeneratedSvgDiagramDom(undefined, undefined), false);
  assert.equal(shouldPreserveGeneratedSvgDiagramDom("unknown", "unknown"), false);
});

test("prioritizes the active generated SVG block and keeps remaining document order", () => {
  const items = [{ id: "a", range: [0, 3] }, { id: "b", range: [6, 10] }, { id: "c", range: [14, 20] }];
  assert.deepEqual(
    prioritizeGeneratedSvgItems(items, 8, (item) => item.range).map((item) => item.id),
    ["b", "a", "c"],
  );
});

test("LRU cache enforces entry and byte caps and rejects remote-resource caching", () => {
  const cache = new GeneratedSvgRawCache(2, 12);
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
  assert.equal(shouldCacheGeneratedSvgSource("@startuml\n@enduml"), true);
  assert.equal(shouldCacheGeneratedSvgSource("!includeurl https://example.test/a.puml"), false);
});

test("normalizes exact HTTPS hosts and rejects wildcards atomically", () => {
  assert.deepEqual(
    normalizePlantUmlHttpsHostsText(" CDN.Example.test:8443 \ncdn.example.test:8443\ndefault.example.test:443"),
    ["cdn.example.test:8443", "default.example.test"],
  );
  assert.throws(() => normalizePlantUmlHttpsHostsText("good.test\n*.bad.test"));
});

test("retains the indexed record while PlantUML source changes", () => {
  const previous = [
    snapshot(descriptor("A"), "a"),
    snapshot(descriptor("B"), "b"),
    snapshot(descriptor("C"), "c"),
  ];
  const plan = planGeneratedSvgDiagramUpdates(
    [descriptor("A"), descriptor("B2"), descriptor("C")],
    previous,
    () => "unused",
  );

  assert.deepEqual(plan.map((item) => [item.instanceId, item.action, item.generation]), [
    ["a", "reuse-finalized", 1],
    ["b", "render", 2],
    ["c", "reuse-finalized", 1],
  ]);
});

test("does not track reordered diagrams beyond their display index", () => {
  const first = descriptor("A");
  const second = descriptor("B");
  const plan = planGeneratedSvgDiagramUpdates(
    [second, first],
    [snapshot(first, "slot-1"), snapshot(second, "slot-2")],
    () => "unused",
  );

  assert.deepEqual(plan.map((item) => [item.instanceId, item.action]), [
    ["slot-1", "render"],
    ["slot-2", "render"],
  ]);
});

test("does not reuse a diagram slot across generated SVG engines", () => {
  const dot = descriptor("digraph G { A -> B }", "default", "light", "dot");
  const plantUml = descriptor("digraph G { A -> B }");
  const plan = planGeneratedSvgDiagramUpdates(
    [plantUml],
    [snapshot(dot, "slot-1")],
    () => "unused",
  );

  assert.deepEqual(plan.map((item) => [item.instanceId, item.action, item.generation]), [
    ["slot-1", "render", 2],
  ]);
});

test("reuses raw SVG for Kmark-only changes and rerenders raw-context changes", () => {
  const previousDescriptor = descriptor("A", "width=10", "light");
  const previous = [snapshot(previousDescriptor, "a")];

  const presentationPlan = planGeneratedSvgDiagramUpdates(
    [descriptor("A", "width=20", "light")],
    previous,
    () => "unused",
  );
  assert.equal(presentationPlan[0].action, "finalize");

  const darkPlan = planGeneratedSvgDiagramUpdates(
    [descriptor("A", "width=10", "dark")],
    previous,
    () => "unused",
  );
  assert.equal(darkPlan[0].action, "render");
});

test("retains stable completed, failed, and in-flight states by index", () => {
  const first = descriptor("first");
  const second = descriptor("second");
  const third = descriptor("third");
  const previous = [
    snapshot(first, "first"),
    snapshot(second, "second", { failedSignature: second.finalizeSignature, hasFinalizedSvg: false }),
    snapshot(third, "third", {
      hasFinalizedSvg: false,
      hasRawSvg: false,
      inFlightSignature: third.finalizeSignature,
    }),
  ];
  const plan = planGeneratedSvgDiagramUpdates([first, second, third], previous, () => "unused");

  assert.deepEqual(plan.map((item) => item.action), ["reuse-finalized", "reuse-error", "reuse-inflight"]);
  assert.deepEqual(plan.map((item) => item.generation), [1, 1, 1]);
});

test("creates records only for appended diagrams and drops removed indexes", () => {
  const first = descriptor("first");
  const second = descriptor("second");
  const previous = [snapshot(first, "first"), snapshot(second, "second")];
  let nextId = 0;
  const appendedPlan = planGeneratedSvgDiagramUpdates(
    [first, second, descriptor("third")],
    previous,
    () => `new-${nextId += 1}`,
  );
  const reducedPlan = planGeneratedSvgDiagramUpdates([first], previous, () => "unused");

  assert.deepEqual(appendedPlan.map((item) => [item.instanceId, item.action]), [
    ["first", "reuse-finalized"],
    ["second", "reuse-finalized"],
    ["new-1", "render"],
  ]);
  assert.equal(reducedPlan.length, 1);
});
