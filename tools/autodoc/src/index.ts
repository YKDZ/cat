// Config
export {
  defineConfig,
  defineSubject,
  AutodocConfigSchema,
  PackageConfigSchema,
  SubjectManifestConfigSchema,
  PublicationMemberConfigSchema,
  StructuredAssetConfigSchema,
} from "./types.js";
export type {
  AutodocConfig,
  PackageConfig,
  SubjectManifestConfig,
  PublicationMemberConfig,
  StructuredAssetConfig,
} from "./types.js";

// IR
export type {
  SymbolIR,
  ModuleIR,
  PackageIR,
  SourceLocation,
  ParameterIR,
  PropertyIR,
} from "./ir.js";

// Subjects
export type {
  SectionIR,
  SubjectIR,
  MembershipIR,
  PublicationMemberIR,
} from "./subjects/ir.js";
export {
  SubjectRegistry,
  loadRegistry,
  buildMembershipIndex,
} from "./subjects/registry.js";
export { loadSections } from "./subjects/sections.js";

// Validation
export type {
  ValidationFinding,
  FindingSeverity,
  FindingTier,
} from "./validation/findings.js";
export { hasErrors, formatFindings } from "./validation/findings.js";
export { validateStructural } from "./validation/structural.js";
export { runValidation } from "./validation/run.js";

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

// Semantic
export type {
  SemanticFragment,
  SemanticCatalog,
  FragmentSourceType,
} from "./semantic/ir.js";
export {
  collectFragments,
  collectFragmentsFromString,
} from "./semantic/fragment-collector.js";
export { buildSemanticCatalog } from "./semantic/compiler.js";
export type { SemanticCompilerResult } from "./semantic/compiler.js";

// Assembler
export {
  buildPairedPage,
  buildAllPairedPages,
} from "./assembler/paired-pages.js";
export type { PairedPage } from "./assembler/paired-pages.js";
export {
  buildSectionIndex,
  buildAllSectionIndexes,
} from "./assembler/subject-index.js";
export { buildCompatProjections } from "./assembler/compat-projections.js";
export type { CompatProjections } from "./assembler/compat-projections.js";
export { buildAgentCatalog } from "./assembler/agent-catalog.js";
export type {
  AgentSubjectEntry,
  AgentReferenceEntry,
  AgentCatalogOutput,
} from "./assembler/agent-catalog.js";

// Validation (extended)
export { validateReferenceHealth } from "./validation/reference-health.js";
export { validatePublication } from "./validation/publication.js";

// Reference
export {
  ReferenceCatalog,
  buildReferenceCatalog,
} from "./reference/compiler.js";
export { getSpan } from "./reference/span.js";
export { makeStableKey, isOverloadedInModule } from "./reference/stable-key.js";
export {
  buildSignatureSnapshot,
  detectSignatureDrift,
} from "./reference/signature.js";
export { extractZodSchemaAssets } from "./reference/structured-assets.js";
export type { ZodSchemaAsset } from "./reference/structured-assets.js";

// Index
export { buildIndex, loadIndex, findSymbols, saveIndex } from "./ir-index.js";
export type { SymbolIndexEntry } from "./ir-index.js";
