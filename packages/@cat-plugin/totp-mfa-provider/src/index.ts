import type { CatPlugin, ComponentData } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  services() {
    return [new Provider()];
  }

  components() {
    return [
      {
        name: "user-verify-totp",
        slot: "mfa-verify-totp",
        url: "dist/user-verify-totp.js",
      } satisfies ComponentData,
      {
        name: "user-init-totp",
        slot: "mfa-init-totp",
        url: "dist/user-init-totp.js",
      } satisfies ComponentData,
    ];
  }
}

const plugin = new Plugin();

export default plugin;
