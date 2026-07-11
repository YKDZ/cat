import { readdirSync } from "node:fs";
import { resolve, sep } from "node:path";

import type { Plugin } from "vite";

const isPluginDistributionFile = (
  pluginRoot: string,
  file: string,
): boolean => {
  const rootPrefix = pluginRoot.endsWith(sep)
    ? pluginRoot
    : `${pluginRoot}${sep}`;
  return file.startsWith(rootPrefix) && file.includes(`${sep}dist${sep}`);
};

export const pluginDistReload = (
  pluginRoot = resolve(import.meta.dirname, "../../../../@cat-plugin"),
): Plugin => ({
  name: "cat-plugin-dist-reload",
  configureServer(server) {
    for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        server.watcher.add(resolve(pluginRoot, entry.name, "dist"));
      }
    }

    const reload = (file: string): void => {
      if (isPluginDistributionFile(pluginRoot, file)) {
        server.ws.send({ type: "full-reload", path: "*" });
      }
    };
    server.watcher.on("add", reload);
    server.watcher.on("change", reload);
    server.watcher.on("unlink", reload);
  },
});
