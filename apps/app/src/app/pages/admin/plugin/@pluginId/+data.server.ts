import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { ssc } from "@/server/ssc";
import type { Plugin, PluginConfig } from "@cat/shared/schema/drizzle/plugin";

export const data = async (
  ctx: PageContextServer,
): Promise<{
  plugin: Plugin;
  config: PluginConfig;
}> => {
  const { pluginId } = ctx.routeParams;

  if (!pluginId) throw render("/", "Plugin id is required");

  const plugin = await ssc(ctx).plugin.get({ pluginId });
  const config = await ssc(ctx).plugin.getConfig({ pluginId });

  if (!plugin || !config)
    throw render("/", `Plugin ${pluginId} does not exists`);

  return { plugin, config };
};

export type Data = Awaited<ReturnType<typeof data>>;
