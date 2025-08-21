import type { CatPlugin, PluginLoadOptions } from "@cat/plugin-core";
import { Provider } from "./provider";

export type ProviderConfig = {
  displayName: string;
  scopes: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  authURI: string;
  tokenURI: string;
  userInfoURI: string;
  logoutURI: string;
  jwksURI: string;
};

class Plugin implements CatPlugin {
  private options: PluginLoadOptions | null = null;
  private providerConfigs: ProviderConfig[] = [];

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
    this.providerConfigs = options.configs[
      "base.oidc-providers"
    ] as ProviderConfig[];
  }

  getAuthProviders() {
    return this.providerConfigs.map((config) => new Provider(config));
  }
}

const plugin = new Plugin();

export default plugin;
