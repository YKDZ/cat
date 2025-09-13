import { useSSCTRPC } from "@/server/trpc/sscClient";
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { PageContextServer } from "vike/types";

export const data: {
  (ctx: PageContextServer): Promise<{ plugin: Plugin | null }>;
} = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  const plugin = await useSSCTRPC(ctx).plugin.query({ id: pluginId });

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
