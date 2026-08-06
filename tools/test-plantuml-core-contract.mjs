import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("node_modules/@plantuml/core/package.json", "utf8"));
const source = readFileSync("node_modules/@plantuml/core/plantuml.js", "utf8");

assert.equal(packageJson.version, "1.2026.6", "@plantuml/core must remain exactly pinned");
assert.equal(packageJson.license, "MIT");
assert.match(source, /export\{[A-Za-z_$][\w$]* as render,[A-Za-z_$][\w$]* as renderToString\};/u);
assert.ok(
  source.includes("D=(b,c,d,e)=>"),
  "pinned renderToString implementation must retain its fourth options argument",
);

console.log("PlantUML core contract: OK");
