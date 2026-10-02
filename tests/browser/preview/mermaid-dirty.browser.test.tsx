import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { expect, test } from "vitest";
import "../../../src/App.css";
import { renderMermaidPreviewHtml } from "../../../src/adapters/browser/browserMermaidRenderer";
import { DirtyIndicator } from "../../../src/ui/components/DirtyIndicator";
import {
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
} from "../../../src/domain/preview";
import { mountPreview } from "../support/mountPreview";

test("Mermaid SVG is rendered into React preview DOM", async () => {
  const html = await renderMermaidPreviewHtml(
    '<div class="kmark-mermaid-block" data-kmark-mermaid-index="0"><div class="kmark-mermaid-rendered"></div><details class="kmark-mermaid-source"><pre><code>flowchart LR\nA--&gt;B</code></pre></details></div>',
    { revision: 1, strict: true, httpsHosts: [] },
  );
  const preview = mountPreview();
  try {
    preview.render({ mode: "standard", html, defaultPageStyle: DEFAULT_PAGE_STYLE,
      defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE });
    expect(preview.host.querySelector(".kmark-mermaid-rendered svg")).not.toBeNull();
  } finally {
    preview.dispose();
  }
});

test("dirty indicator exposes saved and unsaved states in the browser", () => {
  const host = document.createElement("div");
  host.className = "editor-shell";
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(DirtyIndicator, { isDirty: true })));
    const indicator = host.querySelector<HTMLElement>(".editor-shell__dirty-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toBe("未保存の変更あり");
    expect(getComputedStyle(indicator!).opacity).toBe("1");
    flushSync(() => root.render(createElement(DirtyIndicator, { isDirty: false })));
    expect(indicator!.textContent).toBe("保存済み");
    expect(getComputedStyle(indicator!).opacity).toBe("0");
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
});
