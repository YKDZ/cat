import type {
  BuiltinPluginEntry,
  CatPlugin,
  PluginContext,
} from "@cat/plugin-core";

import { NativePgVectorStorage } from "./native-pgvector-storage.ts";

const systemPgVectorPlugin = {
  services: (ctx: PluginContext) => [new NativePgVectorStorage(ctx)],
} satisfies CatPlugin;

/**
 * @zh 通过标准插件生命周期公开的内置 pgvector 系统插件条目。
 * @en Builtin pgvector system plugin entry exposed through the standard plugin lifecycle.
 */
export const systemPgVectorEntry: BuiltinPluginEntry = {
  manifest: {
    id: "system-pgvector-storage",
    version: "1.0.0",
    entry: "builtin:system-pgvector-storage",
    services: [
      {
        id: "native-pgvector",
        type: "VECTOR_STORAGE",
        dynamic: false,
      },
    ],
  },
  data: {
    id: "system-pgvector-storage",
    name: "system pgvector storage",
    version: "1.0.0",
    overview: "Built-in PostgreSQL pgvector storage service.",
    entry: "builtin:system-pgvector-storage",
  },
  load: () => systemPgVectorPlugin,
};
