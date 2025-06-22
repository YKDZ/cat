import { useSSCTRPC } from "@/server/trpc/sscClient";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { pluginId } = ctx.routeParams;

  const plugin = await useSSCTRPC(ctx).plugin.query({ id: pluginId });

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
