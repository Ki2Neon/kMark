import {
  createImportGraph,
  getLayerName,
  getRepoRelativePath,
} from "./import-graph.mjs";

const graph = createImportGraph();
const violations = [];

function verifyLayerBoundary(sourceFilePath, targetFilePath, allowedTargetLayers) {
  const targetLayer = getLayerName(targetFilePath);

  if (!allowedTargetLayers.has(targetLayer)) {
    violations.push(
      `${getRepoRelativePath(sourceFilePath)} -> ${getRepoRelativePath(targetFilePath)} disallowed`,
    );
  }
}

for (const [sourceFilePath, targetFilePaths] of graph.entries()) {
  const sourceLayer = getLayerName(sourceFilePath);
  const sourceRelativePath = getRepoRelativePath(sourceFilePath);

  if (sourceLayer === "domain") {
    for (const targetFilePath of targetFilePaths) {
      verifyLayerBoundary(sourceFilePath, targetFilePath, new Set(["domain"]));
    }

    continue;
  }

  if (sourceLayer === "application") {
    for (const targetFilePath of targetFilePaths) {
      verifyLayerBoundary(sourceFilePath, targetFilePath, new Set(["application", "domain"]));
    }

    continue;
  }

  if (
    sourceRelativePath === "src/ui/hooks/useMarkdownEditor.ts"
    || sourceRelativePath === "src/ui/hooks/useAppTheme.ts"
    || sourceRelativePath === "src/ui/hooks/useEditorPreferences.ts"
    || sourceRelativePath === "src/ui/hooks/usePreviewPreferences.ts"
    || sourceRelativePath === "src/ui/hooks/useDesktopWorkspaceSplit.ts"
  ) {
    for (const targetFilePath of targetFilePaths) {
      verifyLayerBoundary(sourceFilePath, targetFilePath, new Set(["ui", "application", "adapters", "domain"]));
    }

    continue;
  }

  if (
    sourceRelativePath === "src/ui/screens/MarkdownEditorScreen.tsx"
    || sourceRelativePath === "src/ui/screens/PreviewWindowScreen.tsx"
  ) {
    for (const targetFilePath of targetFilePaths) {
      verifyLayerBoundary(sourceFilePath, targetFilePath, new Set(["ui", "application", "adapters", "domain"]));
    }
  }
}

if (violations.length > 0) {
  console.error("Boundary violation detected");

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exit(1);
}

console.log("Boundary checks passed");
