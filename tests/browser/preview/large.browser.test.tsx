import { expect, test } from "vitest";
import "../../../src/App.css";
import { renderMarkdownPreview } from "../../../src/adapters/browser/browserMarkdownPreviewRenderer";
import { largeDocument } from "../../fixtures/generators/largeDocument";
import { mountPreview } from "../support/mountPreview";

test("a larger Markdown document renders its first and last headings", async () => {
  const preview = mountPreview();
  try {
    const rendered = await renderMarkdownPreview(largeDocument(20), null, "standard", {
      revision: 1,
      documentKey: crypto.randomUUID(),
      plantumlRenderEpoch: 0,
      plantumlHttpsHosts: [],
    });
    preview.render(rendered);
    const headings = Array.from(preview.host.querySelectorAll("h1"), (heading) => heading.textContent);
    expect(headings).toHaveLength(20);
    expect(headings[0]).toBe("Page 1");
    expect(headings[19]).toBe("Page 20");
  } finally {
    preview.dispose();
  }
});
