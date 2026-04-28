import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(repoRoot, "src");
const SOURCE_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const RELATIVE_IMPORT_PATTERN = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.[^"']+)["']/g;

function collectSourceFiles(directoryPath) {
  const collectedFiles = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      collectedFiles.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      collectedFiles.push(entryPath);
    }
  }

  return collectedFiles.sort();
}

function parseRelativeImportSpecifiers(filePath) {
  const fileContent = fs.readFileSync(filePath, "utf8");
  const specifiers = [];

  for (const match of fileContent.matchAll(RELATIVE_IMPORT_PATTERN)) {
    const specifier = match[1];

    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function resolveImportPath(sourceFilePath, specifier) {
  const resolvedBasePath = path.resolve(path.dirname(sourceFilePath), specifier);
  const candidates = [
    resolvedBasePath,
    `${resolvedBasePath}.ts`,
    `${resolvedBasePath}.tsx`,
    path.join(resolvedBasePath, "index.ts"),
    path.join(resolvedBasePath, "index.tsx"),
  ];

  return candidates.find((candidatePath) => fs.existsSync(candidatePath)) ?? null;
}

export function createImportGraph() {
  const files = collectSourceFiles(srcRoot);
  const graph = new Map();

  for (const filePath of files) {
    const resolvedImports = parseRelativeImportSpecifiers(filePath)
      .map((specifier) => resolveImportPath(filePath, specifier))
      .filter((targetPath) => targetPath !== null);

    graph.set(filePath, resolvedImports);
  }

  return graph;
}

function canonicalizeCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  let smallestIndex = 0;

  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index].localeCompare(nodes[smallestIndex]) < 0) {
      smallestIndex = index;
    }
  }

  const rotated = [
    ...nodes.slice(smallestIndex),
    ...nodes.slice(0, smallestIndex),
  ];

  rotated.push(rotated[0]);

  return rotated;
}

export function findCycles(graph) {
  const discoveredCycles = new Map();
  const visited = new Set();
  const stack = [];
  const activeNodes = new Set();

  function visit(nodePath) {
    visited.add(nodePath);
    activeNodes.add(nodePath);
    stack.push(nodePath);

    for (const nextPath of graph.get(nodePath) ?? []) {
      if (!visited.has(nextPath)) {
        visit(nextPath);
        continue;
      }

      if (!activeNodes.has(nextPath)) {
        continue;
      }

      const cycleStartIndex = stack.indexOf(nextPath);

      if (cycleStartIndex === -1) {
        continue;
      }

      const cycle = [...stack.slice(cycleStartIndex), nextPath];
      const canonicalCycle = canonicalizeCycle(cycle);
      discoveredCycles.set(canonicalCycle.join(" -> "), canonicalCycle);
    }

    stack.pop();
    activeNodes.delete(nodePath);
  }

  for (const nodePath of graph.keys()) {
    if (!visited.has(nodePath)) {
      visit(nodePath);
    }
  }

  return [...discoveredCycles.values()];
}

export function getRepoRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
}

export function getLayerName(filePath) {
  const relativePath = getRepoRelativePath(filePath);
  const [, layerName = "unknown"] = relativePath.split("/");

  return layerName;
}
