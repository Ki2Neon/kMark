import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { test } from "vitest";
import { resolveBundledStdlibListingSource } from "../../src/adapters/browser/browserPlantUmlStdlib.ts";

const manifest = JSON.parse(readFileSync("src/adapters/browser/plantumlStdlibManifest.json", "utf8"));

test("pinned PlantUML core retains the required entry points and iframe CSP", () => {
  const packageJson = JSON.parse(readFileSync("node_modules/@plantuml/core/package.json", "utf8"));
  const source = readFileSync("node_modules/@plantuml/core/plantuml.js", "utf8");
  const engineSource = readFileSync("src/adapters/browser/browserPlantUmlEngine.ts", "utf8");

  assert.equal(packageJson.version, "1.2026.6");
  assert.equal(packageJson.license, "MIT");
  assert.match(source, /export\{[A-Za-z_$][\w$]* as render,[A-Za-z_$][\w$]* as renderToString\};/u);
  assert.ok(source.includes("D=(b,c,d,e)=>"), "renderToString fourth options argument changed");
  assert.match(engineSource, /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:/u);
  assert.doesNotMatch(engineSource, /script-src[^;]*\s'unsafe-eval'(?:\s|;)/u);
});

test("bundled PlantUML stdlib manifest matches local assets", () => {
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

test("stdlib diagnostic is converted to a deterministic local listing", () => {
  const input = "@startuml catalog\n' bundled libraries\nstdlib\n@enduml";
  const source = resolveBundledStdlibListingSource(input, manifest.assets);
  assert.notEqual(source, input);
  assert.ok(source.includes("| c4 | C4 (C4-PlantUML) | 2.13.0 |"));
  assert.equal((source.match(/^\| [a-z0-9.-]+ \|/gmu) ?? []).length, 33);
  assert.equal(
    resolveBundledStdlibListingSource("@startuml\nstdlib -> User\n@enduml", manifest.assets),
    "@startuml\nstdlib -> User\n@enduml",
  );
});
