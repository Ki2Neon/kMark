import { createImportGraph, findCycles, getRepoRelativePath } from "./import-graph.mjs";

const graph = createImportGraph();
const cycles = findCycles(graph);

if (cycles.length > 0) {
  console.error("Import cycle detected");

  for (const cycle of cycles) {
    console.error(`- ${cycle.map((filePath) => getRepoRelativePath(filePath)).join(" -> ")}`);
  }

  process.exit(1);
}

console.log(`No import cycles across ${graph.size} source files`);
