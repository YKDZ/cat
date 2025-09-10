import { useSSCTRPC } from "@/server/trpc/sscClient";
import type { Plugin } from "@cat/shared";
import type { PageContextServer } from "vike/types";

export const data = async (
  ctx: PageContextServer,
): Promise<{ plugins: Plugin[] }> => {
  const plugins = await useSSCTRPC(ctx).plugin.listAll();
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
