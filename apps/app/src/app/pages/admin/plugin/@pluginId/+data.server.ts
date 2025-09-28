import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  if (!pluginId) throw render("/", "Plugin id is required");

  const plugin = await useSSCTRPC(ctx).plugin.get({ id: pluginId });

  if (!plugin) throw render("/", `Plugin ${pluginId} does not exists`);

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
