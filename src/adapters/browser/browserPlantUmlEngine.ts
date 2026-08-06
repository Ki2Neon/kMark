import {
  PlantUmlRawSvgCache,
  shouldCachePlantUmlSource,
} from "./browserPlantUmlPolicy";

const PLANTUML_VERSION = "1.2026.6";
const PLANTUML_RENDER_TIMEOUT_MS = 15_000;

type PlantUmlFrameResult = {
  readonly type: "kmark-plantuml-result" | "kmark-plantuml-error" | "kmark-plantuml-ready";
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

class PlantUmlTaskCancelledError extends Error {
  constructor() {
    super("PlantUML render task cancelled");
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
  parent.postMessage({ type: 'kmark-plantuml-ready', nonce }, '*');
  addEventListener('message', (event) => {
    const request = event.data;
    if (event.source !== parent || request?.type !== 'kmark-plantuml-render' || request.nonce !== nonce) return;
    const requestId = request.requestId;
    try {
      renderToString(
        String(request.source).split(/\\r\\n|\\r|\\n/),
        (svg) => parent.postMessage({ type: 'kmark-plantuml-result', nonce, requestId, svg }, '*'),
        (error) => parent.postMessage({ type: 'kmark-plantuml-error', nonce, requestId, error: String(error) }, '*'),
        { dark: request.dark === true },
      );
    } catch (error) {
      parent.postMessage({ type: 'kmark-plantuml-error', nonce, requestId, error: String(error) }, '*');
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

class PlantUmlEngine {
  #cache = new PlantUmlRawSvgCache();
  #cancelledJobIds = new Set<string>();
  #frame: HTMLIFrameElement | null = null;
  #frameHostsKey = "";
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
    if ([...this.#pending.values()].some((pending) => pending.jobId === jobId)) {
      this.#resetFrame(new PlantUmlTaskCancelledError());
    }
  }

  async render(
    source: string,
    dark: boolean,
    jobId: string,
    httpsHosts: readonly string[],
  ): Promise<string> {
    if (this.#cancelledJobIds.has(jobId)) {
      throw new PlantUmlTaskCancelledError();
    }
    this.#knownJobIds.add(jobId);
    const cacheKey = `${PLANTUML_VERSION}:${dark ? "dark" : "light"}:${source.length}:${hashSource(source)}`;
    if (shouldCachePlantUmlSource(source)) {
      const cached = this.#cache.get(cacheKey, source);
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
        rejectResult(new PlantUmlTaskCancelledError());
        this.#cancelledJobIds.delete(jobId);
        this.#knownJobIds.delete(jobId);
        return;
      }
      try {
        const svg = await this.#renderInFrame(source, dark, jobId, httpsHosts);
        if (this.#cancelledJobIds.has(jobId)) {
          throw new PlantUmlTaskCancelledError();
        }
        if (shouldCachePlantUmlSource(source)) {
          this.#cache.put(cacheKey, { bytes: svg.length * 2, source, svg });
        }
        resolveResult(svg);
      } catch (error) {
        rejectResult(error);
      } finally {
        this.#cancelledJobIds.delete(jobId);
        this.#knownJobIds.delete(jobId);
      }
    };
    this.#queue = this.#queue.then(operation, operation);
    return result;
  }

  async #renderInFrame(
    source: string,
    dark: boolean,
    jobId: string,
    httpsHosts: readonly string[],
  ): Promise<string> {
    await this.#ensureFrame(httpsHosts);
    if (this.#cancelledJobIds.has(jobId) || this.#frame?.contentWindow === null) {
      throw new PlantUmlTaskCancelledError();
    }
    const requestId = `puml-${this.#requestSequence += 1}`;
    return new Promise<string>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.#pending.delete(requestId);
        const error = new Error("plantuml_timeout:PlantUML render exceeded 15 seconds");
        this.#resetFrame(error);
        reject(error);
      }, PLANTUML_RENDER_TIMEOUT_MS);
      this.#pending.set(requestId, { jobId, reject, resolve, timeoutId });
      this.#frame!.contentWindow!.postMessage({
        type: "kmark-plantuml-render",
        nonce: this.#frameNonce,
        requestId,
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
    this.#resetFrame(new PlantUmlTaskCancelledError());
    this.#frameHostsKey = hostsKey;
    this.#frameNonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.srcdoc = createFrameDocument(this.#frameNonce, httpsHosts);
    document.body.append(frame);
    this.#frame = frame;
    this.#frameReady = new Promise<void>((resolve, reject) => {
      const failInitialization = () => {
        window.removeEventListener("message", readyListener);
        const error = new Error("plantuml_render_failed:PlantUML renderer failed to initialize");
        if (this.#frame === frame) {
          this.#resetFrame(error);
        }
        reject(error);
      };
      const timeoutId = window.setTimeout(() => {
        failInitialization();
      }, PLANTUML_RENDER_TIMEOUT_MS);
      const readyListener = (event: MessageEvent<PlantUmlFrameResult>) => {
        if (event.source !== frame.contentWindow
          || event.data?.type !== "kmark-plantuml-ready"
          || event.data.nonce !== this.#frameNonce) {
          return;
        }
        window.clearTimeout(timeoutId);
        window.removeEventListener("message", readyListener);
        resolve();
      };
      window.addEventListener("message", readyListener);
    });
    return this.#frameReady;
  }

  #handleMessage = (event: MessageEvent<PlantUmlFrameResult>): void => {
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
    if (event.data.type === "kmark-plantuml-result" && typeof event.data.svg === "string") {
      pending.resolve(event.data.svg);
      return;
    }
    pending.reject(new Error(`plantuml_render_failed:${event.data.error ?? "Unknown PlantUML error"}`));
  };

  #resetFrame(reason: Error): void {
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

let engine: PlantUmlEngine | null = null;

export function getPlantUmlEngine(): PlantUmlEngine {
  engine ??= new PlantUmlEngine();
  return engine;
}

export { PLANTUML_VERSION };
