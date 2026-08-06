import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const PACKAGE_DIRECTORY = resolve("node_modules/@plantuml/core");
const ASSET_DIRECTORY = "plantuml-core";
const ASSET_FILES = ["plantuml.js", "viz-global.js", "emoji.js", "openiconic.js", "LICENSE"];

function contentType(fileName) {
  switch (extname(fileName)) {
    case ".js": return "text/javascript; charset=utf-8";
    default: return "text/plain; charset=utf-8";
  }
}

function serveAsset(request, response, next) {
  const pathName = new URL(request.url ?? "/", "http://localhost").pathname;
  const marker = `/${ASSET_DIRECTORY}/`;
  const markerIndex = pathName.lastIndexOf(marker);
  if (markerIndex < 0) {
    next();
    return;
  }
  const fileName = pathName.slice(markerIndex + marker.length);
  if (!ASSET_FILES.includes(fileName)) {
    next();
    return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType(fileName));
  response.setHeader("Cache-Control", "no-cache");
  response.end(readFileSync(resolve(PACKAGE_DIRECTORY, fileName)));
}

export function plantUmlAssetsPlugin() {
  return {
    name: "kmark-plantuml-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(serveAsset);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveAsset);
    },
  };
}

export function plantUmlBuildAssetsPlugin() {
  return {
    name: "kmark-plantuml-build-assets",
    apply: "build",
    buildStart() {
      for (const fileName of ASSET_FILES) {
        this.emitFile({
          type: "asset",
          fileName: `${ASSET_DIRECTORY}/${fileName}`,
          source: readFileSync(resolve(PACKAGE_DIRECTORY, fileName)),
        });
      }
    },
  };
}
