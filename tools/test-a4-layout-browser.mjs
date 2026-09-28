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
    const page = pages.find((entry) => entry.type === "page" && entry.url.includes("a4-page-layout.html"));
    if (page) {
      const socket = await connect(page.webSocketDebuggerUrl);
      try {
        for (let poll = 0; poll < 100; poll += 1) {
          const encoded = await evaluate(socket, "document.body?.dataset.result ?? null");
          if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
          await delay(100);
        }
        const error = await evaluate(socket, "document.documentElement.outerHTML.slice(0, 1000)");
        throw new Error(`Browser fixture did not finish: ${error}`);
      } finally {
        socket.close();
      }
    }
    await delay(100);
  }
  throw new Error("Browser page did not open");
}

test("A4 page fit and valign use fixed frame bounds in a real browser", async (context) => {
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
  const profile = await mkdtemp(path.join(os.tmpdir(), "kmark-a4-layout-"));
  let browserSocket;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/tools/fixtures/a4-page-layout.html`;
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
    const near = (actual, expected, label) => {
      assert.ok(Math.abs(actual - expected) <= 1.5, `${label}: ${actual} != ${expected}`);
    };

    assert.equal(result.frameCount, 8);
    assert.equal(result.spacerCount, 2);
    near(result.fit.targetBottom, result.fit.contentBottom, "h:page_fit bottom");
    assert.ok(result.fit.targetHeight > 500, "h:page_fit fills the remaining page height");
    assert.ok(result.fit.targetWidth > 450, "w:page_fit fills the page width");
    near(result.contain.targetWidth / result.contain.targetHeight, 2, "page_fit_contain ratio");
    assert.ok(result.contain.targetBottom <= result.contain.contentBottom + 1.5);
    near(result.tallContain.targetWidth / result.tallContain.targetHeight, 0.5, "h:page_fit_contain ratio");
    near(result.tallContain.targetBottom, result.tallContain.contentBottom, "h:page_fit_contain bottom");
    near(result.svgContain.targetWidth / result.svgContain.targetHeight, 0.5, "SVG page_fit_contain ratio");
    assert.ok(result.svgContain.targetBottom <= result.svgContain.contentBottom + 1.5);
    near(result.bottom.targetBottom, result.bottom.contentBottom, "page_valign bottom");
    assert.ok(result.center.contentBottom - result.center.targetBottom > 200, "page_valign center");
    near(result.print.targetBottom, result.print.contentBottom, "print-like page fit");
    near(result.zoom.targetBottom, result.zoom.contentBottom, "zoomed page fit");
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
