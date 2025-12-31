import type { Plugin } from "@cat/shared/schema/drizzle/plugin";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (
  ctx: PageContextServer,
): Promise<{ plugin: Plugin }> => {
  const { pluginId } = ctx.routeParams;

  if (!pluginId) throw render("/", "Plugin id is required");

  const plugin = await ssc(ctx).plugin.get({
    pluginId,
  });

  if (!plugin) throw render("/", `Plugin ${pluginId} does not exists`);

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
