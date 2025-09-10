import { useSSCTRPC } from "@/server/trpc/sscClient";
import type { Plugin } from "@cat/shared";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data: {
  (ctx: PageContextServer): Promise<{ plugin: Plugin }>;
} = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  const plugin = await useSSCTRPC(ctx).plugin.query({ id: pluginId });

  if (!plugin) throw redirect("/");

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
