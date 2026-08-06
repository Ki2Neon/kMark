import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("node_modules/@plantuml/core/package.json", "utf8"));
const source = readFileSync("node_modules/@plantuml/core/plantuml.js", "utf8");
const engineSource = readFileSync("src/adapters/browser/browserPlantUmlEngine.ts", "utf8");

assert.equal(packageJson.version, "1.2026.6", "@plantuml/core must remain exactly pinned");
assert.equal(packageJson.license, "MIT");
assert.match(source, /export\{[A-Za-z_$][\w$]* as render,[A-Za-z_$][\w$]* as renderToString\};/u);
assert.ok(
  source.includes("D=(b,c,d,e)=>"),
  "pinned renderToString implementation must retain its fourth options argument",
);
assert.match(
  engineSource,
  /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:/u,
  "PlantUML iframe CSP must allow WebAssembly compilation",
);
assert.doesNotMatch(
  engineSource,
  /script-src[^;]*\s'unsafe-eval'(?:\s|;)/u,
  "PlantUML iframe CSP must not allow general JavaScript eval",
);

console.log("PlantUML core contract: OK");
