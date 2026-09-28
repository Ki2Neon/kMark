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

async function findBrowser() {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  return null;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort(profile) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port, browserPath] = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
      if (port && browserPath) {
        return { port, browserUrl: `ws://127.0.0.1:${port}${browserPath}` };
      }
    } catch {
      await delay(100);
    }
  }
  throw new Error("Browser DevTools port did not open");
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return socket;
}

function evaluate(socket, expression) {
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
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
}

async function collectResult(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find((entry) => entry.type === "page" && entry.url.includes("editor-syntax-theme.html"));
    if (page) {
      const socket = await connect(page.webSocketDebuggerUrl);
      try {
        for (let poll = 0; poll < 100; poll += 1) {
          const encoded = await evaluate(socket, "document.body?.dataset.result ?? null");
          if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
          await delay(100);
        }
        const html = await evaluate(socket, "document.documentElement.outerHTML.slice(0, 1000)");
        throw new Error(`Browser fixture did not finish: ${html}`);
      } finally {
        socket.close();
      }
    }
    await delay(100);
  }
  throw new Error("Browser page did not open");
}

test("CodeMirror preserves One Dark colors across runtime theme changes", async (context) => {
  const browser = await findBrowser();
  if (browser === null) {
    context.skip("Chromium or Edge is not installed; set KMARK_TEST_BROWSER");
    return;
  }

  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { host: "127.0.0.1", port: 0 },
  });
  const profile = await mkdtemp(path.join(os.tmpdir(), "kmark-editor-syntax-theme-"));
  let browserSocket;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/tools/fixtures/editor-syntax-theme.html`;
    spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      url,
    ], { stdio: "ignore", windowsHide: true });
    const { port, browserUrl } = await waitForPort(profile);
    browserSocket = await connect(browserUrl);
    const result = await collectResult(port);

    assert.equal(result.error, undefined);
    assert.equal(result.dark.editorColor, "rgb(171, 178, 191)");
    assert.equal(result.dark.gutterColor, "rgb(125, 135, 153)");
    assert.equal(result.dark.commentColor, "rgb(125, 135, 153)");
    assert.deepEqual(result.dark.headingColors, ["rgb(152, 195, 121)", "rgb(224, 108, 117)"]);
    assert.equal(result.light.editorColor, "rgb(17, 34, 51)");
    assert.equal(result.light.gutterColor, "rgb(68, 85, 102)");
    assert.deepEqual(result.restoredDark, result.dark);
  } finally {
    if (browserSocket?.readyState === WebSocket.OPEN) {
      browserSocket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      browserSocket.close();
    }
    await vite.close();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 19) throw error;
        await delay(100);
      }
    }
  }
});
