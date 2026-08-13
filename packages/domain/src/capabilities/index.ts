export type {
  PluginCapabilities,
  ProjectCapabilities,
  TranslationCapabilities,
} from "#/capabilities/types.ts";
export { createPluginCapabilities } from "#/capabilities/capability-factory.ts";
export {
  GlossaryListByCreatorCapabilityInputSchema,
  MemoryListByCreatorCapabilityInputSchema,
  ProjectListByCreatorCapabilityInputSchema,
  type GlossaryListByCreatorCapabilityInput,
  type MemoryListByCreatorCapabilityInput,
  type ProjectListByCreatorCapabilityInput,
} from "#/capabilities/resource-list-contracts.ts";
