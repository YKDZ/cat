import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { useSSCTRPC } from "@/server/trpc/sscClient.ts";

export const data: {
  (ctx: PageContextServer): Promise<{ plugin: Plugin }>;
} = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  if (!pluginId) throw render("/", "Plugin id is required");

  const plugin = await useSSCTRPC(ctx).plugin.query({ id: pluginId });

  if (!plugin) throw render("/", `Plugin ${pluginId} does not exists`);

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
