import { expect, test } from "vitest";
import "../../../src/App.css";
import {
  applyBrowserPreviewMutation,
  bootstrapBrowserPreviewSession,
  renderMarkdownPreview,
} from "../../../src/adapters/browser/browserMarkdownPreviewRenderer";
import { type RenderedPreview } from "../../../src/domain/preview";
import { mountPreview } from "../support/mountPreview";
import { recordBrowserState, type BrowserTestState } from "../support/recordBrowserState";

const diagram = (message: string) => `\`\`\`plantuml\n@startuml\nAlice -> Bob: ${message}\n@enduml\n\`\`\``;
const initial = [
  "# Intro\nordinary before",
  diagram("First message"),
  diagram("Second message"),
].join("\n<!-- --- -->\n");

test("Worker and Rust WASM patch only the edited PlantUML section through React", async ({ onTestFailed }) => {
  const sessionId = crypto.randomUUID();
  const documentKey = `browser-plantuml-${sessionId}`;
  const preview = mountPreview();
  let source = initial;
  let revision = 1;
  let batchId = 0;
  let previewRevision = 0;
  let latestState: BrowserTestState = {};
  const recordState = () => { latestState = {
    sessionId,
    documentRevision: revision,
    previewRevision,
    dirty: batchId > 0,
    pendingJobs: null,
    lastOperationId: batchId,
    lastIpcCommand: "browser-preview-worker",
  }; };
  onTestFailed(() => recordBrowserState(latestState));
  const render = async (): Promise<RenderedPreview> => {
    recordState();
    const result = await renderMarkdownPreview(null, null, "standard", {
      revision,
      documentKey,
      documentSessionId: sessionId,
      documentRevision: revision,
      plantumlRenderEpoch: 0,
      plantumlHttpsHosts: [],
      strictGeneratedSvg: true,
    });
    preview.render(result);
    previewRevision = revision;
    recordState();
    return result;
  };
  const replace = async (before: string, after: string) => {
    const fromUtf16 = source.indexOf(before);
    expect(fromUtf16).toBeGreaterThanOrEqual(0);
    const ack = await applyBrowserPreviewMutation(sessionId, {
      clientId: sessionId,
      batchId: ++batchId,
      expectedRevision: revision,
      transactions: [{
        beforeLengthUtf16: source.length,
        changes: [{ fromUtf16, toUtf16: fromUtf16 + before.length, insert: after }],
      }],
    });
    revision += 1;
    source = source.replace(before, after);
    expect(ack.revision).toBe(revision);
    expect(ack.isDirty).toBe(true);
    recordState();
  };

  try {
    await bootstrapBrowserPreviewSession({ sessionId, content: source, revision, isDirty: false });
    const first = await render();
    expect(first.mode).toBe("standard");
    const blocks = preview.host.querySelectorAll<HTMLElement>(".kmark-persistent-generated-svg-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].querySelector("svg")?.textContent).toContain("First message");
    expect(blocks[1].querySelector("svg")?.textContent).toContain("Second message");
    const firstSvg = blocks[0].querySelector("svg");
    const secondSvg = blocks[1].querySelector("svg");

    await replace("ordinary before", "ordinary after");
    await render();
    expect(preview.host.textContent).toContain("ordinary after");
    expect(preview.host.querySelectorAll(".kmark-persistent-generated-svg-block svg")[0]).toBe(firstSvg);
    expect(preview.host.querySelectorAll(".kmark-persistent-generated-svg-block svg")[1]).toBe(secondSvg);

    await replace("First message", "First changed");
    const changed = await render();
    expect(changed.mode).toBe("standard");
    const nextBlocks = preview.host.querySelectorAll<HTMLElement>(".kmark-persistent-generated-svg-block");
    expect(nextBlocks[0].querySelector("svg")?.textContent).toContain("First changed");
    expect(nextBlocks[1].querySelector("svg")).toBe(secondSvg);
    expect(nextBlocks[1].querySelector("svg")?.textContent).toContain("Second message");
  } finally {
    preview.dispose();
  }
});
