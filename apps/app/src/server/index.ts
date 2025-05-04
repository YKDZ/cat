import { apply } from "vike-server/hono";
import { serve } from "vike-server/hono/serve";
import app from "./app";
import { userFromSessionId } from "./utils/user";
import { getCookieFunc } from "./utils/cookie";
import "dotenv/config";
import { PluginRegistry } from "@cat/plugin-core";

const port = import.meta.env.PORT ? parseInt(import.meta.env.PORT) : 3000;

apply(app, {
  pageContext: async (runtime) => {
    const cookie = runtime.req?.headers["cookie"] ?? "";
    const sessionId = getCookieFunc(cookie)("sessionId");
    const user = await userFromSessionId(sessionId);
    return {
      user,
      sessionId,
    };
  },
});
const server = serve(app, {
  port,
  onReady: () => {
    PluginRegistry.getInstance().loadPlugins();
  },
});

export default server;
