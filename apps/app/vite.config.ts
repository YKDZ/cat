import http from "node:http";
import { isAbsolute, relative, resolve } from "node:path";

import { injectApplicationWebSocket } from "@cat/app-api/app";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { telefunc } from "telefunc/vite";
import vike from "vike/plugin";
import { defineConfig, type ViteDevServer } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

import {
  serverExternalPackages,
  serverPluginNoExternal,
  serverWorkspaceNoExternal,
} from "./src/config/server-packages.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const probeRoot = process.env.CAT_E2E_HMR_PROBE_DIRECTORY;
const resolvedProbeRoot =
  probeRoot === undefined ? undefined : resolve(workspaceRoot, probeRoot);

if (resolvedProbeRoot !== undefined) {
  const probeParent = resolve(workspaceRoot, ".tmp/e2e");
  const probePath = relative(probeParent, resolvedProbeRoot);
  if (
    probePath === "" ||
    probePath === ".." ||
    isAbsolute(probePath) ||
    probePath.startsWith("../") ||
    probePath.startsWith("..\\")
  ) {
    throw new Error("CAT_E2E_HMR_PROBE_DIRECTORY must be below .tmp/e2e");
  }
}

const hmrProbeSource = (path: string, fallback: string): string =>
  resolvedProbeRoot === undefined
    ? resolve(import.meta.dirname, fallback)
    : resolve(resolvedProbeRoot, path);

const hmrPrivatePackageRoot = (): string =>
  resolvedProbeRoot === undefined
    ? resolve(import.meta.dirname, "./src/e2e/private-jit")
    : resolve(resolvedProbeRoot, "private-jit");

const hmrProbePaths = (): string[] => [
  hmrProbeSource(
    "application-probe.vue",
    "./src/e2e/hmr-application-default.vue",
  ),
  resolve(hmrPrivatePackageRoot(), "src/probe.vue"),
];

const initializeDevelopmentServer = () => ({
  name: "cat:initialize-development-server",
  configureServer(server: ViteDevServer) {
    // E2E places its private source package below .tmp, outside Vite's root.
    // Aliasing resolves the import, while this registers the actual file events.
    server.watcher.add(hmrProbePaths());
    if (!(server.httpServer instanceof http.Server)) {
      throw new Error(
        "Vite development server has no HTTP/1 server for WebSockets",
      );
    }
    // Vike only calls +server.ts's WebSocket lifecycle in production.
    injectApplicationWebSocket(server.httpServer);
    // Vite's SSR module runner has an isolated global object. The Hono health
    // routes use the host realm, so initialize from this same realm in dev.
    void import("./src/server/initialize.ts")
      .then(async ({ initializeApp }) => await initializeApp())
      .catch((error: unknown) => {
        // This is captured as a framework diagnostic by the execution cell.
        console.error("Failed to initialize development server", error);
      });
  },
});

export default defineConfig({
  ssr: {
    external: [...serverExternalPackages],
    // vue-i18n and @intlify/* reference compile-time constants like
    // __VUE_PROD_DEVTOOLS__ that must be replaced by Vite's `define` plugin.
    // Forcing them to be bundled (not externalized) ensures the replacements apply.
    noExternal: [
      "vue-i18n",
      /^@intlify\//,
      serverWorkspaceNoExternal,
      serverPluginNoExternal,
    ],
  },

  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },

  optimizeDeps: {
    include: [
      "@cat/ui > @vue-flow/controls",
      "@cat/ui > @vue-flow/core",
      "@cat/ui > @vue-flow/minimap",
      "@cat/ui > class-variance-authority",
      "@cat/ui > clsx",
      "@cat/ui > elkjs/lib/elk.bundled.js",
      "@cat/ui > tailwind-merge",
      "pinia-plugin-persistedstate",
    ],
  },

  ...(process.env.CAT_E2E_VITE_CACHE_DIR === undefined
    ? {}
    : { cacheDir: process.env.CAT_E2E_VITE_CACHE_DIR }),

  resolve: {
    alias: [
      {
        find: "#e2e-hmr-application",
        replacement: hmrProbeSource(
          "application-probe.vue",
          "./src/e2e/hmr-application-default.vue",
        ),
      },
      {
        find: "@cat/e2e-hmr-private",
        replacement: hmrPrivatePackageRoot(),
      },
      {
        find: "@cat/plugin-core/client",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-core/src/client/index.ts",
        ),
      },
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
          "../../@cat-plugin/$1/dist/index.js",
        ),
      },
    ],
    conditions: ["source"],
  },

  server: {
    watch: {
      ignored: ["plugins/**"],
    },
  },

  plugins: [
    initializeDevelopmentServer(),
    // @vueuse/core 14.x dist/index.js contains 2 invalid /* #__PURE__ */ annotations
    // (with '#' instead of '@') placed in syntactically wrong positions that Rolldown
    // rejects. Remove them; the correct /* @__PURE__ */ counterparts (57 of them) still
    // handle tree-shaking correctly. Track: https://github.com/vueuse/vueuse/issues
    {
      name: "vite:fix-vueuse-pure-annotations",
      transform: (code: string, id: string) => {
        if (!id.includes("@vueuse/core")) return null;
        return { code: code.replace(/\/\* #__PURE__ \*\/ ?/g, ""), map: null };
      },
    },
    telefunc(),
    vike(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    tailwindcss(),
    ...(process.env.VITE_E2E === "true" ? [] : [vueDevTools()]),
  ],

  build: {
    target: "esnext",
    emptyOutDir: true,
    rolldownOptions: {
      external: [...serverExternalPackages],
    },
  },
});
