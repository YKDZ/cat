import { useSSCTRPC } from "@/server/trpc/sscClient";
import { Plugin } from "@cat/shared";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (
  ctx: PageContextServer,
): Promise<{ plugin: Plugin }> => {
  const { pluginId } = ctx.routeParams;

  const plugin = await useSSCTRPC(ctx).plugin.query({
    id: pluginId,
  });

  if (!plugin) throw redirect("/");

  return { plugin };
};

export type Data = Awaited<ReturnType<typeof data>>;
