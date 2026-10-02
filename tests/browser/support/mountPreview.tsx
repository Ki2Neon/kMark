import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { MarkdownPreview, type PreviewNavigationRequest } from "../../../src/ui/components/MarkdownPreview";
import { type RenderedPreview } from "../../../src/domain/preview";

export function mountPreview() {
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);

  return {
    host,
    render(
      preview: RenderedPreview,
      enableInteractiveViewportNavigation = false,
      previewNavigationRequest: PreviewNavigationRequest | null = null,
    ) {
      flushSync(() => root.render(createElement(MarkdownPreview, {
        displayMode: preview.mode,
        html: preview.mode === "standard" ? preview.html : "",
        pages: preview.mode === "a4" ? preview.pages : undefined,
        sectionHtmls: preview.mode === "standard" ? preview.sectionHtmls : undefined,
        enableInteractiveViewportNavigation,
        previewNavigationRequest,
      })));
    },
    dispose() {
      flushSync(() => root.unmount());
      host.remove();
    },
  };
}
