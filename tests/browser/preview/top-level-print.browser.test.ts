import { commands } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import "../../../src/App.css";
import { printPreparedDocumentInMainWindow } from "../../../src/infra/topLevelPrintDocument";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia(media: "print" | "screen"): Promise<void>;
  }
}

const fixtures: HTMLElement[] = [];
const originalTitle = document.title;
const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

async function createSource(body: string, style = ""): Promise<Window> {
  const iframe = document.createElement("iframe");
  fixtures.push(iframe);
  const loaded = new Promise<void>((resolve) => { iframe.onload = () => resolve(); });
  iframe.srcdoc = `<!doctype html><html><head><title>Prepared document</title><style>${style}</style></head><body>${body}</body></html>`;
  document.body.append(iframe);
  await loaded;
  return iframe.contentWindow!;
}

function printHost(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(":scope > #kmark-print-document");
}

function finishPrint(): void {
  window.dispatchEvent(new Event("afterprint"));
}

afterEach(async () => {
  finishPrint();
  await commands.emulateMedia("screen");
  for (const fixture of fixtures.splice(0)) fixture.remove();
  document.title = originalTitle;
});

test("prepared content prints in the main document without changing the screen layout", async () => {
  const source = await createSource(
    '<div id="kmark-print-root"><main class="markdown-body"><h1>Document</h1><img alt="Frozen model" src="' + IMAGE + '"></main></div>',
    "html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; } #kmark-print-root { width: 800px; height: 1000px; color: rgb(12, 34, 56); }",
  );
  const app = document.createElement("div");
  app.id = "print-test-app";
  app.style.cssText = "width:320px;height:160px;color:rgb(67, 89, 10)";
  document.body.append(app);
  fixtures.push(app);
  const before = app.getBoundingClientRect().toJSON();
  const originalOverflow = getComputedStyle(document.body).overflow;
  const styleCount = document.head.querySelectorAll("style").length;
  const showPrintDialog = vi.fn(async () => {});
  const printing = printPreparedDocumentInMainWindow(source, showPrintDialog);
  await vi.waitFor(() => expect(showPrintDialog).toHaveBeenCalledOnce());
  const host = printHost()!;
  expect(host).not.toBeNull();
  expect(host.querySelector("h1")?.textContent).toBe("Document");
  expect(host.querySelector<HTMLImageElement>("img")?.complete).toBe(true);
  expect(getComputedStyle(host).display).toBe("none");
  expect(app.getBoundingClientRect().toJSON()).toEqual(before);
  expect(getComputedStyle(document.body).overflow).toBe(originalOverflow);
  expect(document.head.querySelectorAll('style[media="print"]').length).toBeGreaterThan(0);
  await commands.emulateMedia("print");
  expect(getComputedStyle(app).display).toBe("none");
  expect(getComputedStyle(host).display).toBe("block");
  expect(getComputedStyle(host).position).toBe("static");
  expect(getComputedStyle(document.body).overflow).toBe("visible");
  expect(getComputedStyle(document.documentElement).overflow).toBe("visible");
  expect(getComputedStyle(document.body).minHeight).toBe("0px");
  const root = host.querySelector<HTMLElement>("#kmark-print-root")!;
  expect(root.getBoundingClientRect().width).toBe(800);
  expect(root.getBoundingClientRect().height).toBe(1000);
  expect(getComputedStyle(root).color).toBe("rgb(12, 34, 56)");
  finishPrint();
  await printing;
  expect(printHost()).toBeNull();
  expect(document.head.querySelectorAll("style")).toHaveLength(styleCount);
});

test("the native dialog retains the document until afterprint and rejects overlapping requests", async () => {
  const source = await createSource("<p>Document</p>");
  const showPrintDialog = vi.fn(async () => {});
  let settled = false;
  const printing = printPreparedDocumentInMainWindow(source, showPrintDialog).then(() => { settled = true; });
  await vi.waitFor(() => expect(showPrintDialog).toHaveBeenCalledOnce());
  expect(document.title).toBe("Prepared document");
  expect(printHost()?.textContent).toBe("Document");
  await Promise.resolve();
  expect(settled).toBe(false);
  await expect(printPreparedDocumentInMainWindow(source, showPrintDialog)).rejects.toThrow(/印刷/u);
  expect(showPrintDialog).toHaveBeenCalledOnce();
  expect(printHost()).not.toBeNull();
  finishPrint();
  await printing;
  expect(settled).toBe(true);
  expect(document.title).toBe(originalTitle);
  expect(printHost()).toBeNull();
  const next = printPreparedDocumentInMainWindow(source, showPrintDialog);
  await vi.waitFor(() => expect(showPrintDialog).toHaveBeenCalledTimes(2));
  finishPrint();
  await next;
  expect(printHost()).toBeNull();
});

