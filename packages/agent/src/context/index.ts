// ─── Context Resolution Engine ───
export {
  resolveContextVariables,
  type SeedVariables,
  type ResolveOptions,
} from "./resolver.ts";

// ─── Topological Sort ───
export { topoSortProviders, CircularDependencyError } from "./topo-sort.ts";

// ─── Builtin Providers ───
export {
  BuiltinGlossaryProvider,
  BuiltinContextDescriptionProvider,
  BuiltinToolDescriptionProvider,
  createBuiltinProviders,
} from "./builtin-providers.ts";
