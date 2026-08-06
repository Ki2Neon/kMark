import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import initKmarkWeb, {
  finalize_generated_svg_json as finalizeGeneratedSvgJson,
  normalize_plantuml_source as normalizePlantUmlSource,
  render_markdown_preview_json as renderMarkdownPreviewJson,
} from "../src/wasm/pkg/kmark_web.js";
import {
  renderedPlantUmlSamples,
  renderDotTestSource,
  renderPlantUmlTestSource,
} from "./test-plantuml-rendering.mjs";

const wasmBytes = await readFile(new URL("../src/wasm/pkg/kmark_web_bg.wasm", import.meta.url));
await initKmarkWeb({ module_or_path: wasmBytes });

function decodeHtmlText(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function extractPlantUmlSource(markdown) {
  const preview = JSON.parse(renderMarkdownPreviewJson(markdown, null, "a4"));
  const html = preview.pages.map((page) => page.html).join("");
  const match = html.match(/data-kmark-generated-svg-engine="plantuml"[\s\S]*?kmark-generated-svg-source[\s\S]*?<pre><code>([\s\S]*?)<\/code>/u);
  assert.ok(match, "PlantUML hidden source is missing");
  return decodeHtmlText(match[1]);
}

const crSource = "@startuml\rAlice -> Bob\r@enduml";
assert.equal(normalizePlantUmlSource(crSource), crSource);
const whitespaceSource = " \t\n\n@startuml\nAlice -> Bob\n@enduml\n \t\n";
const normalizedWhitespaceSource = normalizePlantUmlSource(whitespaceSource);
assert.equal(normalizedWhitespaceSource, "@startuml\nAlice -> Bob\n@enduml\n");
const whitespaceOutputs = await renderPlantUmlTestSource(normalizedWhitespaceSource, false);
const whitespaceSvg = whitespaceOutputs.join("\n");
assert.ok(whitespaceSvg.includes("Alice"), "outer whitespace prevented PlantUML rendering");
assert.ok(
  !whitespaceSvg.includes("Diagram not supported by this release of PlantUML"),
  "outer whitespace produced a PlantUML error diagram",
);
assert.throws(
  () => normalizePlantUmlSource("@startuml\nAlice -> Bob\nnewpage\nBob -> Alice\n@enduml"),
  /newpage.*unsupported/u,
);
assert.throws(
  () => normalizePlantUmlSource(
    "@startuml\nAlice -> Bob\n@enduml\n@startmindmap\n* Root\n@endmindmap",
  ),
  /one diagram per PlantUML code block/u,
);

for (const sample of [
  {
    expectedText: "Receive request",
    source: [
      "@startuml",
      "title Activity Diagram",
      "start",
      ":Receive request;",
      "if (Request is valid?) then (yes)",
      "  :Process request;",
      "else (no)",
      "  :Return error;",
      "endif",
      "stop",
      "@enduml",
    ].join("\n"),
  },
  {
    expectedText: "Receive signal",
    source: [
      "@startuml",
      "title SDL Diagram",
      "start",
      ":Receive signal; <<input>>",
      ":Validate data; <<procedure>>",
      "stop",
      "@enduml",
    ].join("\n"),
  },
]) {
  const extracted = extractPlantUmlSource(`\`\`\`plantuml\n${sample.source}\n\`\`\``);
  assert.ok(!extracted.includes("\u001f"), "Markdown leaked its definition marker sentinel");
  assert.ok(extracted.includes(`:${sample.expectedText};`));
  const svg = (await renderPlantUmlTestSource(normalizePlantUmlSource(extracted), false)).join("\n");
  assert.ok(svg.includes(sample.expectedText));
  assert.ok(!/Syntax Error|Fatal parsing error/u.test(svg));
}

for (const [index, sample] of renderedPlantUmlSamples.entries()) {
  const result = JSON.parse(finalizeGeneratedSvgJson(JSON.stringify({
    httpsHosts: [],
    presentation: { position: "center", rootStyle: "width:320px;" },
    rawSvg: sample.svg,
    renderId: `integration-${index}`,
    revision: index + 1,
  })));
  assert.equal(result.revision, index + 1);
  assert.match(result.svg, /^<svg\b/u, `${sample.name} finalizer output must be SVG`);
  assert.ok(result.svg.includes("width:320px"), `${sample.name} lost Kmark presentation`);
  const ids = [...result.svg.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${sample.name} retained duplicate SVG ids`);
}

const heightFitPreview = JSON.parse(renderMarkdownPreviewJson(
  "<!-- kmark h:page_fit_contain -->\n```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```",
  null,
  "a4",
));
const heightFitStyle = heightFitPreview.pages[0]?.html.match(
  /data-kmark-generated-svg-style="([^"]+)"/u,
)?.[1];
assert.ok(heightFitStyle, "PlantUML Kmark presentation style is missing");
assert.match(heightFitStyle, /height:var\(--kmark-page-fit-contain-height,auto\)/u);
assert.match(heightFitStyle, /width:auto/u);

const heightFitResult = JSON.parse(finalizeGeneratedSvgJson(JSON.stringify({
  httpsHosts: [],
  presentation: { position: null, rootStyle: heightFitStyle },
  rawSvg: renderedPlantUmlSamples[0].svg,
  renderId: "integration-height-fit",
  revision: 100,
})));
assert.match(heightFitResult.svg, /height:var\(--kmark-page-fit-contain-height,auto\)/u);
assert.match(heightFitResult.svg, /width:auto/u);

const dotPreview = JSON.parse(renderMarkdownPreviewJson(
  "```dot\ndigraph G { A -> B }\n```",
  null,
  "standard",
));
assert.match(dotPreview.html, /data-kmark-generated-svg-engine="dot"/u);
const dotResult = JSON.parse(finalizeGeneratedSvgJson(JSON.stringify({
  httpsHosts: [],
  presentation: { position: null, rootStyle: null },
  rawSvg: renderDotTestSource("digraph G { A -> B }"),
  renderId: "integration-dot",
  revision: 101,
})));
assert.match(dotResult.svg, /^\s*<svg\b/u);
assert.ok(dotResult.svg.includes("A"));

console.log(`PlantUML -> WASM finalizer integration: OK (${renderedPlantUmlSamples.length})`);
console.log("DOT -> WASM finalizer integration: OK");
