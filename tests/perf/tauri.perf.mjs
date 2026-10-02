import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const documentPath = join(process.env.KMARK_E2E_RUN_ROOT, "workspace", "document.md");
const editorSelector = '[aria-label="Markdown エディター"]';

async function diagnostic() {
  return browser.executeAsync((done) => {
    window.__TAURI__.core.invoke("get_e2e_debug_snapshot")
      .then(done, (error) => done({ diagnosticError: String(error) }));
  });
}

async function waitFor(label, condition, timeout = 30_000) {
  let state = null;
  try {
    await browser.waitUntil(async () => {
      state = await diagnostic();
      return condition(state);
    }, { timeout, interval: 100, timeoutMsg: label });
  } catch (error) {
    throw new Error(`${label}: state=${JSON.stringify(state)}`, { cause: error });
  }
  return state;
}

function milliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

describe("real Tauri performance (WebView2, IPC and desktop Rust)", () => {
  it("records one user edit through Rust revision and rendered preview", async () => {
    const readyStart = performance.now();
    await $(editorSelector).waitForDisplayed();
    const opened = await waitFor("document was not opened", (state) => state.activeDocument === documentPath);
    const editorReadyMs = milliseconds(readyStart);

    const operationStart = performance.now();
    const inserted = await browser.execute((selector) => {
      const editor = document.querySelector(selector);
      const line = editor?.querySelectorAll(".cm-line")[0];
      if (!editor || !line) throw new Error("first editor line missing");
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(line);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return document.execCommand("insertText", false, "!");
    }, editorSelector);
    assert.equal(inserted, true, "WebView2 could not insert one character at the first line");
    const editInputMs = milliseconds(operationStart);
    const changed = await waitFor("edit did not reach Rust", (state) => (
      state.documentRevision > opened.documentRevision && state.dirty === true
    ));
    const editToRustRevisionMs = milliseconds(operationStart);
    await browser.waitUntil(
      async () => browser.execute(() => document.querySelector(".section--preview h1")?.textContent?.includes("!")),
      { timeout: 30_000, interval: 100, timeoutMsg: `preview did not update: ${JSON.stringify(changed)}` },
    );
    const editToPreviewDomMs = milliseconds(operationStart);

    const saveStart = performance.now();
    await browser.keys(["Control", "s"]);
    await waitFor("save did not clear dirty", (state) => state.dirty === false);
    const saveToCleanMs = milliseconds(saveStart);
    assert.match(await readFile(documentPath, "utf8"), /Diagram fixture!/u);

    const output = resolve("artifacts/perf/tauri-metrics.json");
    await mkdir(resolve("artifacts/perf"), { recursive: true });
    await writeFile(output, `${JSON.stringify({
      schemaVersion: 1,
      benchmark: "tauri-edit-save-critical-path",
      environment: "tauri-webview2-windows",
      runAt: new Date().toISOString(),
      sessionId: changed.sessionId ?? null,
      startRevision: opened.documentRevision,
      endRevision: changed.documentRevision,
      editorReadyMs,
      editInputMs,
      editToRustRevisionMs,
      editToPreviewDomMs,
      saveToCleanMs,
    }, null, 2)}\n`, "utf8");
  });
});
