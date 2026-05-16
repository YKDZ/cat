import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  if (!pluginId) throw render(404, "Plugin id is required");

  const detail = await ssc(ctx).plugin.getDetail({
    pluginId,
    scopeType: "GLOBAL",
    scopeId: "",
  });

  if (!detail) throw render(404, `Plugin ${pluginId} does not exist`);

  return { detail };
};

export type Data = Awaited<ReturnType<typeof data>>;
