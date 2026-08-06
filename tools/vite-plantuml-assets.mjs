import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const PACKAGE_DIRECTORY = resolve("node_modules/@plantuml/core");
const STDLIB_DIRECTORY = resolve("vendor/plantuml-stdlib");
const STDLIB_MANIFEST = JSON.parse(readFileSync(
  resolve("src/adapters/browser/plantumlStdlibManifest.json"),
  "utf8",
));
const ASSET_DIRECTORY = "plantuml-core";
const ASSETS = [
  ...["plantuml.js", "viz-global.js", "emoji.js", "openiconic.js", "LICENSE"]
    .map((fileName) => [fileName, resolve(PACKAGE_DIRECTORY, fileName)]),
  ...STDLIB_MANIFEST.assets
    .map(({ file }) => [file, resolve(STDLIB_DIRECTORY, file)]),
];
const ASSET_PATHS = new Map(ASSETS);

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
  const assetPath = ASSET_PATHS.get(fileName);
  if (assetPath === undefined) {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("PlantUML asset not found");
    return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType(fileName));
  response.setHeader("Cache-Control", "no-cache");
  response.end(readFileSync(assetPath));
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
      for (const [fileName, assetPath] of ASSETS) {
        this.emitFile({
          type: "asset",
          fileName: `${ASSET_DIRECTORY}/${fileName}`,
          source: readFileSync(assetPath),
        });
      }
    },
  };
}
