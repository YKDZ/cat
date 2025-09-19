import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (
  ctx: PageContextServer,
): Promise<{ plugins: WithRequired<Plugin, "Installations">[] }> => {
  const plugins = await useSSCTRPC(ctx).plugin.listAll();
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