test("a failed native dialog restores the document and allows another print", async () => {
  const source = await createSource("<p>Document</p>");
  const styleCount = document.head.querySelectorAll("style").length;
  await expect(printPreparedDocumentInMainWindow(source, async () => {
    throw new Error("Native print rejected");
  })).rejects.toThrow("Native print rejected");
  expect(printHost()).toBeNull();
  expect(document.title).toBe(originalTitle);
  expect(document.head.querySelectorAll("style")).toHaveLength(styleCount);
  const showPrintDialog = vi.fn(async () => {});
  const printing = printPreparedDocumentInMainWindow(source, showPrintDialog);
  await vi.waitFor(() => expect(showPrintDialog).toHaveBeenCalledOnce());
  finishPrint();
  await printing;
});

test("copied heading links and SVG references resolve to the print document", async () => {
  const source = await createSource(`
    <div id="kmark-print-root">
      <h2 id="section">Section</h2><a href="#section">Jump</a>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="paint"><stop stop-color="red"/></linearGradient>
          <clipPath id="clip"><rect width="100" height="100"/></clipPath>
          <marker id="arrow"><path d="M0 0L5 5"/></marker>
        </defs>
        <style>#shape { fill: url("#paint"); } #fff { stroke: #fff; }</style>
        <path id="shape" d="M0 0L50 50" clip-path="url(#clip)" marker-end="url(#arrow)"/>
        <path id="fff" d="M10 0L50 50"/>
        <use href="#shape"/>
      </svg>
    </div>`,
  "#kmark-print-root { width: 800px; } #section { color: rgb(12, 34, 56); }");
  const original = document.createElement("div");
  original.innerHTML = source.document.body.innerHTML;
  document.body.append(original);
  fixtures.push(original);
  const originalMarkup = original.innerHTML;
  const showPrintDialog = vi.fn(async () => {});
  const printing = printPreparedDocumentInMainWindow(source, showPrintDialog);
  await vi.waitFor(() => expect(showPrintDialog).toHaveBeenCalledOnce());
  const host = printHost()!;
  const heading = host.querySelector("h2")!;
  expect(heading.id).not.toBe("section");
  expect(host.querySelector("a")?.getAttribute("href")).toBe(`#${heading.id}`);
  expect(document.getElementById(heading.id)).toBe(heading);
  const root = host.firstElementChild!;
  expect(root.id).not.toBe("kmark-print-root");
  const gradient = host.querySelector("linearGradient")!;
  const clip = host.querySelector("clipPath")!;
  const marker = host.querySelector("marker")!;
  const path = host.querySelector("svg > path")!;
  expect(path.getAttribute("clip-path")).toBe(`url(#${clip.id})`);
  expect(path.getAttribute("marker-end")).toBe(`url(#${marker.id})`);
  expect(host.querySelector("use")?.getAttribute("href")).toBe(`#${path.id}`);
  expect(host.querySelector("svg style")?.textContent).toContain(`#${path.id}`);
  expect(host.querySelector("svg style")?.textContent).toContain(`#${gradient.id}`);
  expect(host.querySelector("svg style")?.textContent).toMatch(/stroke:\s*(?:#fff|white|rgb\(255, 255, 255\))/u);
  await commands.emulateMedia("print");
  expect(root.getBoundingClientRect().width).toBe(800);
  expect(getComputedStyle(heading).color).toBe("rgb(12, 34, 56)");
  expect(getComputedStyle(path).fill).toContain(`#${gradient.id}`);
  expect(original.innerHTML).toBe(originalMarkup);
  finishPrint();
  await printing;
});
