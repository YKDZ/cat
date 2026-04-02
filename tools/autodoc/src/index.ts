// Config
export { defineConfig } from "./types.js";
export type { AutodocConfig } from "./types.js";

// IR
export type {
  SymbolIR,
  ModuleIR,
  PackageIR,
  SourceLocation,
  ParameterIR,
  PropertyIR,
} from "./ir.js";

// Extractor
export {
  extractEnDescription,
  extractEnInline,
  parseTSDoc,
} from "./extractor/tsdoc-parser.js";

// Scanner
export { createPackageScanner } from "./scanner/package-scanner.js";

// Renderers
export { createOverviewRenderer } from "./renderer/overview-renderer.js";
export { createPackageRenderer } from "./renderer/package-renderer.js";
export { createLlmsTxtRenderer } from "./renderer/llms-txt-renderer.js";

// Index
export { buildIndex, loadIndex, findSymbols, saveIndex } from "./ir-index.js";
export type { SymbolIndexEntry } from "./ir-index.js";
