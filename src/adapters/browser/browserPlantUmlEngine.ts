import {
  GeneratedSvgRawCache,
  shouldCacheGeneratedSvgSource,
} from "./browserPlantUmlPolicy";
import { withTransparentDotBackground } from "./browserDotSource";
import { resolveBundledStdlibListingSource } from "./browserPlantUmlStdlib";
import plantUmlStdlibManifest from "./plantumlStdlibManifest.json";

const PLANTUML_VERSION = "1.2026.6";
const GENERATED_SVG_RENDER_TIMEOUT_MS = 15_000;

export type GeneratedSvgEngineKind = "dot" | "plantuml";

type GeneratedSvgFrameResult = {
  readonly type: "kmark-generated-svg-result" | "kmark-generated-svg-error" | "kmark-generated-svg-ready";
  readonly nonce: string;
  readonly requestId?: string;
  readonly svg?: string;
  readonly error?: string;
};

type PendingRender = {
  readonly jobId: string;
  readonly reject: (error: Error) => void;
  readonly resolve: (svg: string) => void;
  readonly timeoutId: number;
};

type FrameInitialization = {
  readonly cleanup: () => void;
  readonly frame: HTMLIFrameElement;
  readonly reject: (error: Error) => void;
};

class GeneratedSvgTaskCancelledError extends Error {
  constructor() {
    super("Generated SVG render task cancelled");
    this.name = "AbortError";
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function resolveAssetUrl(fileName: string): string {
  return new URL(`${import.meta.env.BASE_URL}plantuml-core/${fileName}`, window.location.href).href;
}

function createFrameDocument(nonce: string, httpsHosts: readonly string[]): string {
  const vizUrl = resolveAssetUrl("viz-global.js");
  const plantUmlUrl = resolveAssetUrl("plantuml.js");
  const assetBaseUrl = resolveAssetUrl("");
  const allowedOrigins = httpsHosts.map((host) => `https://${host}`).join(" ");
  const connectSource = ["'self'", allowedOrigins].filter(Boolean).join(" ");
  const serializedHosts = JSON.stringify(httpsHosts);
  const serializedNonce = JSON.stringify(nonce);
  const serializedPlantUmlUrl = JSON.stringify(plantUmlUrl);

  return `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtmlAttribute(assetBaseUrl)}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src ${escapeHtmlAttribute(connectSource)}; img-src 'self' data: ${escapeHtmlAttribute(allowedOrigins)}"></head><body><script>
  (() => {
    const NativeXHR = window.XMLHttpRequest;
    const allowedHosts = new Set(${serializedHosts});
    const isAllowed = (raw) => {
      const url = new URL(String(raw), document.baseURI);
      if (url.origin === location.origin) return true;
      return url.protocol === 'https:' && allowedHosts.has(url.host.toLowerCase());
    };
    class SafeXHR extends NativeXHR {
      open(method, url, ...rest) {
        if (!isAllowed(url)) throw new Error('plantuml_network_blocked:' + url);
        return super.open(method, url, ...rest);
      }
      get responseText() {
        if (this.responseURL && !isAllowed(this.responseURL)) throw new Error('plantuml_network_blocked_redirect:' + this.responseURL);
        return super.responseText;
      }
      get response() {
        if (this.responseURL && !isAllowed(this.responseURL)) throw new Error('plantuml_network_blocked_redirect:' + this.responseURL);
        return super.response;
      }
    }
    window.XMLHttpRequest = SafeXHR;
  })();
  </script><script src="${escapeHtmlAttribute(vizUrl)}"></script><script type="module">
  import { renderToString } from ${serializedPlantUmlUrl};
  const nonce = ${serializedNonce};
  const vizPromise = window.Viz.instance();
  parent.postMessage({ type: 'kmark-generated-svg-ready', nonce }, '*');
  addEventListener('message', async (event) => {
    const request = event.data;
    if (event.source !== parent || request?.type !== 'kmark-generated-svg-render' || request.nonce !== nonce) return;
    const requestId = request.requestId;
    try {
      if (request.engine === 'dot') {
        const viz = await vizPromise;
        const svg = viz.renderString(String(request.source), { engine: 'dot', format: 'svg_inline' });
        parent.postMessage({ type: 'kmark-generated-svg-result', nonce, requestId, svg }, '*');
        return;
      }
      renderToString(
        String(request.source).split(/\\r\\n|\\r|\\n/),
        (svg) => parent.postMessage({ type: 'kmark-generated-svg-result', nonce, requestId, svg }, '*'),
        (error) => parent.postMessage({ type: 'kmark-generated-svg-error', nonce, requestId, error: String(error) }, '*'),
        { dark: request.dark === true },
      );
    } catch (error) {
      parent.postMessage({ type: 'kmark-generated-svg-error', nonce, requestId, error: String(error) }, '*');
    }
  });
  </script></body></html>`;
}

function hashSource(source: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

class GeneratedSvgEngine {
  #cache = new GeneratedSvgRawCache();
  #cancelledJobIds = new Set<string>();
  #currentJobId: string | null = null;
  #frame: HTMLIFrameElement | null = null;
  #frameHostsKey = "";
  #frameInitialization: FrameInitialization | null = null;
  #frameNonce = "";
  #frameReady: Promise<void> | null = null;
  #knownJobIds = new Set<string>();
  #pending = new Map<string, PendingRender>();
  #queue: Promise<void> = Promise.resolve();
  #requestSequence = 0;

  constructor() {
    window.addEventListener("message", this.#handleMessage);
  }

  invalidateCache(): void {
    this.#cache.clear();
  }

  cancel(jobId: string): void {
    if (!this.#knownJobIds.has(jobId)) {
      return;
    }
    this.#cancelledJobIds.add(jobId);
    if (
      this.#currentJobId === jobId
      || [...this.#pending.values()].some((pending) => pending.jobId === jobId)
    ) {
      this.#resetFrame(new GeneratedSvgTaskCancelledError());
    }
  }

  async render(
    engine: GeneratedSvgEngineKind,
    source: string,
    dark: boolean,
    jobId: string,
    httpsHosts: readonly string[],
  ): Promise<string> {
    if (this.#cancelledJobIds.has(jobId)) {
      throw new GeneratedSvgTaskCancelledError();
    }
    this.#knownJobIds.add(jobId);
    const renderSource = engine === "plantuml"
      ? resolveBundledStdlibListingSource(source, plantUmlStdlibManifest.assets)
      : withTransparentDotBackground(source);
    const renderDark = engine === "plantuml" && dark;
    const cacheKey = `${engine}:${PLANTUML_VERSION}:${renderDark ? "dark" : "light"}:${renderSource.length}:${hashSource(renderSource)}`;
    if (shouldCacheGeneratedSvgSource(renderSource)) {
      const cached = this.#cache.get(cacheKey, renderSource);
      if (cached !== null) {
        this.#knownJobIds.delete(jobId);
        return cached;
      }
    }

    let resolveResult!: (svg: string) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<string>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const operation = async () => {
      if (this.#cancelledJobIds.has(jobId)) {
        rejectResult(new GeneratedSvgTaskCancelledError());
        this.#cancelledJobIds.delete(jobId);
        this.#knownJobIds.delete(jobId);
        return;
      }
      try {
        this.#currentJobId = jobId;
        const svg = await this.#renderInFrame(engine, renderSource, renderDark, jobId, httpsHosts);
        if (this.#cancelledJobIds.has(jobId)) {
          throw new GeneratedSvgTaskCancelledError();
        }
        if (shouldCacheGeneratedSvgSource(renderSource)) {
          this.#cache.put(cacheKey, { bytes: svg.length * 2, source: renderSource, svg });
        }
        resolveResult(svg);
      } catch (error) {
        rejectResult(error);
      } finally {
        if (this.#currentJobId === jobId) {
          this.#currentJobId = null;
        }
        this.#cancelledJobIds.delete(jobId);
        this.#knownJobIds.delete(jobId);
      }
    };
    this.#queue = this.#queue.then(operation, operation);
    return result;
  }

  async #renderInFrame(
    engine: GeneratedSvgEngineKind,
    source: string,
    dark: boolean,
    jobId: string,
    httpsHosts: readonly string[],
  ): Promise<string> {
    await this.#ensureFrame(httpsHosts);
    if (this.#cancelledJobIds.has(jobId) || this.#frame?.contentWindow === null) {
      throw new GeneratedSvgTaskCancelledError();
    }
    const requestId = `svg-${this.#requestSequence += 1}`;
    return new Promise<string>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.#pending.delete(requestId);
        const error = new Error(`${engine}_timeout:${engine === "dot" ? "DOT" : "PlantUML"} render exceeded 15 seconds`);
        this.#resetFrame(error);
        reject(error);
      }, GENERATED_SVG_RENDER_TIMEOUT_MS);
      this.#pending.set(requestId, { jobId, reject, resolve, timeoutId });
      this.#frame!.contentWindow!.postMessage({
        type: "kmark-generated-svg-render",
        nonce: this.#frameNonce,
        requestId,
        engine,
        source,
        dark,
      }, "*");
    });
  }

  async #ensureFrame(httpsHosts: readonly string[]): Promise<void> {
    const hostsKey = [...httpsHosts].sort().join("\n");
    if (this.#frame !== null && this.#frameHostsKey === hostsKey && this.#frameReady !== null) {
      return this.#frameReady;
    }
    this.#resetFrame(new GeneratedSvgTaskCancelledError());
    this.#frameHostsKey = hostsKey;
    this.#frameNonce = crypto.randomUUID();
    const frameNonce = this.#frameNonce;
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.srcdoc = createFrameDocument(this.#frameNonce, httpsHosts);
    document.body.append(frame);
    this.#frame = frame;
    this.#frameReady = new Promise<void>((resolve, reject) => {
      let timeoutId: number | null = null;
      let readyListener!: (event: MessageEvent<GeneratedSvgFrameResult>) => void;
      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        window.removeEventListener("message", readyListener);
      };
      const failInitialization = () => {
        const error = new Error("generated_svg_render_failed:Generated SVG renderer failed to initialize");
        if (this.#frame === frame) {
          this.#resetFrame(error);
          return;
        }
        cleanup();
        reject(error);
      };
      readyListener = (event: MessageEvent<GeneratedSvgFrameResult>) => {
        if (event.source !== frame.contentWindow
          || event.data?.type !== "kmark-generated-svg-ready"
          || event.data.nonce !== frameNonce) {
          return;
        }
        cleanup();
        if (this.#frameInitialization?.frame === frame) {
          this.#frameInitialization = null;
        }
        resolve();
      };
      timeoutId = window.setTimeout(failInitialization, GENERATED_SVG_RENDER_TIMEOUT_MS);
      this.#frameInitialization = { cleanup, frame, reject };
      window.addEventListener("message", readyListener);
    });
    return this.#frameReady;
  }

  #handleMessage = (event: MessageEvent<GeneratedSvgFrameResult>): void => {
    if (event.source !== this.#frame?.contentWindow || event.data?.nonce !== this.#frameNonce) {
      return;
    }
    const requestId = event.data.requestId;
    if (requestId === undefined) {
      return;
    }
    const pending = this.#pending.get(requestId);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(requestId);
    window.clearTimeout(pending.timeoutId);
    if (event.data.type === "kmark-generated-svg-result" && typeof event.data.svg === "string") {
      pending.resolve(event.data.svg);
      return;
    }
    pending.reject(new Error(`generated_svg_render_failed:${event.data.error ?? "Unknown generated SVG error"}`));
  };

  #resetFrame(reason: Error): void {
    const initialization = this.#frameInitialization;
    this.#frameInitialization = null;
    initialization?.cleanup();
    initialization?.reject(reason);
    for (const pending of this.#pending.values()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(reason);
    }
    this.#pending.clear();
    this.#frame?.remove();
    this.#frame = null;
    this.#frameReady = null;
    this.#frameNonce = "";
  }
}

let engine: GeneratedSvgEngine | null = null;

export function getGeneratedSvgEngine(): GeneratedSvgEngine {
  engine ??= new GeneratedSvgEngine();
  return engine;
}

export { PLANTUML_VERSION };
