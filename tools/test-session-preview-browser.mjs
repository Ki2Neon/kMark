import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

const candidates = [
  process.env.KMARK_TEST_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserPath() {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* next candidate */ }
  }
  return null;
}

async function waitForPort(profile) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port, browserPathPart] = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))
        .trim().split("\n");
      if (port && browserPathPart) return { port, browserUrl: `ws://127.0.0.1:${port}${browserPathPart}` };
    } catch { /* browser is starting */ }
    await delay(100);
  }
  throw new Error("Browser DevTools port did not open");
}

async function evaluate(socket, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1_000_000_000);
    const onMessage = (event) => {
      const response = JSON.parse(event.data);
      if (response.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (response.error) reject(new Error(response.error.message));
      else resolve(response.result?.result?.value);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });
}

test("Standard preview changes one section without replacing unaffected DOM", async (context) => {
  const browser = await browserPath();
  if (browser === null) {
    context.skip("Chromium or Edge is not installed; set KMARK_TEST_BROWSER");
    return;
  }
  const vite = await createServer({
    configFile: false,
    cacheDir: "node_modules/.vite-kmark-test-session-preview-browser",
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  const profile = await mkdtemp(path.join(os.tmpdir(), "kmark-session-preview-"));
  let socket;
  let browserSocket;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    spawn(browser, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--no-sandbox", "--disable-dev-shm-usage",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`,
      `http://127.0.0.1:${address.port}/tools/fixtures/session-preview.html`,
    ], { stdio: "ignore", windowsHide: true });
    const { port, browserUrl } = await waitForPort(profile);
    browserSocket = new WebSocket(browserUrl);
    await new Promise((resolve, reject) => {
      browserSocket.addEventListener("open", resolve, { once: true });
      browserSocket.addEventListener("error", reject, { once: true });
    });
    let pageUrl;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      pageUrl = pages.find((entry) => entry.type === "page" && entry.url.includes("session-preview.html"))
        ?.webSocketDebuggerUrl;
      if (pageUrl) break;
      await delay(100);
    }
    assert.ok(pageUrl, "fixture page did not open");
    socket = new WebSocket(pageUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let result = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const encoded = await evaluate(socket, "document.body?.dataset.result ?? null");
      if (encoded) { result = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); break; }
      await delay(100);
    }
    if (result === null) {
      const html = await evaluate(socket, "document.documentElement.outerHTML.slice(0, 3000)");
      const importError = await evaluate(socket, "import('./session-preview.tsx').then(() => 'ok').catch((error) => error.stack ?? String(error))");
      throw new Error(`browser fixture did not finish: ${importError}; ${html}`);
    }
    assert.equal(result.error, undefined);
    assert.equal(result.count, 2);
    assert.equal(result.firstSurfaceSame, true);
    assert.equal(result.firstHeadingSame, true);
    assert.equal(result.secondSurfaceSame, true);
    assert.match(result.secondText, /after/u);
    assert.equal(result.sectionDisplay, "contents");
    assert.equal(result.imageDragSuppressed, true);
    assert.equal(result.svgDragSuppressed, true);
    assert.equal(result.dragWithoutPanAllowed, true);
    assert.equal(result.mermaidRendered, true);
    assert.equal(result.dirtyIndicatorVisible, true);
    assert.equal(result.cleanIndicatorHidden, true);
  } finally {
    socket?.close();
    if (browserSocket?.readyState === WebSocket.OPEN) {
      browserSocket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      browserSocket.close();
    }
    await vite.close();
    const resolved = path.resolve(profile);
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
