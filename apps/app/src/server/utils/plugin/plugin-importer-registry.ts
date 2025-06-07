import type { PluginData } from "@cat/shared";
import { githubPluginImporter } from "./github-plugin-importer";
import { tarGZURLImporter } from "./tar-gz-url-plugin-importer";
import { localImporter } from "./local-plugin-impoter";

export interface PluginImporter {
  getOriginName(): string;
  canImportPlugin(origin: Record<string, unknown>): boolean;
  importPlugin(origin: Record<string, unknown>): Promise<PluginData>;
}

export class PluginImporterRegistry {
  private static instance: PluginImporterRegistry;
  private importers: PluginImporter[] = [
    tarGZURLImporter,
    githubPluginImporter,
    localImporter,
  ];

  constructor() {
    if (!PluginImporterRegistry.instance)
      PluginImporterRegistry.instance = this;
    else throw new Error("PluginHandlerRegistry can only have single instance");
  }

  public static getInstance() {
    return this.instance;
  }

  public getHandlers() {
    return this.importers;
  }
}

new PluginImporterRegistry();
