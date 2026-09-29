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

async function collectResult(port, fixtureName = "a4-page-layout.html") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find((entry) => entry.type === "page" && entry.url.includes(fixtureName));
    if (page) {
      const socket = await connect(page.webSocketDebuggerUrl);
      try {
        for (let poll = 0; poll < 100; poll += 1) {
          const encoded = await evaluate(socket, "document.body?.dataset.result ?? null");
          if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
          await delay(100);
        }
        const error = await evaluate(socket, "JSON.stringify({html:document.documentElement.outerHTML.slice(0,1000),resources:performance.getEntriesByType('resource').map(resource=>resource.name),result:document.body.dataset.result})");
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
    cacheDir: "node_modules/.vite-kmark-test-a4-layout-browser",
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

const automaticPageScript = `import "/src/App.css";
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { paginateA4RenderedPage } from "/src/adapters/browser/browserA4Pagination.ts";
    import { MarkdownPreview } from "/src/ui/components/MarkdownPreview.tsx";
    import { printMarkdownDocument } from "/src/infra/printDocument.ts";
    import {
      DEFAULT_PAGE_CHROME_CONFIG,
      DEFAULT_PAGE_NUMBER_CONFIG,
      DEFAULT_PREVIEW_TEXT_STYLE,
    } from "/src/domain/preview.ts";

    const encode = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
    const fail = (error) => { document.body.dataset.result = encode({ error: String(error) }); };
    window.addEventListener("error", (event) => fail(event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => fail(event.reason));
    const pageStyle = {
      width: "600px", height: "600px",
      marginTop: "40px", marginRight: "40px",
      marginBottom: "40px", marginLeft: "40px",
    };
    const numberConfig = {
      ...DEFAULT_PAGE_NUMBER_CONFIG,
      position: "bottom-center",
      format: "{page}/{total}",
    };
    const page = (html, config = numberConfig, style = pageStyle) => ({
      html,
      pageStyle: style,
      textStyle: DEFAULT_PREVIEW_TEXT_STYLE,
      pageNumberConfig: config,
      pageChromeConfig: DEFAULT_PAGE_CHROME_CONFIG,
    });
    const prose = Array.from({ length: 30 }, (_, index) =>
      '<p data-prose="' + index + '" style="height:46px;margin:0">line-' + index + '</p>'
    ).join("");
    const table = '<table><tbody>' + Array.from({ length: 12 }, (_, index) =>
      '<tr data-row="' + index + '"><td>row-' + index + '</td></tr>'
    ).join("") + '</tbody></table>';
    const toc = '<nav class="kmark-toc"><ol class="kmark-toc__list">' + Array.from({ length: 12 }, (_, index) =>
      '<li class="kmark-toc__item kmark-toc__item--depth-1" data-toc-depth="1" data-toc="' + index + '">heading-' + index + '</li>'
    ).join("") + '</ol></nav>';
    const sourcePages = [
      page(prose + table + toc, { ...numberConfig, reset: true }),
      page('<p id="manual-page">manual</p>', numberConfig, { ...pageStyle, width: "610px" }),
    ];
    const root = createRoot(document.getElementById("root"));
    const frames = () => Array.from(document.querySelectorAll("#root .preview-section__page-frame"));
    const waitFor = async (predicate) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("A4 pagination did not settle");
    };
    try {
      await document.fonts.ready;
      const direct = paginateA4RenderedPage(sourcePages[0]);
      const joinedText = (pages) => {
        const container = document.createElement("div");
        container.innerHTML = pages.map((part) => part.html).join("");
        return container.textContent.replace(/\\s+/gu, " ").trim();
      };
      const words = Array.from({ length: 300 }, (_, index) => 'word' + index).join(' ');
      const paragraphPages = paginateA4RenderedPage(page('<p>' + words + '</p>'));
      const listPages = paginateA4RenderedPage(page('<ol><li>' + words + '</li></ol>'));
      const code = Array.from({ length: 65 }, (_, index) => 'code-' + index).join('\\n');
      const prePages = paginateA4RenderedPage(page('<pre><code>' + code + '</code></pre>'));
      const valignPages = paginateA4RenderedPage(page('<p data-page-valign="bottom">tail</p><p id="after-valign">after</p>'));
      root.render(createElement(MarkdownPreview, { displayMode: "a4", html: "", pages: sourcePages }));
      await waitFor(() => frames().length > sourcePages.length);
      const initialFrames = frames();
      const manualFrame = initialFrames.find((frame) => frame.querySelector("#manual-page") !== null);
      const initialHtml = initialFrames.map((frame) => frame.querySelector(".preview-section__page")?.innerHTML ?? "");
      const initialNumbers = initialFrames.map((frame) => frame.querySelector(".kmark-page-number")?.textContent?.trim() ?? "");
      let printFrameCount = -1;
      await printMarkdownDocument(
        { displayMode: "a4", title: "automatic pagination", pages: sourcePages },
        { preparePrintWindow(printWindow) {
          printWindow.print = () => {
            printFrameCount = printWindow.document.querySelectorAll(".kmark-print-page").length;
            printWindow.dispatchEvent(new printWindow.Event("afterprint"));
          };
        } },
      );
      const measuredWidths = [];
      const recordMeasurements = (records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.style.visibility === "hidden") {
              const frame = node.querySelector(".preview-section__page-frame");
              if (frame !== null) measuredWidths.push(frame.style.getPropertyValue("--kmark-page-width"));
            }
          }
        }
      };
      const observer = new MutationObserver(recordMeasurements);
      observer.observe(document.body, { childList: true, subtree: true });
      root.render(createElement(MarkdownPreview, {
        displayMode: "a4", html: "",
        pages: [page('<p id="short-page">short</p>'), structuredClone(sourcePages[1])],
      }));
      await waitFor(() => frames().length === 2 && document.getElementById("short-page") !== null);
      recordMeasurements(observer.takeRecords());
      observer.disconnect();
      const updatedFrames = frames();
      document.body.dataset.result = encode({
        directPageCount: direct.length,
        directResetFlags: direct.map((part) => part.pageNumberConfig.reset),
        paragraphPageCount: paragraphPages.length,
        paragraphTextPreserved: joinedText(paragraphPages) === words,
        listPageCount: listPages.length,
        listTextPreserved: joinedText(listPages) === words,
        prePageCount: prePages.length,
        preTextPreserved: joinedText(prePages) === code.replace(/\\s+/gu, " ").trim(),
        valignPageCount: valignPages.length,
        valignBoundaryPreserved: valignPages[0]?.html.includes('data-page-valign="bottom"')
          && valignPages[1]?.html.includes('id="after-valign"'),
        initialFrameCount: initialFrames.length,
        initialHtml,
        initialNumbers,
        printFrameCount,
        updatedFrameCount: updatedFrames.length,
        preservedManualFrame: updatedFrames.includes(manualFrame),
        measuredWidths,
        updatedNumbers: updatedFrames.map((frame) => frame.querySelector(".kmark-page-number")?.textContent?.trim() ?? ""),
        staleProseCount: document.querySelectorAll("#root [data-prose]").length,
      });
    } catch (error) {
      fail(error);
    }
`;

test("A4 pagination preserves content and numbering across layout, updates, and print", async (context) => {
  const browser = await findBrowser();
  if (browser === null) {
    context.skip("Chromium or Edge is not installed; set KMARK_TEST_BROWSER");
    return;
  }

  const vite = await createServer({
    configFile: false,
    cacheDir: "node_modules/.vite-kmark-test-a4-pagination-browser",
    optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-dev-runtime"] },
    plugins: [{
      name: "a4-automatic-pagination-fixture",
      resolveId(id) {
        if (id === "/tools/fixtures/a4-auto-pages-test.js") return "\0a4-auto-pages-test";
        return null;
      },
      load(id) {
        if (id === "\0a4-auto-pages-test") return automaticPageScript;
        return null;
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split("?")[0] !== "/tools/fixtures/a4-auto-pages.html") return next();
          try {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="root"></div><script>window.addEventListener("error",event=>document.body.dataset.result=btoa(JSON.stringify({error:event.message})));window.addEventListener("unhandledrejection",event=>document.body.dataset.result=btoa(JSON.stringify({error:String(event.reason)})));</script><script type="module" src="/@id/__x00__a4-auto-pages-test"></script></body></html>');
          } catch (error) {
            next(error);
          }
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0 },
  });
  const profile = await mkdtemp(path.join(os.tmpdir(), "kmark-a4-pagination-"));
  let browserSocket;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/tools/fixtures/a4-auto-pages.html`;
    spawn(browser, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--no-sandbox", "--disable-dev-shm-usage",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
    ], { stdio: "ignore", windowsHide: true });
    const { port, browserUrl } = await waitForPort(profile);
    browserSocket = await connect(browserUrl);
    const result = await collectResult(port, "a4-auto-pages.html");
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.directPageCount > 1, "long source page creates physical pages");
    assert.deepEqual(result.directResetFlags, [true, ...Array(result.directPageCount - 1).fill(false)],
      "only the first physical page applies page_number_reset");
    assert.ok(result.paragraphPageCount > 1, "a long paragraph splits across pages");
    assert.equal(result.paragraphTextPreserved, true, "paragraph text is not dropped");
    assert.ok(result.listPageCount > 1, "a long ordered list item splits across pages");
    assert.equal(result.listTextPreserved, true, "list item text is not dropped");
    assert.ok(result.prePageCount > 1, "a long code block splits across pages");
    assert.equal(result.preTextPreserved, true, "code text is not dropped");
    assert.ok(result.valignPageCount > 1, "page_valign ends the active physical page");
    assert.equal(result.valignBoundaryPreserved, true);
    assert.ok(result.initialFrameCount > 2, "the UI appends pages before the manual boundary");
    assert.equal(result.initialFrameCount, result.directPageCount + 1);
    assert.equal(result.printFrameCount, result.initialFrameCount);
    assert.equal(result.updatedFrameCount, 2, "a shorter patch removes continuation pages");
    assert.equal(result.preservedManualFrame, true, "unmodified explicit page keeps its DOM frame");
    assert.ok(result.measuredWidths.includes("600px"), "edited source page is remeasured");
    assert.equal(result.measuredWidths.includes("610px"), false, "unmodified explicit page is not remeasured");
    assert.equal(result.staleProseCount, 0);
    assert.deepEqual(result.updatedNumbers, ["1/2", "2/2"]);
    assert.deepEqual(result.initialNumbers, Array.from(
      { length: result.initialFrameCount }, (_, index) => `${index + 1}/${result.initialFrameCount}`,
    ));
    assert.match(result.initialHtml.at(-1), /manual-page/u, "manual page stays after the overflow pages");
    const allHtml = result.initialHtml.join("");
    for (let index = 0; index < 30; index += 1) {
      assert.equal((allHtml.match(new RegExp(`data-prose="${index}"`, "gu")) ?? []).length, 1);
    }
    for (let index = 0; index < 12; index += 1) {
      assert.equal((allHtml.match(new RegExp(`data-row="${index}"`, "gu")) ?? []).length, 1);
      assert.equal((allHtml.match(new RegExp(`data-toc="${index}"`, "gu")) ?? []).length, 1);
    }
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
