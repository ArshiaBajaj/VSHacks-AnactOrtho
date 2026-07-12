const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/**
 * Monorepo wiring for Metro.
 *
 *  1. `watchFolders` — Metro must watch the shared packages so hot-reload
 *     works when we edit `@courtvision/*`.
 *  2. `nodeModulesPaths` — tell Node where to resolve deps (app first, then
 *     the hoisted root store).
 *  3. `disableHierarchicalLookup` — pin resolution to the two locations
 *     above; prevents Metro from crawling up random directories and finding
 *     phantom copies of React.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// TFLite models ship as raw assets — teach Metro to bundle them.
config.resolver.assetExts.push("tflite", "mlmodel", "mlmodelc", "task");

module.exports = config;
