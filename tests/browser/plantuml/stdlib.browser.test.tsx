import { expect, test } from "vitest";
import "../../../src/App.css";
import { renderMarkdownPreview } from "../../../src/adapters/browser/browserMarkdownPreviewRenderer";
import { mountPreview } from "../support/mountPreview";

async function renderPlantUml(source: string) {
  const result = await renderMarkdownPreview(`\`\`\`plantuml\n${source}\n\`\`\``, null, "standard", {
    revision: 1,
    documentKey: crypto.randomUUID(),
    plantumlRenderEpoch: 0,
    plantumlHttpsHosts: [],
    strictGeneratedSvg: true,
  });
  const preview = mountPreview();
  preview.render(result);
  return preview;
}

test("bundled PlantUML stdlib listing renders offline as SVG", async () => {
  const preview = await renderPlantUml("@startuml catalog\n' bundled libraries\nstdlib\n@enduml");
  try {
    const svg = preview.host.querySelector(".kmark-persistent-generated-svg-block svg");
    expect(svg).not.toBeNull();
    expect(svg!.textContent).toContain("Bundled PlantUML Standard Libraries");
  } finally {
    preview.dispose();
  }
});

test("unknown stdlib include produces an error SVG without remote fallback", async () => {
  const preview = await renderPlantUml("@startuml\n!include <missing/X>\n@enduml");
  try {
    const svg = preview.host.querySelector(".kmark-persistent-generated-svg-block svg");
    expect(svg).not.toBeNull();
    expect(svg!.textContent).toMatch(/Fatal parsing error|cannot include|Syntax Error/u);
  } finally {
    preview.dispose();
  }
});
