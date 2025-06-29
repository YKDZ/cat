import { useSSCTRPC } from "@/server/trpc/sscClient";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const plugins = await useSSCTRPC(ctx).plugin.listAll();
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
