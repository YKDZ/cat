import { resolve } from "node:path";

import { defineConfig } from "vite";

import {
  serverExternalPackages,
  serverPluginNoExternal,
  serverWorkspaceNoExternal,
} from "./src/config/server-packages.ts";

export default defineConfig({
  ssr: {
    external: [...serverExternalPackages],
    noExternal: [serverWorkspaceNoExternal, serverPluginNoExternal],
  },
  resolve: {
    alias: [
      {
        find: "@cat/plugin-core",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-core/src/index.ts",
        ),
      },
      {
        find: /^@cat-plugin\/([^/]+)$/,
        replacement: resolve(
          import.meta.dirname,
          "../../@cat-plugin/$1/src/index.ts",
        ),
      },
    ],
    conditions: ["source"],
  },
  build: {
    emptyOutDir: true,
    outDir: "dist/bootstrap-only",
    rolldownOptions: { external: [...serverExternalPackages] },
    ssr: "src/server/bootstrap-only-cli.ts",
    target: "esnext",
  },
});
