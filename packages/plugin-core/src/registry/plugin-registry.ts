import { access, readFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";
import { pathToFileURL } from "url";

const appRequire = createRequire(process.cwd() + "/package.json");

export type CatPlugin = {
  getId(): string;
  onLoaded(): Promise<void>;
};

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, CatPlugin> = new Map();

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  private async findRootPackageJson(): Promise<string> {
    const currentDir = process.cwd();
    const candidate = path.join(currentDir, "package.json");
    try {
      await access(candidate);
      JSON.parse(await readFile(candidate, "utf-8"));
      return candidate;
    } catch (err) {
      console.error(
        "[Plugin] Can not locate or parse package.json. No plugin will be loaded.",
      );
      throw err;
    }
  }

  public async loadPlugins() {
    console.log("Prepared to load plugins...");
    let packageJsonPath: string;
    try {
      packageJsonPath = await this.findRootPackageJson();
    } catch {
      console.error(
        "[Plugin] Aborting plugin load due to missing package.json.",
      );
      return;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const deps = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ].filter((d) => d.startsWith("@cat-plugin/"));

    for (const dep of deps) {
      try {
        let PluginClass;

        try {
          const pluginFsPath = appRequire.resolve(dep);
          // Vite build will sometimes remove inline /* @vite-ignore */ comments
          // and cause runtime warning
          const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
          const imported = await import(/* @vite-ignore */ pluginUrl);
          PluginClass = imported.default ?? imported;
        } catch (importErr) {
          try {
            const required = appRequire(dep);
            PluginClass = required.default ?? required;
          } catch (requireErr) {
            console.error(
              `[Plugin] Failed to load ${dep} via import and require:`,
              importErr instanceof Error ? importErr.message : importErr,
              requireErr instanceof Error ? requireErr.message : requireErr,
            );
            continue;
          }
        }

        await this.loadPlugin(PluginClass);
      } catch (err) {
        console.error(
          `[Plugin] Unexpected error loading ${dep}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private async loadPlugin(PluginClass: new () => CatPlugin) {
    const instance = new PluginClass();

    if (typeof instance.getId !== "function") {
      throw new Error("Plugin must implement getId() method");
    }

    const pluginId = instance.getId();
    if (this.plugins.has(pluginId)) {
      throw new Error(`Duplicate plugin ID: ${pluginId}`);
    }

    this.plugins.set(pluginId, instance);

    if (typeof instance.onLoaded === "function") {
      await instance.onLoaded();
    }

    console.log(`[Plugin] Successfully loaded plugin: ${pluginId}`);
  }
}
