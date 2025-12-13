import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const plugins = await useSSCTRPC(ctx).plugin.getAll({});
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
