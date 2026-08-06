import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import initKmarkWeb, {
  finalize_generated_svg_json as finalizeGeneratedSvgJson,
  render_markdown_preview_json as renderMarkdownPreviewJson,
  split_plantuml_source_json as splitPlantUmlSourceJson,
} from "../src/wasm/pkg/kmark_web.js";
import { renderedPlantUmlSamples } from "./test-plantuml-rendering.mjs";

const wasmBytes = await readFile(new URL("../src/wasm/pkg/kmark_web_bg.wasm", import.meta.url));
await initKmarkWeb({ module_or_path: wasmBytes });

const crSource = "@startuml\rAlice -> Bob\r@enduml";
assert.deepEqual(JSON.parse(splitPlantUmlSourceJson(crSource)).sources, [crSource]);
assert.throws(
  () => splitPlantUmlSourceJson("@startuml\nAlice -> Bob\nnewpage\nBob -> Alice\n@enduml"),
  /newpage.*unsupported/u,
);

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

console.log(`PlantUML -> WASM finalizer integration: OK (${renderedPlantUmlSamples.length})`);
