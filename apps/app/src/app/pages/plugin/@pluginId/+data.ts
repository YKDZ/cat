import { useSSCTRPC } from "@/server/trpc/sscClient";
import { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;
  const { pluginId } = ctx.routeParams;

  const plugin = await useSSCTRPC({ user }).plugin.query({ id: pluginId });

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
