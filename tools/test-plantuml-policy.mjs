import assert from "node:assert/strict";
import test from "node:test";

import {
  isCurrentPlantUmlRevision,
  PLANTUML_DEBOUNCE_MS,
  PlantUmlRawSvgCache,
  prioritizePlantUmlItems,
  shouldCachePlantUmlSource,
} from "../src/adapters/browser/browserPlantUmlPolicy.ts";
import { normalizePlantUmlHttpsHostsText } from "../src/domain/preview.ts";

test("uses the accepted realtime debounce and latest revision rule", () => {
  assert.equal(PLANTUML_DEBOUNCE_MS, 250);
  assert.equal(isCurrentPlantUmlRevision(4, 4), true);
  assert.equal(isCurrentPlantUmlRevision(3, 4), false);
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
