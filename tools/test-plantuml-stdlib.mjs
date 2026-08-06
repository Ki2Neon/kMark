import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import { resolveBundledStdlibListingSource } from "../src/adapters/browser/browserPlantUmlStdlib.ts";
import { renderPlantUmlTestSource } from "./test-plantuml-rendering.mjs";

const manifest = JSON.parse(readFileSync(
  "src/adapters/browser/plantumlStdlibManifest.json",
  "utf8",
));

test("pins and verifies every bundled PlantUML stdlib asset", () => {
  assert.equal(manifest.plantUmlCoreVersion, "1.2026.6");
  assert.equal(manifest.upstreamCommit, "6287b33c5d1be2f7b0d480687d0b5a1accbd7971");
  assert.equal(manifest.assets.length, 33);

  const files = new Set();
  const keys = new Set();
  for (const asset of manifest.assets) {
    assert.match(asset.file, /^[a-z0-9.-]+\.min\.js$/u);
    assert.ok(!files.has(asset.file), `duplicate asset file: ${asset.file}`);
    assert.ok(!keys.has(asset.key), `duplicate stdlib key: ${asset.key}`);
    files.add(asset.file);
    keys.add(asset.key);

    const path = `vendor/plantuml-stdlib/${asset.file}`;
    assert.equal(statSync(path).size, asset.bytes, `size mismatch: ${asset.file}`);
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      asset.sha256,
      `SHA-256 mismatch: ${asset.file}`,
    );
  }
});

test("converts only the stdlib diagnostic into a deterministic listing", async () => {
  const input = "@startuml catalog\n' bundled libraries\nstdlib\n@enduml";
  const source = resolveBundledStdlibListingSource(input, manifest.assets);
  assert.notEqual(source, input);
  assert.ok(source.includes("| c4 | C4 (C4-PlantUML) | 2.13.0 |"));
  assert.equal((source.match(/^\| [a-z0-9.-]+ \|/gmu) ?? []).length, 33);

  const svg = (await renderPlantUmlTestSource(source, false)).join("\n");
  assert.match(svg, /^<svg\b/u);
  assert.ok(svg.includes("Bundled PlantUML Standard Libraries"));
  assert.ok(!/Syntax Error|Fatal parsing error/u.test(svg));

  const ordinary = "@startuml\nstdlib -> User\n@enduml";
  assert.equal(resolveBundledStdlibListingSource(ordinary, manifest.assets), ordinary);
});

test("fails an unknown stdlib include without a network fallback", async () => {
  const svg = (await renderPlantUmlTestSource(
    "@startuml\n!include <missing/X>\n@enduml",
    false,
  )).join("\n");

  assert.match(svg, /^<svg\b/u);
  assert.match(svg, /Fatal parsing error|cannot include|Syntax Error/u);
});
